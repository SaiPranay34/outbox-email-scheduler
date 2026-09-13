import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { db } from "./db.js";
export const redis = new Redis(config.redis, { maxRetriesPerRequest: null });
export const queue = new Queue("emails", { connection: redis });
redis.on("error", () => console.error("Redis unavailable; waiting for reconnection."));
export async function enqueue(id: string, scheduledAt: Date) {
  await queue.add(
    "send",
    { id },
    {
      jobId: id,
      delay: Math.max(0, +new Date(scheduledAt) - Date.now()),
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  );
}
export async function recoverJobs() {
  // Repairs the DB-commit/queue-add gap and lost Redis jobs. SMTP only runs in the worker.
  // Scan in pages so a large history does not create one large memory allocation.
  let after = "";
  while (true) {
    const query = db("emails").where({ status: "scheduled" }).orderBy("id").limit(200);
    if (after) query.where("id", ">", after);
    const rows = await query;
    if (!rows.length) break;
    for (const row of rows) {
      const job = await queue.getJob(row.id);
      if (!job) await enqueue(row.id, row.scheduled_at);
      else if ((await job.getState()) === "failed") await job.retry();
    }
    after = rows.at(-1).id;
  }
}
