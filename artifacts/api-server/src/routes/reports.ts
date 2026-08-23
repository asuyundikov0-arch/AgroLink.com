import { Router, type IRouter } from "express";
import { Readable } from "stream";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateReportBody,
  CreateReportResponse,
  ListReportsQueryParams,
  ListReportsResponse,
  RequestReportUploadUrlBody,
  RequestReportUploadUrlResponse,
  UpdateReportStatusBody,
  UpdateReportStatusParams,
  UpdateReportStatusResponse,
} from "@workspace/api-zod";
import { db, reportsTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { resolveProtectedFile } from "../lib/protected-files";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/object-storage";
import { isArchiveTarget } from "./archives";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const allowedStatuses = ["submitted", "in_review", "returned", "approved", "sent_to_management", "archived"] as const;
type ReportStatus = typeof allowedStatuses[number];
const allowedReportTypes = ["agronomy", "financing_register", "engineering_document"] as const;
type ReportType = typeof allowedReportTypes[number];
const maxUploadSize = 25 * 1024 * 1024;

function isEngineeringDocument(report: typeof reportsTable.$inferSelect) {
  return report.reportType === "engineering_document";
}

function isAllowedDocumentFile(name: string) {
  return /\.(pdf|xlsx|xls)$/i.test(name);
}

function serializeReport(report: typeof reportsTable.$inferSelect) {
  return {
    ...report,
    fileUrl: `/api/reports/${report.id}/download`,
    submittedAt: report.submittedAt.toISOString(),
    archivedAt: report.archivedAt?.toISOString() ?? null,
    status: allowedStatuses.includes(report.status as ReportStatus)
      ? report.status as ReportStatus
      : "submitted",
    reportType: allowedReportTypes.includes(report.reportType as ReportType)
      ? report.reportType as ReportType
      : "agronomy",
  };
}

function canViewReport(report: typeof reportsTable.$inferSelect, access: RoleAccess) {
  if (report.status === "archived") return Boolean(access.role);
  if (access.role === "agronomist") return report.reportType === "agronomy" && report.submittedByUserId === access.userId;
  if (access.role === "engineer") return isEngineeringDocument(report) && report.submittedByUserId === access.userId;
  if (access.role === "economist") return report.reportType === "financing_register" && report.submittedByUserId === access.userId;
  if (access.role === "chief_agronomist") return report.reportType === "agronomy";
  if (access.role === "chief_engineer") return isEngineeringDocument(report);
  if (access.role === "farm_director") return report.reportType === "financing_register";
  return access.role === "general_director" && report.status === "sent_to_management";
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
      submittedByUserId: "seed-agronomist",
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
        submittedByUserId: "seed-economist",
        status: "submitted",
      });
    }
  }
}

router.get("/reports", requireApprovedRole, async (req, res, next) => {
  try {
    await ensureReportSeeded();
    const filters = ListReportsQueryParams.parse(req.query);
    const access = res.locals.access as RoleAccess;
    const userId = access.userId;
    const role = access.role;
    const conditions = [];
    if (filters.status) conditions.push(eq(reportsTable.status, filters.status));
    if (filters.unit) conditions.push(eq(reportsTable.unit, filters.unit));
    if (filters.archiveSection) conditions.push(eq(reportsTable.archiveSection, filters.archiveSection));
    if (filters.archiveSubarchive) conditions.push(eq(reportsTable.archiveSubarchive, filters.archiveSubarchive));
    const listingArchive = filters.status === "archived";
    if (listingArchive) {
      conditions.push(eq(reportsTable.status, "archived"));
    } else if (role === "agronomist") {
      conditions.push(eq(reportsTable.reportType, "agronomy"), eq(reportsTable.submittedByUserId, userId));
    } else if (role === "engineer") {
      conditions.push(eq(reportsTable.reportType, "engineering_document"), eq(reportsTable.submittedByUserId, userId));
    } else if (role === "economist") {
      conditions.push(eq(reportsTable.reportType, "financing_register"), eq(reportsTable.submittedByUserId, userId));
    } else if (role === "chief_agronomist") {
      conditions.push(eq(reportsTable.reportType, "agronomy"));
    } else if (role === "chief_engineer") {
      conditions.push(eq(reportsTable.reportType, "engineering_document"));
    } else if (role === "farm_director") {
      conditions.push(eq(reportsTable.reportType, "financing_register"));
    } else if (role === "general_director") {
      conditions.push(eq(reportsTable.status, "sent_to_management"));
    }
    const rows = await db.select().from(reportsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(reportsTable.submittedAt));
    res.json(ListReportsResponse.parse(rows.map(serializeReport)));
  } catch (error) {
    next(error);
  }
});

