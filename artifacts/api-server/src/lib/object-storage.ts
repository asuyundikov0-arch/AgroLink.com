import { randomUUID } from "crypto";
import { Readable } from "stream";
import { File, Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const directory = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!directory) {
      throw new Error("PRIVATE_OBJECT_DIR is not configured");
    }
    return directory;
  }

  async createUploadTarget(): Promise<{ uploadURL: string; objectPath: string }> {
    const objectName = `uploads/${randomUUID()}`;
    const fullPath = `${this.getPrivateObjectDir().replace(/\/$/, "")}/${objectName}`;
    const { bucketName, objectName: storageObjectName } = parseObjectPath(fullPath);
    const uploadURL = await signObjectURL({
      bucketName,
      objectName: storageObjectName,
      method: "PUT",
      ttlSec: 900,
    });
    return { uploadURL, objectPath: `/objects/${objectName}` };
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const objectName = objectPath.slice("/objects/".length);
    if (!objectName) throw new ObjectNotFoundError();
    const fullPath = `${this.getPrivateObjectDir().replace(/\/$/, "")}/${objectName}`;
    const { bucketName, objectName: storageObjectName } = parseObjectPath(fullPath);
    const file = objectStorageClient.bucket(bucketName).file(storageObjectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadObject(file: File): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": "private, max-age=0",
    };
    if (metadata.size) headers["Content-Length"] = String(metadata.size);
    return new Response(stream, { headers });
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "PUT";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Unable to sign object URL (${response.status})`);
  const { signed_url: signedURL } = await response.json() as { signed_url: string };
  return signedURL;
}