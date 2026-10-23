import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  CreateSparePartRequestBody,
  CreateSparePartRequestResponse,
  ListSparePartRequestsResponse,
  ReviewSparePartRequestByChiefBody,
  ReviewSparePartRequestByChiefResponse,
  ReviewSparePartRequestByDirectorBody,
  ReviewSparePartRequestByDirectorResponse,
  ResubmitSparePartRequestItemBody,
  ResubmitSparePartRequestItemResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  db,
  fleetEquipmentTable,
  sparePartRequestItemsTable,
  sparePartRequestsTable,
  type AppRole,
} from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { aggregateSparePartRequestStatus, refreshSparePartRequestStatus } from "../lib/spare-part-request-status";

const router: IRouter = Router();
const allowedRoles = new Set<AppRole>(["engineer", "chief_engineer", "general_director", "storekeeper"]);
const protect: RequestHandler = (_req, res, next) => {
  const role = (res.locals.access as RoleAccess).role;
  if (!role || !allowedRoles.has(role)) {
    res.status(403).json({ error: "Нет доступа к заявкам на инженерные запчасти." });
    return;
  }
  next();
};
router.use("/engineering/spare-part-requests", requireApprovedRole, protect);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const positiveId = (value: unknown) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const validQuantity = (value: number) => Number.isFinite(value)
  && value > 0 && value <= 1_000_000 && Number(value.toFixed(3)) === value;
const validPrice = (value: number) => Number.isFinite(value)
  && value >= 0 && value <= 1_000_000_000_000 && Number(value.toFixed(2)) === value;
const sameKey = (a: string, b: string) => a.trim().toLocaleLowerCase("ru-RU") === b.trim().toLocaleLowerCase("ru-RU");

async function loadRequests() {
  const requests = await db.select().from(sparePartRequestsTable)
    .orderBy(desc(sparePartRequestsTable.createdAt), desc(sparePartRequestsTable.id));
  const items = await db.select({ item: sparePartRequestItemsTable, fleet: fleetEquipmentTable })
    .from(sparePartRequestItemsTable)
    .innerJoin(fleetEquipmentTable, eq(sparePartRequestItemsTable.fleetId, fleetEquipmentTable.id))
    .orderBy(sparePartRequestItemsTable.id);
  type RequestItemView = {
    id: number;
    name: string;
    articleNumber: string;
    unit: string;
    quantity: number;
    fleetId: number;
    fleetKind: string;
    registrationNumber: string | null;
    status: string;
    unitPrice: number | null;
    chiefComment: string;
    directorComment: string;
    receivedQuantity: number;
    chiefReviewedByName: string;
    chiefReviewedAt: string | null;
    directorReviewedByName: string;
    directorReviewedAt: string | null;
    receivedByName: string;
    receivedAt: string | null;
  };
  const grouped = new Map<number, RequestItemView[]>();
  for (const { item, fleet } of items) {
    const list = grouped.get(item.requestId) ?? [];
    list.push({
      id: item.id,
      name: item.name,
      articleNumber: item.articleNumber,
      unit: item.unit,
      quantity: Number(item.quantity),
      fleetId: item.fleetId,
      fleetKind: fleet.kind,
      registrationNumber: fleet.registrationNumber,
      status: item.status,
      unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
      chiefComment: item.chiefComment,
      directorComment: item.directorComment,
      receivedQuantity: Number(item.receivedQuantity),
      chiefReviewedByName: item.chiefReviewedByName,
      chiefReviewedAt: item.chiefReviewedAt?.toISOString() ?? null,
      directorReviewedByName: item.directorReviewedByName,
      directorReviewedAt: item.directorReviewedAt?.toISOString() ?? null,
      receivedByName: item.receivedByName,
      receivedAt: item.receivedAt?.toISOString() ?? null,
    });
    grouped.set(item.requestId, list);
  }
  return requests.map((request) => {
    const requestItems = grouped.get(request.id) ?? [];
    const status = aggregateSparePartRequestStatus(requestItems.map((item) => String(item.status)));
    return {
      id: request.id,
      requestId: request.requestId,
      requesterUserId: request.requesterUserId,
      requesterName: request.requesterName,
      department: request.department,
      status,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      items: requestItems,
    };
  });
}

