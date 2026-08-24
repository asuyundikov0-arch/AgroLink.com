import path from "node:path";
import { fileURLToPath } from "node:url";

const assetDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");
const attachedAssetsDirectory = path.resolve(assetDirectory, "../../../../attached_assets");
const protectedAttachmentFiles: Record<string, string> = {
  "svedeniya-po-remontu-traktorov-apk.xlsx": path.join(
    attachedAssetsDirectory,
    "Седения_по_ремонту_тракторов_АПК_(1)_1787546939216.xlsx",
  ),
  "ВПР_1787596328759.xlsx": path.join(
    attachedAssetsDirectory,
    "ВПР_1787596328759.xlsx",
  ),
  "Акт_выдачи_сзр_1787596482255.xlsx": path.join(
    attachedAssetsDirectory,
    "Акт_выдачи_сзр_1787596482255.xlsx",
  ),
  "Химия_1787596545001.xlsx": path.join(
    attachedAssetsDirectory,
    "Химия_1787596545001.xlsx",
  ),
};

export function resolveProtectedFile(fileUrl: string): string {
  const fileName = path.basename(fileUrl);
  if (!fileName || fileName === "." || fileName === path.sep) {
    throw new Error("Некорректное имя файла");
  }
  return protectedAttachmentFiles[fileName] ?? path.join(assetDirectory, fileName);
}