import { Router, type IRouter } from "express";
import { and, count, eq } from "drizzle-orm";
import { ListArchivesResponse } from "@workspace/api-zod";
import { db, reportsTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";

const router: IRouter = Router();

export const archiveStructure = [
  {
    section: "agronomical",
    sectionLabel: "Агрономический",
    subarchives: [
      { key: "seeding_reports", label: "Отчёты о посеве" },
      { key: "chemistry_reports", label: "Отчёт по химии" },
      { key: "harvesting_reports", label: "Отчёт по уборке" },
      { key: "crop_rotations", label: "Севобороты" },
      { key: "tech_maps", label: "Техкарты" },
    ],
  },
  { section: "engineering", sectionLabel: "Инженерский", subarchives: [{ key: "general", label: "Общие документы" }] },
  { section: "economic", sectionLabel: "Экономический", subarchives: [{ key: "general", label: "Общие документы" }] },
  { section: "accounting", sectionLabel: "Бухгалтерский", subarchives: [{ key: "general", label: "Общие документы" }] },
  { section: "legal", sectionLabel: "Юридический", subarchives: [{ key: "general", label: "Общие документы" }] },
] as const;

type ArchiveSection = (typeof archiveStructure)[number]["section"];
type ArchiveSubarchive = (typeof archiveStructure)[number]["subarchives"][number]["key"];

export function isArchiveTarget(section: string | undefined, subarchive: string | undefined): section is ArchiveSection {
  return Boolean(section && subarchive && archiveStructure.some((entry) => entry.section === section && entry.subarchives.some((item) => item.key === subarchive)));
}

router.get("/archives", requireApprovedRole, async (_req, res, next) => {
  try {
    const totals = await db
      .select({
        section: reportsTable.archiveSection,
        subarchive: reportsTable.archiveSubarchive,
        documentCount: count(),
      })
      .from(reportsTable)
      .where(and(eq(reportsTable.status, "archived")))
      .groupBy(reportsTable.archiveSection, reportsTable.archiveSubarchive);

    const access = res.locals.access as RoleAccess;
    const allowedSections = access.role === "general_director"
      ? null
      : access.role === "engineer" || access.role === "chief_engineer"
        ? ["engineering"]
        : access.role === "economist" || access.role === "farm_director"
          ? ["economic"]
          : access.role === "lawyer"
            ? ["legal"]
            : ["agronomical"];
    const countByCell = new Map(totals.map((item) => [`${item.section}:${item.subarchive}`, Number(item.documentCount)]));
    const cells = archiveStructure
      .filter((entry) => !allowedSections || allowedSections.includes(entry.section))
      .flatMap((entry) => entry.subarchives.map((subarchive) => ({
      section: entry.section,
      subarchive: subarchive.key,
      sectionLabel: entry.sectionLabel,
      subarchiveLabel: subarchive.label,
      documentCount: countByCell.get(`${entry.section}:${subarchive.key}`) ?? 0,
      })));
    res.json(ListArchivesResponse.parse(cells));
  } catch (error) {
    next(error);
  }
});

export default router;