import { Router, type RequestHandler } from "express";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { db } from "./db.js";
import { config } from "./config.js";
declare module "express-session" {
  interface SessionData {
    userId?: string;
    google?: { state: string; verifier: string; nonce: string; expires: number };
    slack?: { state: string; expires: number };
  }
}
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Please log in." });
    return;
  }
  next();
};
export const auth = Router();
const google = new OAuth2Client(
  config.googleId,
  config.googleSecret,
  `${config.apiUrl}/api/auth/google/callback`,
);
auth.get("/me", requireAuth, async (req, res) => {
  const user = await db("users")
    .where({ id: req.session.userId })
    .first("id", "email", "name", "avatar", "slack_team");
  if (!user) {
    res.status(401).json({ error: "Session expired." });
    return;
  }
  res.json({ ...user, admin: user.email === config.adminEmail });
});
auth.get("/google", (req, res) => {
  if (!config.googleId || !config.googleSecret) {
    res.status(503).send("Set Google OAuth credentials in backend/.env.");
    return;
  }
  const state = randomBytes(32).toString("hex"),
    verifier = randomBytes(32).toString("base64url"),
    nonce = randomBytes(24).toString("hex");
  req.session.google = { state, verifier, nonce, expires: Date.now() + 600000 };
  req.session.save((err) => {
    if (err) {
      res.status(500).send("Could not save login session.");
      return;
    }
    res.redirect(
      google.generateAuthUrl({
        scope: ["openid", "email", "profile"],
        state,
        nonce,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: CodeChallengeMethod.S256,
      }),
    );
  });
});
auth.get("/google/callback", async (req, res) => {
  const expected = req.session.google;
  delete req.session.google;
  try {
    await new Promise<void>((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    if (
      !expected ||
      expected.expires < Date.now() ||
      req.query.state !== expected.state ||
      typeof req.query.code !== "string"
    )
      throw new Error("Expired login");
    const { tokens } = await google.getToken({ code: req.query.code, codeVerifier: expected.verifier });
    const profile = (
      await google.verifyIdToken({ idToken: tokens.id_token!, audience: config.googleId })
    ).getPayload();
    if (
      !profile?.email_verified ||
      !profile.email ||
      (profile as typeof profile & { nonce?: string }).nonce !== expected.nonce
    )
      throw new Error("Invalid identity");
    const [user] = await db("users")
      .insert({
        id: randomUUID(),
        google_id: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.email,
        avatar: profile.picture,
      })
      .onConflict("google_id")
      .merge(["email", "name", "avatar"])
      .returning("id");
    await new Promise<void>((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    res.redirect(config.appUrl);
  } catch {
    res.redirect(`${config.appUrl}/?error=Google%20login%20failed.%20Please%20try%20again.`);
  }
});
auth.post("/logout", (req, res, next) =>
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("outbox.sid");
    res.sendStatus(204);
  }),
);
