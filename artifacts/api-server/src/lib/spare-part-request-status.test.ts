import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSparePartRequestStatus } from "./spare-part-request-status";

test("a request stays active while any approved item is awaiting delivery", () => {
  assert.equal(aggregateSparePartRequestStatus(["received", "awaiting_delivery"]), "awaiting_delivery");
});

test("a partially approved request completes after every item is received or rejected", () => {
  assert.equal(aggregateSparePartRequestStatus(["received", "rejected"]), "completed");
});

test("all returned items return the request to the engineer", () => {
  assert.equal(aggregateSparePartRequestStatus(["returned_to_engineer"]), "returned_to_engineer");
});

test("a mixed request with director and chief review items remains in review", () => {
  assert.equal(aggregateSparePartRequestStatus(["director_review", "chief_review"]), "director_review");
});

test("a request with no approved or received items is rejected", () => {
  assert.equal(aggregateSparePartRequestStatus(["rejected", "rejected"]), "rejected");
});