async function loadRequest(id: number) {
  const request = (await loadRequests()).find((row) => row.id === id);
  return request ?? null;
}

function actor(access: RoleAccess) {
  return access.displayName || access.email || access.userId;
}

function requestError(message: string, status: number) {
  return { error: message, status };
}

router.get("/engineering/spare-part-requests", async (_req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    const rows = await loadRequests();
    let visible;
    if (access.role === "engineer") {
      visible = rows.filter((row) => row.requesterUserId === access.userId);
    } else if (access.role === "chief_engineer") {
      visible = rows.filter((row) => row.items.some((item) => item.status === "chief_review"));
    } else if (access.role === "general_director") {
      visible = rows.filter((row) => row.items.some((item) => item.status === "director_review"));
    } else if (access.role === "storekeeper") {
      visible = rows;
    } else {
      res.status(403).json({ error: "Нет доступа к заявкам на инженерные запчасти." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(ListSparePartRequestsResponse.parse(visible));
  } catch (error) {
    next(error);
  }
});

router.post("/engineering/spare-part-requests", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (access.role !== "engineer") {
      res.status(403).json({ error: "Создать заявку может инженер." });
      return;
    }
    const parsed = CreateSparePartRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Добавьте хотя бы одну корректно заполненную позицию." });
      return;
    }
    const input = parsed.data;
    const normalized = input.items.map((item) => ({
      ...item,
      name: item.name.trim(),
      articleNumber: item.articleNumber.trim(),
      unit: item.unit.trim(),
    }));
    if (normalized.some((item) =>
      !item.name || item.name.length > 200 || item.articleNumber.length > 100
      || !item.unit || item.unit.length > 40 || !validQuantity(item.quantity) || !positiveId(item.fleetId),
    )) {
      res.status(400).json({ error: "Проверьте наименование, каталожный номер, единицу измерения, технику и количество." });
      return;
    }
    const fleetIds = [...new Set(normalized.map((item) => item.fleetId))];
    const machines = await db.select({ id: fleetEquipmentTable.id })
      .from(fleetEquipmentTable).where(inArray(fleetEquipmentTable.id, fleetIds));
    if (machines.length !== fleetIds.length) {
      res.status(400).json({ error: "Выберите технику из актуального справочника." });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(sparePartRequestsTable)
        .where(eq(sparePartRequestsTable.requestId, input.requestId));
      if (existing) {
        if (existing.requesterUserId !== access.userId) return requestError("Идентификатор заявки уже использован.", 409);
        return { id: existing.id };
      }
      const [request] = await tx.insert(sparePartRequestsTable).values({
        requestId: input.requestId,
        requesterUserId: access.userId,
        requesterName: actor(access),
        department: access.department,
        status: "chief_review",
      }).returning();
      await tx.insert(sparePartRequestItemsTable).values(normalized.map((item) => ({
        requestId: request.id,
        name: item.name,
        articleNumber: item.articleNumber,
        unit: item.unit,
        quantity: item.quantity.toFixed(3),
        fleetId: item.fleetId,
        status: "chief_review",
      })));
      await tx.insert(activityTable).values({
        action: "Подана заявка на запчасти",
        templateName: `${normalized.length} поз. · ${request.requesterName}`,
        userName: request.requesterName,
      });
      return { id: request.id };
    });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const request = await loadRequest(result.id);
    if (!request) {
      res.status(500).json({ error: "Не удалось загрузить созданную заявку." });
      return;
    }
    res.status(201).json(CreateSparePartRequestResponse.parse(request));
  } catch (error) {
    next(error);
  }
});

