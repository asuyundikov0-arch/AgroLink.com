import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { parseGpsSelection, disconnectedGpsResult } from "./gps-work-area";
import { createGpsWorkAreaRouter } from "../routes/gps-work-area";
import { GetGpsWorkAreaResponse } from "@workspace/api-zod";

const selection = { equipmentId: "1", implement: " Сеялка ", startsAt: "2026-10-31T08:00:00+05:00", endsAt: "2026-10-31T18:00:00+05:00" };

test("GPS selection preserves equipment and implement, normalizes timezone, never invents hectares", () => {
  const parsed = parseGpsSelection(selection);
  assert.equal(parsed.startsAt, "2026-10-31T03:00:00.000Z");
  assert.equal(parsed.implement, "Сеялка");
  const result = disconnectedGpsResult(parsed);
  assert.equal(result.status, "not_connected");
  assert.equal(result.areaHa, null);
  assert.equal(result.equipmentId, 1);
});

test("GPS selection rejects incomplete, repeated, fractional and invalid period inputs", () => {
  for (const changes of [
    { implement: "" }, { implement: " ".repeat(10) }, { implement: "a".repeat(201) },
    { equipmentId: "1.5" }, { equipmentId: "-1" }, { equipmentId: ["1"] },
    { implement: ["Сеялка"] }, { startsAt: "nonsense" },
    { startsAt: "2026-10-31T08:00:00" },
    { endsAt: selection.startsAt }, { endsAt: "2026-10-30T08:00:00Z" },
  ]) assert.throws(() => parseGpsSelection({ ...selection, ...changes }));
});

test("GPS HTTP route limits roles, validates selection and returns honest disconnected response", async () => {
  const app = express();
  let lookups = 0;
  app.use(createGpsWorkAreaRouter((req, res, next) => {
    const role = req.headers["x-test-role"];
    if (!role) { res.status(401).json({ error: "Требуется вход" }); return; }
    res.locals.access = { role };
    next();
  }, async (id) => { lookups++; return id === 1; }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const query = new URLSearchParams(selection).toString();
  const call = (params = query, role?: string) => fetch(`http://127.0.0.1:${port}/agro/gps/work-area?${params}`, { headers: role ? { "x-test-role": role } : {} });
  try {
    assert.equal((await call()).status, 401);
    for (const role of ["agronomist", "engineer", "hr", "weigher"]) assert.equal((await call(query, role)).status, 403);
    assert.equal(lookups, 0);
    assert.equal((await call("equipmentId=1", "dispatcher")).status, 400);
    assert.equal(lookups, 0);
    assert.equal((await call(query.replace("equipmentId=1", "equipmentId=999"), "dispatcher")).status, 404);
    for (const role of ["dispatcher", "general_director"]) {
      const response = await call(query, role);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const result = GetGpsWorkAreaResponse.parse(await response.json());
      assert.equal(result.areaHa, null);
      assert.equal(result.status, "not_connected");
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
