import { db } from "./db.js";
// A single transactional schema setup is sufficient for this assignment.
await db.transaction(async (tx) => {
  await tx.raw("SELECT pg_advisory_xact_lock(482001)");
  if (await tx.schema.hasTable("users")) return;
  await tx.schema.createTable("users", (t) => {
    t.uuid("id").primary();
    t.string("google_id").notNullable().unique();
    t.string("email").notNullable();
    t.string("name").notNullable();
    t.text("avatar");
    t.text("slack_webhook");
    t.string("slack_team");
  });
  await tx.schema.createTable("sessions", (t) => {
    t.string("sid").primary();
    t.json("sess").notNullable();
    t.timestamp("expire").notNullable().index();
  });
  await tx.schema.createTable("emails", (t) => {
    t.uuid("id").primary();
    t.uuid("user_id").references("id").inTable("users").notNullable();
    t.uuid("request_id").notNullable();
    t.string("request_hash", 64).notNullable();
    t.string("recipient").notNullable();
    t.string("subject").notNullable();
    t.text("body").notNullable();
    t.string("status").notNullable().defaultTo("scheduled");
    t.integer("hourly_limit").notNullable();
    t.integer("delay_ms").notNullable();
    t.timestamp("scheduled_at", { useTz: true }).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(tx.fn.now());
    t.timestamp("sent_at", { useTz: true });
    t.text("error");
    t.text("preview_url");
    t.boolean("indexed").notNullable().defaultTo(false);
    t.integer("version").notNullable().defaultTo(1);
    t.unique(["user_id", "request_id", "recipient"]);
    t.index(["user_id", "status"]);
  });
});
await db.destroy();
console.log("Database ready.");
