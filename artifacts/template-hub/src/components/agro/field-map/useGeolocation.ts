import { useCallback, useEffect, useRef, useState } from "react";

export type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "active"; lat: number; lng: number; accuracy: number; at: number }
  | { status: "error"; message: string; suggestNewTab?: boolean };

const ERRORS: Record<number, string> = {
  1: "Доступ к геопозиции запрещён. Разрешите доступ к местоположению для этого сайта в настройках браузера и нажмите «Где я» снова.",
  2: "Местоположение сейчас недоступно: нет сигнала GPS или сети. Выйдите на открытое место и повторите.",
  3: "Не удалось получить координаты вовремя. Проверьте, что геолокация включена на устройстве, и повторите.",
};

/** Opt-in, foreground-only position watch. Nothing is stored or sent anywhere. */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });
  const watchId = useRef<number | null>(null);
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current++;
    if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setState({ status: "idle" });
  }, []);

  const start = useCallback(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setState({ status: "error", message: "Геолокация работает только по защищённому соединению (HTTPS). Откройте приложение по адресу https://." });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "error", message: "Этот браузер не поддерживает геолокацию. Выберите поле в списке вручную." });
      return;
    }
    const policyDocument = document as Document & {
      permissionsPolicy?: { allowsFeature: (f: string) => boolean };
      featurePolicy?: { allowsFeature: (f: string) => boolean };
    };
    const fp = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
    if (fp && !fp.allowsFeature("geolocation")) {
      setState({ status: "error", message: "Встроенное окно запрещает доступ к геопозиции. Откройте приложение в отдельной вкладке.", suggestNewTab: true });
      return;
    }
    if (watchId.current !== null) return;
    const requestGeneration = ++generation.current;
    setState({ status: "requesting" });
    try {
      watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        if (generation.current === requestGeneration) setState({ status: "active", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp });
      },
      (e) => {
        if (generation.current !== requestGeneration) return;
        generation.current++;
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        setState({ status: "error", message: ERRORS[e.code] ?? "Не удалось определить местоположение.", suggestNewTab: e.code === 1 && isFramed() });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    } catch {
      generation.current++;
      watchId.current = null;
      setState({ status: "error", message: "Не удалось включить геолокацию. Проверьте разрешение браузера или откройте сайт в отдельной вкладке.", suggestNewTab: isFramed() });
    }
  }, []);

  useEffect(() => () => {
    generation.current++;
    if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  return { state, start, stop, watching: watchId.current !== null || state.status === "active" || state.status === "requesting" };
}

function isFramed(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}