router.patch("/engineering/spare-part-requests/:id/chief-review", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (access.role !== "chief_engineer") {
      res.status(403).json({ error: "Расценивать и направлять заявку может главный инженер." });
      return;
    }
    const id = positiveId(req.params.id);
    const parsed = ReviewSparePartRequestByChiefBody.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Проверьте решения и цены по каждой позиции." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(sparePartRequestsTable)
        .where(eq(sparePartRequestsTable.id, id)).for("update");
      if (!request) return requestError("Заявка не найдена.", 404);
      const pending = await tx.select().from(sparePartRequestItemsTable)
        .where(and(eq(sparePartRequestItemsTable.requestId, id), eq(sparePartRequestItemsTable.status, "chief_review")))
        .for("update");
      const decisions = parsed.data.items;
      const decisionIds = new Set(decisions.map((item) => item.itemId));
      if (pending.length !== decisions.length || pending.some((item) => !decisionIds.has(item.id))) {
        return requestError("Заявка изменилась. Обновите страницу и проверьте все позиции.", 409);
      }
      for (const decision of decisions) {
        if (decision.decision === "approved" && (decision.unitPrice === null || !validPrice(decision.unitPrice))) {
          return requestError("Для одобряемой позиции укажите цену за единицу.", 400);
        }
        if (decision.decision === "returned" && !decision.comment.trim()) {
          return requestError("Для возвращаемой позиции укажите причину.", 400);
        }
      }
      const reviewedAt = new Date();
      for (const decision of decisions) {
        await tx.update(sparePartRequestItemsTable).set({
          status: decision.decision === "approved" ? "director_review" : "returned_to_engineer",
          unitPrice: decision.decision === "approved" ? decision.unitPrice!.toFixed(2) : null,
          chiefComment: decision.comment.trim(),
          chiefReviewedByName: actor(access),
          chiefReviewedAt: reviewedAt,
          updatedAt: reviewedAt,
        }).where(eq(sparePartRequestItemsTable.id, decision.itemId));
      }
      await refreshSparePartRequestStatus(tx, id);
      await tx.insert(activityTable).values({
        action: "Главный инженер обработал заявку на запчасти",
        templateName: `Заявка ${request.requestId}`,
        userName: actor(access),
      });
      return { id };
    });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const request = await loadRequest(result.id);
    if (!request) {
      res.status(404).json({ error: "Заявка не найдена после обработки." });
      return;
    }
    res.json(ReviewSparePartRequestByChiefResponse.parse(request));
  } catch (error) {
    next(error);
  }
});

router.patch("/engineering/spare-part-requests/:id/director-review", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (access.role !== "general_director") {
      res.status(403).json({ error: "Утвердить закупку может генеральный директор." });
      return;
    }
    const id = positiveId(req.params.id);
    const parsed = ReviewSparePartRequestByDirectorBody.safeParse(req.body);
    if (!id || !parsed.success) {
      res.status(400).json({ error: "Проверьте решения по позициям заявки." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(sparePartRequestsTable)
        .where(eq(sparePartRequestsTable.id, id)).for("update");
      if (!request) return requestError("Заявка не найдена.", 404);
      const pending = await tx.select().from(sparePartRequestItemsTable)
        .where(and(eq(sparePartRequestItemsTable.requestId, id), eq(sparePartRequestItemsTable.status, "director_review")))
        .for("update");
      const decisions = parsed.data.items;
      const decisionIds = new Set(decisions.map((item) => item.itemId));
      if (pending.length !== decisions.length || pending.some((item) => !decisionIds.has(item.id))) {
        return requestError("Заявка изменилась. Обновите страницу и проверьте все позиции.", 409);
      }
      if (decisions.some((decision) => decision.decision === "rejected" && !decision.comment.trim())) {
        return requestError("Для отказа по позиции укажите причину.", 400);
      }
      const reviewedAt = new Date();
      for (const decision of decisions) {
        await tx.update(sparePartRequestItemsTable).set({
          status: decision.decision === "approved" ? "awaiting_delivery" : "rejected",
          directorComment: decision.comment.trim(),
          directorReviewedByName: actor(access),
          directorReviewedAt: reviewedAt,
          updatedAt: reviewedAt,
        }).where(eq(sparePartRequestItemsTable.id, decision.itemId));
      }
      await refreshSparePartRequestStatus(tx, id);
      await tx.insert(activityTable).values({
        action: "Генеральный директор рассмотрел заявку на запчасти",
        templateName: `Заявка ${request.requestId}`,
        userName: actor(access),
      });
      return { id };
    });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const request = await loadRequest(result.id);
    if (!request) {
      res.status(404).json({ error: "Заявка не найдена после рассмотрения." });
      return;
    }
    res.json(ReviewSparePartRequestByDirectorResponse.parse(request));
  } catch (error) {
    next(error);
  }
});

