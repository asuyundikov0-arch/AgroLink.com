import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import {
  CreateTemplateBody,
  CreateTemplateResponse,
  DeleteTemplateParams,
  GetDashboardSummaryResponse,
  GetTemplateParams,
  GetTemplateResponse,
  ListActivityResponse,
  ListTemplatesQueryParams,
  ListTemplatesResponse,
} from "@workspace/api-zod";
import { activityTable, db, templatesTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { resolveProtectedFile } from "../lib/protected-files";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/object-storage";
import { Readable } from "stream";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

function canUseTemplate(access: RoleAccess, template: typeof templatesTable.$inferSelect) {
  if (template.accessGroup === "agronomists") {
    return ["agronomist", "chief_agronomist", "farm_director", "general_director"].includes(access.role!);
  }
  if (template.accessGroup === "engineers") {
    return ["engineer", "chief_engineer", "general_director"].includes(access.role!);
  }
  if (template.accessGroup === "economists") {
    return ["economist", "farm_director", "general_director"].includes(access.role!);
  }
  if (template.accessGroup === "lawyers") {
    return ["lawyer", "general_director"].includes(access.role!);
  }
  return true;
}

const seedTemplates = [
  {
    name: "Ежемесячный отчёт по продажам",
    description: "Сводный отчёт для анализа продаж по менеджерам и регионам.",
    category: "Отчётность",
    department: "Отдел продаж",
    fileName: "Отчёт_по_продажам.xlsx",
    fileSize: "248 КБ",
    fileType: "Excel",
    accessGroup: "all",
    fileUrl: "",
    version: "v2.4",
    updatedBy: "Айгуль М.",
  },
  {
    name: "Заявка на закупку",
    description: "Внутренняя форма для согласования закупок и расходных материалов.",
    category: "Операционные",
    department: "Снабжение",
    fileName: "Заявка_на_закупку.xlsx",
    fileSize: "86 КБ",
    fileType: "Excel",
    accessGroup: "all",
    fileUrl: "",
    version: "v1.8",
    updatedBy: "Данияр С.",
  },
  {
    name: "Табель рабочего времени",
    description: "Шаблон для ежемесячного учёта рабочего времени сотрудников.",
    category: "Персонал",
    department: "HR",
    fileName: "Табель_рабочего_времени.xlsx",
    fileSize: "112 КБ",
    fileType: "Excel",
    accessGroup: "all",
    fileUrl: "",
    version: "v3.1",
    updatedBy: "Марина К.",
  },
  {
    name: "Сводка уборки ТОО «Арыстан Грейн»",
    description: "Отчётная форма для агрономов. Оригинальный Excel-файл с сохранёнными формулами.",
    category: "Отчётность",
    department: "Агрономия",
    fileName: "Сводка_уборка_ТОО_Арыстан_Грейн.xlsx",
    fileSize: "76 КБ",
    fileType: "Excel",
    accessGroup: "agronomists",
    fileUrl: "/files/svodka-uborka-arysan-green.xlsx",
    version: "v1.0",
    updatedBy: "Администратор",
  },
  {
    name: "Шаблон Отчет По Уборке в ТОО АПК Арыстан грейн",
    description: "Отчётная форма для подразделения АПК Арыстан Grain. Оригинальный Excel-файл с сохранёнными формулами.",
    category: "Отчётность",
    department: "Агроблок",
    fileName: "Сводка_уборка_ТОО_Арыстан_Грейн.xlsx",
    fileSize: "76 КБ",
    fileType: "Excel",
    accessGroup: "agronomists",
    fileUrl: "/files/svodka-uborka-arysan-green.xlsx",
    version: "v1.0",
    updatedBy: "Администратор",
  },
  {
    name: "Шаблон Отчет По Уборке АФ Веденовка",
    description: "Отчётная форма для подразделения АФ Веденовка. Оригинальный Excel-файл с сохранёнными формулами.",
    category: "Отчётность",
    department: "Агроблок",
    fileName: "Сводка_уборка_ТОО_Арыстан_Грейн.xlsx",
    fileSize: "76 КБ",
    fileType: "Excel",
    accessGroup: "agronomists",
    fileUrl: "/files/svodka-uborka-arysan-green.xlsx",
    version: "v1.0",
    updatedBy: "Администратор",
  },
  {
    name: "Сведения по ремонту тракторов АПК",
    description: "Инженерный Excel-шаблон для учёта сведений по ремонту тракторов.",
    category: "Инженерные документы",
    department: "Инженерная служба",
    fileName: "Сведения_по_ремонту_тракторов_АПК.xlsx",
    fileSize: "31 КБ",
    fileType: "Excel",
    accessGroup: "engineers",
    fileUrl: "/files/svedeniya-po-remontu-traktorov-apk.xlsx",
    version: "v1.0",
    updatedBy: "Администратор",
  },
];

let seedPromise: Promise<void> | null = null;

async function seedIfNeeded() {
  const existing = await db.select().from(templatesTable);
  if (existing.length === 0) {
    const inserted = await db.insert(templatesTable).values(seedTemplates).returning();
    await db.insert(activityTable).values(
      inserted.slice(0, 3).map((template) => ({
        action: "uploaded",
        templateName: template.name,
        userName: template.updatedBy,
      })),
    );
  } else {
    const missingAgroTemplates = seedTemplates.slice(3).filter(
      (seed) => !existing.some((template) => template.name === seed.name),
    );
    for (const seed of missingAgroTemplates) {
      const [inserted] = await db.insert(templatesTable).values(seed).returning();
      await db.insert(activityTable).values({
        action: "uploaded",
        templateName: inserted.name,
        userName: inserted.updatedBy,
      });
    }
  }
}

async function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = seedIfNeeded().finally(() => {
      seedPromise = null;
    });
  }
  await seedPromise;
}

