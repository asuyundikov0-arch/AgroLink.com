import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import pointToLineDistance from "@turf/point-to-line-distance";

/** GeoJSON polygon rings: [outer, ...holes], each [lng, lat][] */
export type Rings = number[][][];
export interface GeoBoundary { fieldId: number; coordinates: Rings }

export const EDGE_TOLERANCE_M = 0.5;

/** Distance in metres from point to the nearest polygon ring edge (outer or hole). */
export function distanceToBoundaryM(lngLat: [number, number], rings: Rings): number {
  let best = Infinity;
  for (const ring of rings) {
    if (ring.length < 2) continue;
    const d = pointToLineDistance(lngLat, { type: "LineString", coordinates: ring }, { units: "meters" });
    if (d < best) best = d;
  }
  return best;
}

export function isInside(lngLat: [number, number], rings: Rings): boolean {
  if (!rings.length || rings[0].length < 4) return false;
  return booleanPointInPolygon(lngLat, { type: "Polygon", coordinates: rings });
}

export type LocationVerdict =
  | { kind: "none" }
  | { kind: "inside"; fieldId: number; edgeM: number; certain: boolean }
  | { kind: "edge"; fieldId: number }
  | { kind: "outside"; fieldId: number; distanceM: number; certain: boolean };

export interface Ranked { fieldId: number; inside: boolean; distanceM: number }

/** Rank boundaries by true boundary distance (0 for inside). */
export function rankBoundaries(lngLat: [number, number], items: GeoBoundary[]): Ranked[] {
  return items
    .map((b) => ({ fieldId: b.fieldId, inside: isInside(lngLat, b.coordinates), edge: distanceToBoundaryM(lngLat, b.coordinates) }))
    .map((r) => ({ fieldId: r.fieldId, inside: r.inside, distanceM: r.inside ? 0 : r.edge, edge: r.edge }))
    .sort((a, b) => a.distanceM - b.distanceM || a.fieldId - b.fieldId)
    .map(({ fieldId, inside, distanceM }) => ({ fieldId, inside, distanceM }));
}

/**
 * Honest location verdict. `accuracyM` is GPS radius; if it reaches a boundary, result is uncertain.
 */
export function locate(lngLat: [number, number], accuracyM: number, items: GeoBoundary[]): LocationVerdict {
  if (!items.length) return { kind: "none" };
  const acc = Math.max(0, accuracyM || 0);
  let nearest: { fieldId: number; d: number } | null = null;
  for (const b of items) {
    const edge = distanceToBoundaryM(lngLat, b.coordinates);
    if (edge <= EDGE_TOLERANCE_M) return { kind: "edge", fieldId: b.fieldId };
    if (isInside(lngLat, b.coordinates)) return { kind: "inside", fieldId: b.fieldId, edgeM: edge, certain: edge > acc };
    if (!nearest || edge < nearest.d) nearest = { fieldId: b.fieldId, d: edge };
  }
  if (!nearest || !Number.isFinite(nearest.d)) return { kind: "none" };
  return { kind: "outside", fieldId: nearest.fieldId, distanceM: nearest.d, certain: nearest.d > acc };
}

export function distanceText(m: number): string {
  if (m < 1000) return `${Math.round(m)} м`;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: m < 10000 ? 2 : 1 }).format(m / 1000)} км`;
}
