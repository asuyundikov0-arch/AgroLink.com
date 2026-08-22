import path from "node:path";
import { fileURLToPath } from "node:url";

const assetDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

export function resolveProtectedFile(fileUrl: string): string {
  const fileName = path.basename(fileUrl);
  if (!fileName || fileName === "." || fileName === path.sep) {
    throw new Error("Некорректное имя файла");
  }
  return path.join(assetDirectory, fileName);
}