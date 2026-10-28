import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import express from "express";
import { pool } from "@workspace/db";
import router from "./index";

after(() => pool.end());

test("retired document APIs reject all legacy actions without disabling operational health", async () => {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  try {
    const retired = [
      ["GET", "/templates"],
      ["POST", "/templates"],
      ["GET", "/templates/1"],
      ["DELETE", "/templates/1"],
      ["POST", "/templates/1/download"],
      ["GET", "/templates/1/download"],
      ["GET", "/dashboard/summary"],
      ["GET", "/activity"],
      ["GET", "/reports"],
      ["POST", "/reports"],
      ["POST", "/reports/upload-url"],
      ["PATCH", "/reports/1/status"],
      ["DELETE", "/reports/1"],
      ["GET", "/reports/1/download"],
      ["GET", "/archives"],
    ];
    for (const [method, path] of retired) {
      const response = await fetch(`${base}${path}`, { method });
      assert.equal(response.status, 410, `${method} ${path}`);
      assert.match(await response.text(), /удалены/);
    }
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
});
