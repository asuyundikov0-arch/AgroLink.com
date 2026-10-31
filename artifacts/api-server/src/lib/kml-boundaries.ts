import area from "@turf/area";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { FieldBoundaryGeometry } from "@workspace/db";

type XmlNode = Record<string, unknown>;
function record(value: unknown): XmlNode {
  return value && typeof value === "object" && !Array.isArray(value) ? value as XmlNode : {};
}
function list(value: unknown): unknown[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}
function ring(value: unknown): number[][] {
  const raw = record(record(value).LinearRing).coordinates;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("В KML отсутствуют координаты границы.");
  const points = raw.trim().split(/\s+/).map(item => {
    const values = item.split(",").map(Number);
    if (values.length < 2 || !values.slice(0, 2).every(Number.isFinite)
      || Math.abs(values[0]) > 180 || Math.abs(values[1]) > 90)
      throw new Error("Некорректные координаты KML.");
    return values.slice(0, 2);
  });
  if (points.length < 3 || points.length > 20_000) throw new Error("Некорректное число точек контура.");
  if (points[0][0] !== points.at(-1)![0] || points[0][1] !== points.at(-1)![1]) points.push([...points[0]]);
  if (new Set(points.map(p => p.join(","))).size < 3) throw new Error("Контур не образует поле.");
  return points;
}

/** Read polygon geometry only. Placemark/file names are deliberately never imported. */
export function parseKmlBoundary(xml: string): { geometry: FieldBoundaryGeometry; contourAreaHa: number } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Некорректный XML KML.");
  const document = new XMLParser({ removeNSPrefix: true, parseTagValue: false, processEntities: false }).parse(xml);
  const polygons: XmlNode[] = [];
  const walk = (value: unknown) => {
    for (const [key, child] of Object.entries(record(value))) {
      if (key === "Polygon") polygons.push(...list(child).map(record));
      else for (const item of list(child)) walk(item);
    }
  };
  walk(document);
  if (polygons.length !== 1) throw new Error("Ожидается один полигон поля в каждом KML.");
  const polygon = polygons[0];
  const geometry: FieldBoundaryGeometry = {
    type: "Polygon",
    coordinates: [ring(polygon.outerBoundaryIs), ...list(polygon.innerBoundaryIs).map(ring)],
  };
  const contourAreaHa = Math.round(area(geometry as Parameters<typeof area>[0]) / 100) / 100;
  if (!Number.isFinite(contourAreaHa) || contourAreaHa <= 0) throw new Error("Площадь контура должна быть положительной.");
  return { geometry, contourAreaHa };
}
