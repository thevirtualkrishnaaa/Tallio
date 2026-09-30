import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getPool } from "../db";

// GET /api/health  -> checks the API is running and can reach PostgreSQL
app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async (_req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const { rows } = await getPool().query(
        "SELECT current_user AS db_user, (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tables"
      );
      return { jsonBody: { ok: true, database: "connected", ...rows[0] } };
    } catch (err) {
      context.error("Health check failed", err);
      return { status: 500, jsonBody: { ok: false, database: "unreachable" } };
    }
  },
});
