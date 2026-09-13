export function validateSchedule(input: Record<string, unknown>) {
  const { subject, body, recipients, startTime, delayMs, hourlyLimit, requestId } = input;
  if (typeof subject !== "string" || !subject.trim() || subject.length > 200)
    throw new Error("Subject is required (maximum 200 characters).");
  if (typeof body !== "string" || !body.trim() || body.length > 100000)
    throw new Error("Body is required (maximum 100,000 characters).");
  if (
    !Array.isArray(recipients) ||
    !recipients.length ||
    recipients.length > 10000 ||
    recipients.some((x) => typeof x !== "string" || x.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))
  )
    throw new Error("Provide 1–10,000 valid recipient emails.");
  if (typeof startTime !== "string" || !Number.isFinite(Date.parse(startTime)))
    throw new Error("Choose a valid start time.");
  if (!Number.isSafeInteger(delayMs) || Number(delayMs) < 0 || Number(delayMs) > 86400000)
    throw new Error("Delay must be between 0 and 86,400,000 milliseconds.");
  if (!Number.isSafeInteger(hourlyLimit) || Number(hourlyLimit) < 1)
    throw new Error("Hourly limit must be a positive integer.");
  if (
    typeof requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
  )
    throw new Error("A valid request ID is required.");
  return {
    subject: subject.trim(),
    body,
    recipients: [...new Set((recipients as string[]).map((x) => x.toLowerCase()))],
    startTime,
    delayMs: Number(delayMs),
    hourlyLimit: Number(hourlyLimit),
    requestId,
  };
}
