import app from "./app";
import { logger } from "./lib/logger";
import { migrateLegacyRepairs } from "./lib/repair-ledger";
import { ensureGrainDefaults } from "./lib/grain-defaults";
import { db } from "@workspace/db";
import { importFieldBoundaries } from "./lib/import-field-boundaries";
import { initialFieldBoundaries } from "./data/field-boundaries";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
await migrateLegacyRepairs();
await ensureGrainDefaults();
await db.transaction(tx => importFieldBoundaries(tx, initialFieldBoundaries, "initial-uploaded-field-contours"));
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
}
start().catch((err) => {
  logger.error({ err }, "Unable to initialize application");
  process.exit(1);
});
