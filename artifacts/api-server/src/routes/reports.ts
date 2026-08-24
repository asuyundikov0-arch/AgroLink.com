import { Router, type IRouter } from "express";
import { Readable } from "stream";
import { and, desc, eq, inArray, or } from "drizzle-orm";
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
const allowedReportTypes = ["agronomy", "financing_register", "engineering_document", "legal_document"] as const;
type ReportType = typeof allowedReportTypes[number];
const directorRecipientRoles = ["agronomist", "engineer", "economist", "lawyer"] as const;
type DirectorRecipientRole = typeof directorRecipientRoles[number];
const maxUploadSize = 25 * 1024 * 1024;

function isEngineeringDocument(report: typeof reportsTable.$inferSelect) {
  return report.reportType === "engineering_document";
}

function isDirectorRecipientRole(value: string | undefined): value is DirectorRecipientRole {
  return Boolean(value && directorRecipientRoles.includes(value as DirectorRecipientRole));
}

function reportTypeForRecipient(role: DirectorRecipientRole): ReportType {
  return role === "engineer"
    ? "engineering_document"
    : role === "economist"
      ? "financing_register"
      : role === "lawyer"
        ? "legal_document"
        : "agronomy";
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
  if (access.role === "agronomist") return report.reportType === "agronomy" && (report.submittedByUserId === access.userId || report.recipientRole === "agronomist");
  if (access.role === "engineer") return isEngineeringDocument(report) && (report.submittedByUserId === access.userId || report.recipientRole === "engineer");
  if (access.role === "economist") return report.reportType === "financing_register" && (report.submittedByUserId === access.userId || report.recipientRole === "economist");
  if (access.role === "lawyer") return report.reportType === "legal_document" && (report.submittedByUserId === access.userId || report.recipientRole === "lawyer");
  if (access.role === "chief_agronomist") return report.reportType === "agronomy" && !report.recipientRole;
  if (access.role === "chief_engineer") return isEngineeringDocument(report) && !report.recipientRole && report.status !== "sent_to_management";
  if (access.role === "farm_director") return report.reportType === "financing_register" && !report.recipientRole;
  return access.role === "general_director";
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
    if (role === "agronomist") {
      conditions.push(eq(reportsTable.reportType, "agronomy"), or(eq(reportsTable.submittedByUserId, userId), eq(reportsTable.recipientRole, "agronomist")));
    } else if (role === "engineer") {
      conditions.push(eq(reportsTable.reportType, "engineering_document"), or(eq(reportsTable.submittedByUserId, userId), eq(reportsTable.recipientRole, "engineer")));
    } else if (role === "economist") {
      conditions.push(eq(reportsTable.reportType, "financing_register"), or(eq(reportsTable.submittedByUserId, userId), eq(reportsTable.recipientRole, "economist")));
    } else if (role === "chief_agronomist") {
      conditions.push(eq(reportsTable.reportType, "agronomy"), eq(reportsTable.recipientRole, ""));
    } else if (role === "chief_engineer") {
      conditions.push(eq(reportsTable.reportType, "engineering_document"), eq(reportsTable.recipientRole, ""), inArray(reportsTable.status, ["submitted", "in_review", "approved"]));
    } else if (role === "farm_director") {
      conditions.push(eq(reportsTable.reportType, "financing_register"), eq(reportsTable.recipientRole, ""));
    } else if (role === "lawyer") {
      conditions.push(eq(reportsTable.reportType, "legal_document"), or(eq(reportsTable.submittedByUserId, userId), eq(reportsTable.recipientRole, "lawyer")));
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
    if (!["agronomist", "economist", "engineer", "lawyer", "general_director"].includes(access.role ?? "")) {
      res.status(403).json({ error: "У вас нет права подавать документы" });
      return;
    }
    const recipientRole = body.recipientRole;
    if (access.role === "general_director" && !isDirectorRecipientRole(recipientRole)) {
      res.status(400).json({ error: "Генеральный директор должен выбрать кабинет получателя" });
      return;
    }
    if (access.role !== "general_director" && recipientRole) {
      res.status(403).json({ error: "Назначать документы в кабинеты специалистов может только генеральный директор" });
      return;
    }
    const reportType = access.role === "general_director"
      ? reportTypeForRecipient(recipientRole as DirectorRecipientRole)
      : access.role === "economist"
      ? "financing_register"
      : access.role === "engineer"
        ? "engineering_document"
        : access.role === "lawyer"
          ? "legal_document"
          : "agronomy";
    if (!body.fileUrl.startsWith("/objects/uploads/")) {
      res.status(400).json({ error: "Документ должен быть загружен через защищённое хранилище" });
      return;
    }
    const [report] = await db.insert(reportsTable).values({
      ...body,
      reportType,
      recipientRole: recipientRole ?? "",
      submittedBy: access.displayName,
      submittedByUserId: access.userId,
      status: access.role === "lawyer" ? "sent_to_management" : "submitted",
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
    if (!["agronomist", "economist", "engineer", "lawyer", "general_director"].includes(access.role ?? "")) {
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
    if (allowedReviewer && existing.recipientRole) {
      res.status(403).json({ error: "Отчёт, добавленный в личный кабинет специалиста, не участвует в очереди согласования" });
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
    if (isFinalArchive && existing.reportType === "legal_document" && (body.archiveSection !== "legal" || body.archiveSubarchive !== "general")) {
      res.status(400).json({ error: "Юридический документ можно отправить только в юридический архив" });
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

router.delete("/reports/:id", requireApprovedRole, async (req, res, next) => {
  try {
    const { id } = UpdateReportStatusParams.parse({ id: Number(req.params.id) });
    const access = res.locals.access as RoleAccess;
    if (access.role !== "general_director") {
      res.status(403).json({ error: "Удалять отчёты может только генеральный директор" });
      return;
    }
    const [existing] = await db.select({ id: reportsTable.id }).from(reportsTable).where(eq(reportsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Отчёт не найден" });
      return;
    }
    await db.delete(reportsTable).where(eq(reportsTable.id, id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;