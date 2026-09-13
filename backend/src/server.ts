import express, { type ErrorRequestHandler } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { config } from "./config.js";
import { db } from "./db.js";
import { auth, requireAuth } from "./auth.js";
import { slack } from "./slack.js";
import { emails } from "./emails.js";
import { queue, redis } from "./queue.js";
const app = express();
app.disable("x-powered-by");
if (config.production) app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    name: "outbox.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new (pgSession(session))({ conString: config.database, tableName: "sessions" }),
    cookie: { httpOnly: true, sameSite: "lax", secure: config.production, maxAge: 7 * 86400000 },
  }),
);
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("origin") !== config.appUrl) {
    res.status(403).json({ error: "Request origin is not allowed." });
    return;
  }
  next();
});
app.get("/api/health", async (_req, res) => {
  await db.raw("SELECT 1");
  res.json({ ok: true });
});
app.use("/api/auth", auth);
app.use("/api/slack", slack);
app.use("/api/emails", emails);
const board = new ExpressAdapter();
board.setBasePath("/admin/queues");
createBullBoard({ queues: [new BullMQAdapter(queue, { readOnlyMode: true })], serverAdapter: board });
app.use(
  "/admin/queues",
  requireAuth,
  async (req, res, next) => {
    const user = await db("users").where({ id: req.session.userId }).first("email");
    if (!config.adminEmail || user?.email !== config.adminEmail) {
      res.sendStatus(403);
      return;
    }
    next();
  },
  board.getRouter(),
);
const errors: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = Number(err.status) || 500;
  if (status === 500) console.error("Request failed:", err.code ?? err.name);
  res.status(status).json({ error: status < 500 ? err.message : "Something went wrong. Please try again." });
};
app.use(errors);
const server = app.listen(config.port, () => console.log(`API: ${config.apiUrl}`));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(async () => {
      await queue.close();
      await redis.quit();
      await db.destroy();
      process.exit(0);
    });
  });
