import type { ZodError } from "zod";

/** An error whose message is safe to show to the user. */
export class UserError extends Error {}

export function zodMessage(error: ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "Invalid input";
}
