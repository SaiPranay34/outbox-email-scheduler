function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in backend/.env`);
  return value;
}
function positive(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
export const config = {
  database: required("DATABASE_URL"),
  redis: required("REDIS_URL"),
  elastic: required("ELASTICSEARCH_URL"),
  sessionSecret: required("SESSION_SECRET"),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  apiUrl: process.env.API_URL ?? "http://localhost:3001",
  port: positive("PORT", 3001),
  concurrency: positive("WORKER_CONCURRENCY", 5),
  minDelay: positive("MIN_DELAY_MS_BETWEEN_SENDS", 2000),
  hourlyLimit: positive("MAX_EMAILS_PER_HOUR", 200),
  googleId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  slackId: process.env.SLACK_CLIENT_ID ?? "",
  slackSecret: process.env.SLACK_CLIENT_SECRET ?? "",
  smtpUser: required("ETHEREAL_USER"),
  smtpPass: required("ETHEREAL_PASS"),
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  production: process.env.NODE_ENV === "production",
};
if (config.sessionSecret.length < 32) throw new Error("SESSION_SECRET must have at least 32 characters");
