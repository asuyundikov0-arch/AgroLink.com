import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export const appRoles = ["agronomist", "chief_agronomist", "economist", "farm_director", "general_director"] as const;
export type AppRole = typeof appRoles[number];

export function getAccess(req: Request) {
  const auth = getAuth(req);
  const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
  const metadata = (claims.publicMetadata ?? claims.metadata ?? {}) as Record<string, unknown>;
  const requestedRole = metadata.role;
  const role = appRoles.includes(requestedRole as AppRole) ? requestedRole as AppRole : "agronomist";
  return { userId: auth.userId ?? "", role };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAccess(req);
  if (!userId) {
    res.status(401).json({ error: "Требуется вход в систему" });
    return;
  }
  next();
}