function serializeTemplate(template: typeof templatesTable.$inferSelect) {
  return {
    ...template,
    fileUrl: `/api/templates/${template.id}/download`,
    updatedAt: template.updatedAt.toISOString(),
    status: template.status === "archived" ? "archived" as const : "active" as const,
  };
}

router.get("/templates", requireApprovedRole, async (req, res, next) => {
  try {
    await ensureSeeded();
    const filters = ListTemplatesQueryParams.parse(req.query);
    const conditions = [];
    if (filters.search) {
      conditions.push(or(
        ilike(templatesTable.name, `%${filters.search}%`),
        ilike(templatesTable.description, `%${filters.search}%`),
        ilike(templatesTable.fileName, `%${filters.search}%`),
      ));
    }
    if (filters.category) conditions.push(eq(templatesTable.category, filters.category));
    if (filters.department) conditions.push(eq(templatesTable.department, filters.department));
    const rows = await db.select().from(templatesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(templatesTable.updatedAt));
    const access = res.locals.access as RoleAccess;
    res.json(ListTemplatesResponse.parse(rows.filter((template) => canUseTemplate(access, template)).map(serializeTemplate)));
  } catch (error) {
    next(error);
  }
});

router.post("/templates", requireApprovedRole, async (req, res, next) => {
  try {
    const body = CreateTemplateBody.parse(req.body);
    const access = res.locals.access as RoleAccess;
    if (access.role !== "general_director") {
      res.status(403).json({ error: "Добавлять шаблоны может только генеральный директор" });
      return;
    }
    const [template] = await db.insert(templatesTable).values(body).returning();
    await db.insert(activityTable).values({
      action: "uploaded",
      templateName: template.name,
      userName: template.updatedBy,
    });
    res.status(201).json(CreateTemplateResponse.parse(serializeTemplate(template)));
  } catch (error) {
    next(error);
  }
});

router.get("/templates/:id", requireApprovedRole, async (req, res, next) => {
  try {
    const { id } = GetTemplateParams.parse({ id: Number(req.params.id) });
    const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, id));
    if (!template) {
      res.status(404).json({ error: "Шаблон не найден" });
      return;
    }
    if (!canUseTemplate(res.locals.access as RoleAccess, template)) {
      res.status(403).json({ error: "У вас нет доступа к этому шаблону" });
      return;
    }
    res.json(GetTemplateResponse.parse(serializeTemplate(template)));
  } catch (error) {
    next(error);
  }
});

router.get("/templates/:id/download", requireApprovedRole, async (req, res, next) => {
  try {
    const { id } = GetTemplateParams.parse({ id: Number(req.params.id) });
    const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, id));
    if (!template) {
      res.status(404).json({ error: "Шаблон не найден" });
      return;
    }
    if (!canUseTemplate(res.locals.access as RoleAccess, template)) {
      res.status(403).json({ error: "У вас нет доступа к этому шаблону" });
      return;
    }
    if (template.fileUrl.startsWith("/objects/")) {
      try {
        const response = await objectStorage.downloadObject(await objectStorage.getObjectEntityFile(template.fileUrl));
        res.status(response.status);
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(template.fileName)}`);
        if (response.body) {
          Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
        } else {
          res.end();
        }
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          res.status(404).json({ error: "Файл шаблона не найден" });
          return;
        }
        throw error;
      }
      return;
    }
    res.download(resolveProtectedFile(template.fileUrl), template.fileName, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/templates/:id", requireApprovedRole, async (req, res, next) => {
  try {
    const { id } = DeleteTemplateParams.parse({ id: Number(req.params.id) });
    const access = res.locals.access as RoleAccess;
    if (access.role !== "general_director") {
      res.status(403).json({ error: "Удалять шаблоны может только генеральный директор" });
      return;
    }
    await db.delete(templatesTable).where(eq(templatesTable.id, id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/summary", requireApprovedRole, async (_req, res, next) => {
  try {
    await ensureSeeded();
    const rows = await db.select().from(templatesTable);
    const departments = new Set(rows.map((row) => row.department)).size;
    res.json(GetDashboardSummaryResponse.parse({
      totalTemplates: rows.length,
      departments,
      downloadsThisMonth: rows.reduce((total, row) => total + row.downloads, 0),
      newThisMonth: rows.filter((row) => row.updatedAt.getMonth() === new Date().getMonth()).length,
    }));
  } catch (error) {
    next(error);
  }
});

router.get("/activity", requireApprovedRole, async (_req, res, next) => {
  try {
    await ensureSeeded();
    const rows = await db.select().from(activityTable).orderBy(desc(activityTable.timestamp), asc(activityTable.id)).limit(10);
    res.json(ListActivityResponse.parse(rows.map((row) => ({
      ...row,
      timestamp: row.timestamp.toISOString(),
      action: ["uploaded", "updated", "downloaded", "archived"].includes(row.action)
        ? row.action as "uploaded" | "updated" | "downloaded" | "archived"
        : "updated",
    }))));
  } catch (error) {
    next(error);
  }
});

export default router;