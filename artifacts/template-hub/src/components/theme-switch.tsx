import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export type AppTheme = "dark" | "light";
const STORAGE_KEY = "agrolink-theme";
const listeners = new Set<() => void>();

function readTheme(): AppTheme {
  const attr = document.documentElement.dataset.theme;
  return attr === "light" ? "light" : "dark";
}

export function setTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === "light" ? "#f4f7fb" : "#0f0f0f";
  try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) setTheme(event.newValue);
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function useTheme(): AppTheme {
  return useSyncExternalStore(subscribe, readTheme, () => "dark");
}

export function ThemeSwitch({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const options: Array<{ value: AppTheme; label: string; icon: typeof Moon }> = [
    { value: "dark", label: "Чёрно-белая тема", icon: Moon },
    { value: "light", label: "Бело-синяя тема", icon: Sun },
  ];
  return (
    <div className={`theme-switch ${className}`} role="group" aria-label="Тема оформления" data-testid="theme-switch">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          className={theme === value ? "theme-switch-option theme-switch-active" : "theme-switch-option"}
          onClick={() => setTheme(value)}
          data-testid={`button-theme-${value}`}
        >
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
