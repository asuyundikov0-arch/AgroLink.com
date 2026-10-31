import assert from "node:assert/strict";
import test from "node:test";
import { distanceToBoundaryM, isInside, locate, rankBoundaries, type GeoBoundary } from "./geo";

// ~1.1 km square near Kostanay with a hole in the middle
const outer = [[63.6, 53.2], [63.616, 53.2], [63.616, 53.21], [63.6, 53.21], [63.6, 53.2]];
const hole = [[63.606, 53.204], [63.61, 53.204], [63.61, 53.206], [63.606, 53.206], [63.606, 53.204]];
const A: GeoBoundary = { fieldId: 1, coordinates: [outer, hole] };
const B: GeoBoundary = { fieldId: 2, coordinates: [[[63.62, 53.2], [63.63, 53.2], [63.63, 53.21], [63.62, 53.21], [63.62, 53.2]]] };

test("point inside polygon", () => {
  assert.equal(isInside([63.602, 53.202], A.coordinates), true);
  const v = locate([63.602, 53.202], 5, [A, B]);
  assert.equal(v.kind, "inside");
  if (v.kind === "inside") { assert.equal(v.fieldId, 1); assert.equal(v.certain, true); }
});

test("point inside hole is not inside field", () => {
  assert.equal(isInside([63.608, 53.205], A.coordinates), false);
  const v = locate([63.608, 53.205], 5, [A]);
  assert.equal(v.kind, "outside");
  if (v.kind === "outside") assert.ok(v.distanceM > 50 && v.distanceM < 150, `hole edge distance ${v.distanceM}`);
});

test("point on edge", () => {
  assert.equal(locate([63.608, 53.2], 5, [A]).kind, "edge");
});

test("outside point reports nearest boundary distance, not centroid", () => {
  const p: [number, number] = [63.618, 53.205];
  const v = locate(p, 5, [A, B]);
  assert.equal(v.kind, "outside");
  if (v.kind === "outside") {
    assert.equal(v.fieldId, 1);
    // 0.002 deg lon at 53.2N ~ 133 m
    assert.ok(Math.abs(v.distanceM - 133.5) < 3, String(v.distanceM));
  }
});

test("GPS accuracy crossing boundary makes verdict uncertain", () => {
  const v = locate([63.6005, 53.205], 100, [A]);
  assert.equal(v.kind, "inside");
  if (v.kind === "inside") assert.equal(v.certain, false);
  const o = locate([63.5995, 53.205], 100, [A]);
  assert.equal(o.kind, "outside");
  if (o.kind === "outside") assert.equal(o.certain, false);
});

test("multiple rings: distance uses closest ring", () => {
  const nearHole = distanceToBoundaryM([63.6058, 53.205], A.coordinates);
  assert.ok(nearHole < 20, String(nearHole));
  const r = rankBoundaries([63.6058, 53.205], [B, A]);
  assert.deepEqual(r.map((x) => x.fieldId), [1, 2]);
  assert.equal(r[0].inside, true);
  assert.equal(r[0].distanceM, 0);
});

test("empty input", () => {
  assert.equal(locate([0, 0], 5, []).kind, "none");
});
