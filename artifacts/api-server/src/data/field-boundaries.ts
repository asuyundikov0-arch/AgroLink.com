import kml1 from "../../../../attached_assets/1_(пш,_тв)_1793457000538.kml";
import kml2 from "../../../../attached_assets/2_(пар)_1793457000538.kml";
import kml3 from "../../../../attached_assets/3_(рапс)_1793457000538.kml";
import kml4 from "../../../../attached_assets/4_(чечевица)_1793457000538.kml";
import kml5 from "../../../../attached_assets/5_(пш._Мяг)_1793457000538.kml";
import kml6 from "../../../../attached_assets/6_(пш._Тв)_1793457000538.kml";
import kml7 from "../../../../attached_assets/7_(_пш._мяг)_1793457000538.kml";
import kml8 from "../../../../attached_assets/8_(рапс)_1793457000538.kml";
import kml11 from "../../../../attached_assets/Ячмень_1793457000538.kml";
import type { FieldBoundaryImport } from "../lib/import-field-boundaries";

export const initialFieldBoundaries: FieldBoundaryImport[] = [
  ["1", kml1], ["2", kml2], ["3", kml3], ["4", kml4], ["5", kml5],
  ["6", kml6], ["7", kml7], ["8", kml8], ["1/1", kml11],
].map(([number, kml]) => ({ number, kml, unit: "АПК Арыстан Grain" }));
