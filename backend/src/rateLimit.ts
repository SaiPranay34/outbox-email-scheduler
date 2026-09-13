import type { Redis } from "ioredis";
// Redis runs the check and increment atomically, even with several workers.
// TIME uses Redis's clock. The key expires after the current UTC hour.
export async function takeHourlySlot(redis: Redis, sender: string, requested: number, maximum: number) {
  const result = (await redis.eval(
    `
    local now = tonumber(redis.call('TIME')[1])
    local window = math.floor(now / 3600)
    local key = KEYS[1] .. ':' .. window
    local nextHour = (window + 1) * 3600
    local limit = math.min(tonumber(ARGV[1]), tonumber(ARGV[2]))
    local previous = tonumber(redis.call('HGET', key, 'limit') or limit)
    limit = math.min(limit, previous)
    redis.call('HSET', key, 'limit', limit)
    redis.call('EXPIREAT', key, nextHour + 60)
    local count = tonumber(redis.call('HGET', key, 'count') or '0')
    if count >= limit then
      return {0, nextHour * 1000, redis.call('HSETNX', key, 'notified', 1), limit}
    end
    count = redis.call('HINCRBY', key, 'count', 1)
    local notify = count == limit and redis.call('HSETNX', key, 'notified', 1) or 0
    return {1, nextHour * 1000, notify, limit}
  `,
    1,
    `outbox:hour:${sender}`,
    requested,
    maximum,
  )) as number[];
  return { allowed: result[0] === 1, nextHour: result[1], notify: result[2] === 1, limit: result[3] };
}
