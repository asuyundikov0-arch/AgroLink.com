import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateReportBody,
  CreateReportResponse,
  ListReportsQueryParams,
  ListReportsResponse,
  UpdateReportStatusBody,
  UpdateReportStatusParams,
  UpdateReportStatusResponse,
} from "@workspace/api-zod";
import { db, reportsTable } from "@workspace/db";

const router: IRouter = Router();

const allowedStatuses = ["submitted", "in_review", "returned", "approved", "sent_to_management"] as const;
type ReportStatus = typeof allowedStatuses[number];
const allowedReportTypes = ["agronomy", "financing_register"] as const;
type ReportType = typeof allowedReportTypes[number];

function serializeReport(report: typeof reportsTable.$inferSelect) {
  return {
    ...report,
    submittedAt: report.submittedAt.toISOString(),
    status: allowedStatuses.includes(report.status as ReportStatus)
      ? report.status as ReportStatus
      : "submitted",
    reportType: allowedReportTypes.includes(report.reportType as ReportType)
      ? report.reportType as ReportType
      : "agronomy",
  };
}

async function ensureReportSeeded() {
  const existing = await db.select({ id: reportsTable.id }).from(reportsTable).limit(1);
  if (existing.length === 0) {
    await db.insert(reportsTable).values({
      title: "Отчёт по уборке · АПК Арыстан Grain",
      unit: "АПК Арыстан Grain",
      reportType: "agronomy",
      fileName: "Сводка_уборка_ТОО_Арыстан_Грейн.xlsx",
      fileSize: "76 КБ",
      fileUrl: "/files/svodka-uborka-arysan-green.xlsx",
      submittedBy: "Агроном АПК Арыстан",
      status: "submitted",
    });
  } else {
    const financing = await db.select({ id: reportsTable.id }).from(reportsTable)
      .where(eq(reportsTable.reportType, "financing_register")).limit(1);
    if (financing.length === 0) {
      await db.insert(reportsTable).values({
        title: "Реестр финансирования · АФ Веденовка",
        unit: "АФ Веденовка",
        reportType: "financing_register",
        fileName: "Реестр_финансирования_Веденовка.pdf",
        fileSize: "374 КБ",
        fileUrl: "/files/reestr-finansirovaniya-vedenovka.pdf",
        submittedBy: "Экономист",
        status: "submitted",
      });
    }
  }
}

router.get("/reports", async (req, res, next) => {
  try {
    await ensureReportSeeded();
    const filters = ListReportsQueryParams.parse(req.query);
    const conditions = [];
    if (filters.status) conditions.push(eq(reportsTable.status, filters.status));
    if (filters.unit) conditions.push(eq(reportsTable.unit, filters.unit));
    const rows = await db.select().from(reportsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(reportsTable.submittedAt));
    res.json(ListReportsResponse.parse(rows.map(serializeReport)));
  } catch (error) {
    next(error);
  }
});

router.post("/reports", async (req, res, next) => {
  try {
    const body = CreateReportBody.parse(req.body);
    const [report] = await db.insert(reportsTable).values(body).returning();
    res.status(201).json(CreateReportResponse.parse(serializeReport(report)));
  } catch (error) {
    next(error);
  }
});

router.patch("/reports/:id/status", async (req, res, next) => {
  try {
    const { id } = UpdateReportStatusParams.parse({ id: Number(req.params.id) });
    const body = UpdateReportStatusBody.parse(req.body);
    const [report] = await db.update(reportsTable).set({
      status: body.status,
      reviewerComment: body.reviewerComment,
      reviewedBy: body.reviewedBy,
    }).where(eq(reportsTable.id, id)).returning();
    if (!report) {
      res.status(404).json({ error: "Отчёт не найден" });
      return;
    }
    res.json(UpdateReportStatusResponse.parse(serializeReport(report)));
  } catch (error) {
    next(error);
  }
});

export default router;