import knex from "knex";
import { config } from "./config.js";
export const db = knex({ client: "pg", connection: config.database, pool: { min: 0, max: 10 } });
