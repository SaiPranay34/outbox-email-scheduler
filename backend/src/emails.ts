import { validateSchedule } from "./validate.js";
import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db.js";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";
import { enqueue } from "./queue.js";
import { searchEmails } from "./search.js";
export const emails = Router();
emails.use(requireAuth);
emails.post("/", async (req, res) => {
  let input;
  try {
    input = validateSchedule(req.body ?? {});
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  const userId = req.session.userId!,
    hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const rows = await db.transaction(async (tx) => {
    // Serializes retries of the same HTTP request, not all users or all scheduling.
    await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [userId + input.requestId]);
    const previous = await tx("emails").where({ user_id: userId, request_id: input.requestId });
    if (previous.length) {
      if (previous[0].request_hash !== hash)
        throw Object.assign(new Error("This request ID was already used for different content."), {
          status: 409,
        });
      return previous;
    }
    const start = Date.parse(input.startTime);
    if (start < Date.now() - 60000 || start > Date.now() + 365 * 86400000)
      throw Object.assign(new Error("Start time must be in the future and within one year."), {
        status: 400,
      });
    const records = input.recipients.map((recipient, i) => ({
      id: randomUUID(),
      user_id: userId,
      request_id: input.requestId,
      request_hash: hash,
      recipient,
      subject: input.subject,
      body: input.body,
      hourly_limit: Math.min(input.hourlyLimit, config.hourlyLimit),
      delay_ms: Math.max(input.delayMs, config.minDelay),
      scheduled_at: new Date(start + i * Math.max(input.delayMs, config.minDelay)),
    }));
    for (let i = 0; i < records.length; i += 200) await tx("emails").insert(records.slice(i, i + 200));
    return records;
  });
  // A committed request remains accepted even if Redis is down; recovery will enqueue it.
  // Bound the wait so the browser does not hang during a Redis outage.
  const pending = Promise.all(rows.map((row) => enqueue(row.id, row.scheduled_at)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    pending.catch(() => {}),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 2000);
    }),
  ]);
  clearTimeout(timer);
  res.status(202).json({ count: rows.length });
});
emails.get("/", async (req, res) => {
  const status = req.query.status === "sent" ? "sent" : "scheduled";
  // The dashboard's Sent Emails tab is also the required place to surface failed
  // delivery attempts. Failed rows are intentionally never retried automatically,
  // because SMTP acceptance cannot be proven after an interrupted attempt.
  const statuses = status === "sent" ? ["sent", "failed"] : ["scheduled"];
  const page = Math.min(399, Math.max(0, Math.floor(Number(req.query.page) || 0)));
  const query = String(req.query.q ?? "")
    .trim()
    .slice(0, 200);
  const base = db("emails").where({ user_id: req.session.userId }).whereIn("status", statuses);
  if (query) {
    try {
      base.whereIn("id", await searchEmails(req.session.userId!, statuses, query, page));
    } catch {
      res.status(503).json({ error: "Search is temporarily unavailable. Clear the search to view emails." });
      return;
    }
  } else base.offset(page * 25);
  const rows = await base
    .orderBy("created_at", "desc")
    .orderBy("id")
    .limit(25)
    .select("id", "recipient", "subject", "body", "status", "scheduled_at", "sent_at", "preview_url");
  const failed = await db("emails")
    .where({ user_id: req.session.userId, status: "failed" })
    .count("* as count")
    .first();
  res.json({ emails: rows, hasMore: rows.length === 25, failed: Number(failed?.count ?? 0) });
});
