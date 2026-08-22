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

const router: IRouter = Router();

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
  } else if (!existing.some((template) => template.fileName === "Сводка_уборка_ТОО_Арыстан_Грейн.xlsx")) {
    const [inserted] = await db.insert(templatesTable).values(seedTemplates[3]).returning();
    await db.insert(activityTable).values({
      action: "uploaded",
      templateName: inserted.name,
      userName: inserted.updatedBy,
    });
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
    updatedAt: template.updatedAt.toISOString(),
    status: template.status === "archived" ? "archived" as const : "active" as const,
  };
}

router.get("/templates", async (req, res, next) => {
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
    res.json(ListTemplatesResponse.parse(rows.map(serializeTemplate)));
  } catch (error) {
    next(error);
  }
});

router.post("/templates", async (req, res, next) => {
  try {
    const body = CreateTemplateBody.parse(req.body);
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

router.get("/templates/:id", async (req, res, next) => {
  try {
    const { id } = GetTemplateParams.parse({ id: Number(req.params.id) });
    const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, id));
    if (!template) {
      res.status(404).json({ error: "Шаблон не найден" });
      return;
    }
    res.json(GetTemplateResponse.parse(serializeTemplate(template)));
  } catch (error) {
    next(error);
  }
});

router.delete("/templates/:id", async (req, res, next) => {
  try {
    const { id } = DeleteTemplateParams.parse({ id: Number(req.params.id) });
    await db.delete(templatesTable).where(eq(templatesTable.id, id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/summary", async (_req, res, next) => {
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

router.get("/activity", async (_req, res, next) => {
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