router.patch("/engineering/spare-part-requests/:id/items/:itemId/resubmit", async (req, res, next): Promise<void> => {
  try {
    const access = res.locals.access as RoleAccess;
    if (access.role !== "engineer") {
      res.status(403).json({ error: "Изменить возвращённую позицию может подавший её инженер." });
      return;
    }
    const requestId = positiveId(req.params.id);
    const itemId = positiveId(req.params.itemId);
    const parsed = ResubmitSparePartRequestItemBody.safeParse(req.body);
    if (!requestId || !itemId || !parsed.success) {
      res.status(400).json({ error: "Проверьте наименование, единицу измерения, количество и технику." });
      return;
    }
    const input = parsed.data;
    const name = input.name.trim();
    const articleNumber = input.articleNumber.trim();
    const unit = input.unit.trim();
    if (!name || name.length > 200 || articleNumber.length > 100 || !unit || unit.length > 40
      || !validQuantity(input.quantity) || !positiveId(input.fleetId)) {
      res.status(400).json({ error: "Проверьте наименование, каталожный номер, единицу измерения, технику и количество." });
      return;
    }
    const [fleet] = await db.select({ id: fleetEquipmentTable.id })
      .from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, input.fleetId));
    if (!fleet) {
      res.status(400).json({ error: "Выберите технику из актуального справочника." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(sparePartRequestsTable)
        .where(eq(sparePartRequestsTable.id, requestId)).for("update");
      if (!request || request.requesterUserId !== access.userId) {
        return requestError("Заявка не найдена.", 404);
      }
      const [item] = await tx.select().from(sparePartRequestItemsTable)
        .where(and(
          eq(sparePartRequestItemsTable.id, itemId),
          eq(sparePartRequestItemsTable.requestId, requestId),
          eq(sparePartRequestItemsTable.status, "returned_to_engineer"),
        )).for("update");
      if (!item) return requestError("Позиция не ожидает исправления инженером.", 409);
      await tx.update(sparePartRequestItemsTable).set({
        name,
        articleNumber,
        unit,
        quantity: input.quantity.toFixed(3),
        fleetId: input.fleetId,
        status: "chief_review",
        unitPrice: null,
        chiefComment: "",
        chiefReviewedByName: "",
        chiefReviewedAt: null,
        directorComment: "",
        directorReviewedByName: "",
        directorReviewedAt: null,
        updatedAt: new Date(),
      }).where(eq(sparePartRequestItemsTable.id, itemId));
      await refreshSparePartRequestStatus(tx, requestId);
      await tx.insert(activityTable).values({
        action: "Инженер повторно направил позицию на запчасти",
        templateName: `${name} · заявка ${request.requestId}`,
        userName: actor(access),
      });
      return { id: requestId };
    });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const request = await loadRequest(result.id);
    if (!request) {
      res.status(404).json({ error: "Заявка не найдена после повторной отправки." });
      return;
    }
    res.json(ResubmitSparePartRequestItemResponse.parse(request));
  } catch (error) {
    next(error);
  }
});

export default router;
