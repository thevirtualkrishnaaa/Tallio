import { HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError } from "./auth";

/** Turns thrown errors into clean JSON responses. */
export function errorResponse(err: unknown, context: InvocationContext): HttpResponseInit {
  if (err instanceof HttpError) {
    return { status: err.status, jsonBody: { error: err.message } };
  }
  context.error(err);
  return { status: 500, jsonBody: { error: "Something went wrong. Please try again." } };
}
