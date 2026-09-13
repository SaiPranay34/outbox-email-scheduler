import { Router } from "express";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { db } from "./db.js";
import { requireAuth } from "./auth.js";
export const slack = Router();
slack.use(requireAuth);
slack.get("/connect", (req, res) => {
  if (!config.slackId || !config.slackSecret) {
    res.status(503).send("Set Slack OAuth credentials in backend/.env.");
    return;
  }
  const state = randomBytes(32).toString("hex");
  req.session.slack = { state, expires: Date.now() + 600000 };
  req.session.save((err) => {
    if (err) {
      res.status(500).send("Could not save OAuth session.");
      return;
    }
    res.redirect(
      `https://slack.com/oauth/v2/authorize?${new URLSearchParams({
        client_id: config.slackId,
        scope: "incoming-webhook",
        state,
        redirect_uri: `${config.apiUrl}/api/slack/callback`,
      })}`,
    );
  });
});
slack.get("/callback", async (req, res) => {
  const expected = req.session.slack;
  delete req.session.slack;
  try {
    await new Promise<void>((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    if (
      !expected ||
      expected.expires < Date.now() ||
      req.query.state !== expected.state ||
      typeof req.query.code !== "string"
    )
      throw new Error("Invalid OAuth state");
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        client_id: config.slackId,
        client_secret: config.slackSecret,
        code: req.query.code,
        redirect_uri: `${config.apiUrl}/api/slack/callback`,
      }),
    });
    const data = (await response.json()) as {
      ok: boolean;
      incoming_webhook?: { url: string };
      team?: { name: string };
    };
    const url = data.incoming_webhook?.url;
    if (!response.ok || !data.ok || !url?.startsWith("https://hooks.slack.com/services/"))
      throw new Error("Slack OAuth failed");
    await db("users")
      .where({ id: req.session.userId })
      .update({ slack_webhook: url, slack_team: data.team?.name ?? "Connected" });
    res.redirect(config.appUrl);
  } catch {
    res.redirect(`${config.appUrl}/?error=Slack%20connection%20failed.`);
  }
});
slack.delete("/", async (req, res) => {
  await db("users").where({ id: req.session.userId }).update({ slack_webhook: null, slack_team: null });
  res.sendStatus(204);
});
export async function notifyLimit(userId: string, limit: number) {
  const user = await db("users").where({ id: userId }).first("slack_webhook");
  if (!user?.slack_webhook) return;
  try {
    const response = await fetch(user.slack_webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Outbox: hourly limit of ${limit} reached. Remaining emails will resume in the next hour.`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error("Slack notification failed:", response.status);
  } catch {
    console.error("Slack notification unavailable. Email scheduling continues.");
  }
}
