import { Worker, Queue, DelayedError } from "bullmq";
import nodemailer from "nodemailer";
import { config } from "./config.js";
import { db } from "./db.js";
import { redis, queue, recoverJobs } from "./queue.js";
import { takeHourlySlot } from "./rateLimit.js";
import { notifyLimit } from "./slack.js";
import { setupSearch, indexPending } from "./search.js";
const smtp = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  secure: false,
  auth: { user: config.smtpUser, pass: config.smtpPass },
  connectionTimeout: 15000,
  socketTimeout: 30000,
});
const worker = new Worker(
  "emails",
  async (job, token) => {
    const email = await db("emails").where({ id: job.data.id }).first();
    if (!email || email.status !== "scheduled") return;
    const slot = await takeHourlySlot(redis, email.user_id, email.hourly_limit, config.hourlyLimit);
    if (slot.notify) await notifyLimit(email.user_id, slot.limit);
    if (!slot.allowed) {
      await db("emails")
        .where({ id: email.id, status: "scheduled" })
        .update({ scheduled_at: new Date(slot.nextHour), indexed: false, version: db.raw("version + 1") });
      await job.moveToDelayed(slot.nextHour, token);
      throw new DelayedError();
    }
    // Use BullMQ's shared limiter for a longer requested gap, including after downtime.
    await queue.rateLimit(Math.max(email.delay_ms, config.minDelay));
    // Claim before SMTP. A replay cannot call SMTP again. An interrupted attempt stays
    // failed/uncertain, because SMTP cannot prove whether it already accepted the email.
    const claimed = await db("emails")
      .where({ id: email.id, status: "scheduled" })
      .update({
        status: "failed",
        error: "Delivery interrupted or uncertain; not automatically retried.",
        indexed: false,
        version: db.raw("version + 1"),
      });
    if (!claimed) return;
    const user = await db("users").where({ id: email.user_id }).first("email", "name");
    try {
      console.log(`Sending email to ${email.recipient}...`);
      const result = await smtp.sendMail({
        from: { name: user.name, address: config.smtpUser },
        replyTo: user.email,
        to: email.recipient,
        subject: email.subject,
        text: email.body,
        messageId: `<${email.id}@outbox.local>`,
      });
      await db("emails")
        .where({ id: email.id })
        .update({
          status: "sent",
          sent_at: new Date(),
          error: null,
          preview_url: nodemailer.getTestMessageUrl(result) || null,
          indexed: false,
          version: db.raw("version + 1"),
        });
        console.log(`Email sent successfully to ${email.recipient}.`);
    } catch {
      await db("emails")
        .where({ id: email.id })
        .update({ error: "SMTP failed or acceptance is uncertain; automatic resend disabled." });
    }
  },
  { connection: redis, concurrency: config.concurrency, limiter: { max: 1, duration: config.minDelay } },
);
worker.on("error", () => console.error("Worker connection error."));
worker.on("failed", (job) => console.error("Job failed before delivery:", job?.id));
// Maintenance is itself a delayed BullMQ job, not a cron or an email-send timer.
const maintenanceQueue = new Queue("maintenance", { connection: redis });
const maintenance = new Worker(
  "maintenance",
  async (job, token) => {
    try {
      await recoverJobs();
    } catch {
      console.error("Queue recovery will retry.");
    }
    try {
      await setupSearch();
      await indexPending();
    } catch {
      console.error("Search indexing will retry.");
    }
    await job.moveToDelayed(Date.now() + 10000, token);
    throw new DelayedError();
  },
  { connection: redis },
);
maintenance.on("error", () => console.error("Maintenance connection error."));
await maintenanceQueue.add(
  "recover",
  {},
  { jobId: "recovery", attempts: 1000000, backoff: { type: "fixed", delay: 10000 } },
);
const recovery = await maintenanceQueue.getJob("recovery");
if (recovery && (await recovery.getState()) === "failed") await recovery.retry();
console.log("Email worker ready.");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await worker.close();
    await maintenance.close();
    await maintenanceQueue.close();
    await queue.close();
    await redis.quit();
    await db.destroy();
    process.exit(0);
  });