router.post("/reports", requireApprovedRole, async (req, res, next) => {
  try {
    const body = CreateReportBody.parse(req.body);
    const access = res.locals.access as RoleAccess;
    if (!["agronomist", "economist", "engineer"].includes(access.role ?? "")) {
      res.status(403).json({ error: "У вас нет права подавать документы" });
      return;
    }
    const reportType = access.role === "economist"
      ? "financing_register"
      : access.role === "engineer"
        ? "engineering_document"
        : "agronomy";
    if (access.role === "engineer" && !body.fileUrl.startsWith("/objects/uploads/")) {
      res.status(400).json({ error: "Инженерный документ должен быть загружен через защищённое хранилище" });
      return;
    }
    const [report] = await db.insert(reportsTable).values({
      ...body,
      reportType,
      submittedBy: access.displayName,
      submittedByUserId: access.userId,
    }).returning();
    res.status(201).json(CreateReportResponse.parse(serializeReport(report)));
  } catch (error) {
    next(error);
  }
});

router.post("/reports/upload-url", requireApprovedRole, async (req, res, next): Promise<void> => {
  try {
    const body = RequestReportUploadUrlBody.parse(req.body);
    const access = res.locals.access as RoleAccess;
    if (!["agronomist", "economist", "engineer", "general_director"].includes(access.role ?? "")) {
      res.status(403).json({ error: "У вас нет права загружать этот документ" });
      return;
    }
    if (!isAllowedDocumentFile(body.name)) {
      res.status(400).json({ error: "Допустимы только файлы Excel или PDF" });
      return;
    }
    if (body.size > maxUploadSize) {
      res.status(400).json({ error: "Размер файла не должен превышать 25 МБ" });
      return;
    }
    res.json(RequestReportUploadUrlResponse.parse(await objectStorage.createUploadTarget()));
  } catch (error) {
    next(error);
  }
});

router.get("/reports/:id/download", requireApprovedRole, async (req, res, next) => {
  try {
    const { id } = UpdateReportStatusParams.parse({ id: Number(req.params.id) });
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    const access = res.locals.access as RoleAccess;
    if (!report) {
      res.status(404).json({ error: "Отчёт не найден" });
      return;
    }
    if (!canViewReport(report, access)) {
      res.status(403).json({ error: "У вас нет доступа к этому документу" });
      return;
    }
    if (report.fileUrl.startsWith("/objects/")) {
      try {
        const response = await objectStorage.downloadObject(await objectStorage.getObjectEntityFile(report.fileUrl));
        res.status(response.status);
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(report.fileName)}`);
        if (response.body) {
          Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
        } else {
          res.end();
        }
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          res.status(404).json({ error: "Файл документа не найден" });
          return;
        }
        throw error;
      }
      return;
    }
    res.download(resolveProtectedFile(report.fileUrl), report.fileName, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/reports/:id/status", requireApprovedRole, async (req, res, next) => {
  try {
    const { id } = UpdateReportStatusParams.parse({ id: Number(req.params.id) });
    const body = UpdateReportStatusBody.parse(req.body);
    const access = res.locals.access as RoleAccess;
    const role = access.role;
    const allowedReviewer = role === "chief_agronomist" || role === "chief_engineer" || role === "farm_director";
    const finalApprover = role === "general_director";
    if (!allowedReviewer && !finalApprover) {
      res.status(403).json({ error: "У вас нет права согласовывать документы" });
      return;
    }
    const [existing] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Отчёт не найден" });
      return;
    }
    if (body.status === "archived" && !finalApprover) {
      res.status(403).json({ error: "Только генеральный директор может отправить документ в архив" });
      return;
    }
    if (finalApprover && body.status !== "archived") {
      res.status(403).json({ error: "Генеральный директор может выполнять только финальное архивирование" });
      return;
    }
    if (
      (role === "chief_agronomist" && existing.reportType !== "agronomy")
      || (role === "chief_engineer" && !isEngineeringDocument(existing))
      || (role === "farm_director" && existing.reportType !== "financing_register")
    ) {
      res.status(403).json({ error: "Этот документ не относится к вашей очереди согласования" });
      return;
    }
    const isFinalArchive = finalApprover && existing.status === "sent_to_management" && body.status === "archived";
    if (isFinalArchive && !isArchiveTarget(body.archiveSection, body.archiveSubarchive)) {
      res.status(400).json({ error: "Выберите корректный архив и подархив" });
      return;
    }
    if (
      isFinalArchive
      && isEngineeringDocument(existing)
      && (body.archiveSection !== "engineering" || body.archiveSubarchive !== "general")
    ) {
      res.status(400).json({ error: "Инженерский документ можно отправить только в инженерский архив" });
      return;
    }
    const transitionAllowed = (existing.status === "submitted" && body.status === "in_review")
      || (existing.status === "in_review" && ["returned", "approved"].includes(body.status))
      || (existing.status === "approved" && body.status === "sent_to_management")
      || isFinalArchive;
    if (!transitionAllowed) {
      res.status(409).json({ error: "Недопустимое изменение статуса документа" });
      return;
    }
    const [report] = await db.update(reportsTable).set({
      status: body.status,
      reviewerComment: body.reviewerComment,
      reviewedBy: access.displayName,
      ...(isFinalArchive ? {
        archiveSection: body.archiveSection,
        archiveSubarchive: body.archiveSubarchive,
        archivedAt: new Date(),
        archivedBy: access.displayName,
      } : {}),
    }).where(eq(reportsTable.id, id)).returning();
    res.json(UpdateReportStatusResponse.parse(serializeReport(report)));
  } catch (error) {
    next(error);
  }
});

export default router;