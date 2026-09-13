import { Client } from "@elastic/elasticsearch";
import { config } from "./config.js";
import { db } from "./db.js";
const elastic = new Client({ node: config.elastic, requestTimeout: 5000, maxRetries: 0 });
const index = "outbox-emails";
export async function setupSearch() {
  if (await elastic.indices.exists({ index })) return;
  await elastic.indices.create({
    index,
    mappings: {
      properties: {
        user_id: { type: "keyword" },
        status: { type: "keyword" },
        recipient: { type: "text" },
        subject: { type: "text" },
        created_at: { type: "date" },
        scheduled_at: { type: "date" },
        sent_at: { type: "date" },
      },
    },
  });
}
export async function indexPending() {
  for (const row of await db("emails").where({ indexed: false }).limit(200)) {
    await elastic.index({
      index,
      id: row.id,
      version: row.version,
      version_type: "external_gte",
      document: {
        user_id: row.user_id,
        subject: row.subject,
        recipient: row.recipient,
        status: row.status,
        created_at: row.created_at,
        scheduled_at: row.scheduled_at,
        sent_at: row.sent_at,
      },
    });
    // Do not acknowledge an older version if the worker changed this row meanwhile.
    await db("emails").where({ id: row.id, version: row.version }).update({ indexed: true });
  }
}
export async function searchEmails(userId: string, statuses: string[], query: string, page: number) {
  const result = await elastic.search({
    index,
    size: 25,
    from: page * 25,
    sort: [{ created_at: "desc" }],
    query: {
      bool: {
        filter: [{ term: { user_id: userId } }, { terms: { status: statuses } }],
        must: [{ simple_query_string: { query, fields: ["subject", "recipient"] } }],
      },
    },
  });
  return result.hits.hits.map((hit) => hit._id!);
}
