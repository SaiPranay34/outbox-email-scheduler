import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { validateSchedule } from "../src/validate.js";
import { takeHourlySlot } from "../src/rateLimit.js";
test("schedule validation rejects invalid data and removes duplicate recipients", () => {
  const input = {
    subject: "Hello",
    body: "Welcome",
    recipients: ["a@example.com", "A@example.com"],
    startTime: new Date().toISOString(),
    delayMs: 2000,
    hourlyLimit: 3,
    requestId: randomUUID(),
  };
  assert.equal(validateSchedule(input).recipients.length, 1);
  assert.throws(() => validateSchedule({ ...input, recipients: ["bad"] }));
  assert.throws(() => validateSchedule({ ...input, hourlyLimit: 0 }));
});
test(
  "Redis hourly cap is atomic across concurrent requests",
  { skip: !process.env.TEST_REDIS_URL },
  async () => {
    const redis = new Redis(process.env.TEST_REDIS_URL!, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    const sender = `test-${randomUUID()}`;
    try {
      const slots = await Promise.all(Array.from({ length: 20 }, () => takeHourlySlot(redis, sender, 3, 10)));
      assert.equal(slots.filter((x) => x.allowed).length, 3);
      assert.equal(slots.filter((x) => x.notify).length, 1);
      assert.ok(slots.every((x) => x.nextHour > Date.now()));
      const other = await takeHourlySlot(redis, `${sender}-other`, 3, 10);
      assert.equal(other.allowed, true);
      const stricter = await takeHourlySlot(redis, sender, 1, 10);
      assert.equal(stricter.allowed, false);
    } finally {
      try {
        for (const key of await redis.keys(`outbox:hour:${sender}*`)) await redis.del(key);
      } finally {
        redis.disconnect();
      }
    }
  },
);
