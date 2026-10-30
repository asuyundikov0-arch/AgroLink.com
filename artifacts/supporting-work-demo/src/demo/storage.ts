import { initialState, isValidState, type DemoState } from "./model";

// Isolated key: affects only this demo, never main AgroLink data.
export const STORAGE_KEY = "agrolink-supporting-work-demo:v1";

export function loadState(): { state: DemoState; error: string | null } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: initialState(), error: null };
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return { state: initialState(), error: "Сохранённые демо-данные повреждены — загружено чистое демо." };
    return { state: parsed, error: null };
  } catch (e) {
    return { state: initialState(), error: "Не удалось прочитать локальное хранилище: " + (e instanceof Error ? e.message : String(e)) };
  }
}

export function saveState(s: DemoState): string | null {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return null;
  } catch (e) {
    return "Не удалось сохранить демо в браузере: " + (e instanceof Error ? e.message : String(e)) + ". Изменения живут только до перезагрузки.";
  }
}
