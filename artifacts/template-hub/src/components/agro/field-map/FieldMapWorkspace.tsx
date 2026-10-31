import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, LocateFixed, Map as MapIcon, Navigation, RefreshCw, Square, TriangleAlert } from "lucide-react";
import { getGetFieldDashboardQueryKey, getGetFieldMapQueryKey, useGetFieldDashboard, useGetFieldMap, type FieldBoundary } from "@workspace/api-client-react";
import { FieldHistoryPanel } from "./FieldHistoryPanel";
import { useGeolocation } from "./useGeolocation";
import { distanceText, locate, rankBoundaries } from "./geo";
import { cx, errorInfo, ha } from "../fields/shared";

const READ_ROLES = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"];
const BASE = { color: "hsl(203 87% 33%)", weight: 2, fillOpacity: 0.12 };
const SELECTED = { color: "hsl(30 80% 42%)", weight: 3.5, fillOpacity: 0.28 };
const toLatLngs = (b: FieldBoundary) => b.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));
const byNumber = (a: FieldBoundary, b: FieldBoundary) => a.unit.localeCompare(b.unit) || a.fieldNumber.localeCompare(b.fieldNumber, "ru", { numeric: true });

export default function FieldMapWorkspace({ role }: { role: string }) {
  const allowed = READ_ROLES.includes(role);
  const mapQ = useGetFieldMap({ query: { queryKey: getGetFieldMapQueryKey(), refetchInterval: 30000, enabled: allowed } });
  const dashQ = useGetFieldDashboard({ query: { queryKey: getGetFieldDashboardQueryKey(), refetchInterval: 30000, enabled: allowed } });
  const boundaries = useMemo(() => [...(mapQ.data?.boundaries ?? [])].filter((b) => b.geometry?.coordinates?.[0]?.length >= 4).sort(byNumber), [mapQ.data]);
  const fieldById = useMemo(() => new Map((dashQ.data?.fields ?? []).map((f) => [f.id, f])), [dashQ.data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = boundaries.find((b) => b.fieldId === selectedId);
  const geo = useGeolocation();
  const [follow, setFollow] = useState(true);
  const [tilesDown, setTilesDown] = useState(false);
  const mapReady = allowed && mapQ.isSuccess && boundaries.length > 0;

  const mapEl = useRef<HTMLDivElement>(null);
  const detailsEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef(new Map<number, L.Polygon>());
  const me = useRef<{ dot: L.CircleMarker; ring: L.Circle } | null>(null);
  const fitted = useRef(false);
  const selectRef = useRef((id: number) => { void id; });
  selectRef.current = (id: number) => {
    setSelectedId(id); setFollow(false);
    if (id === selectedId) detailsEl.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  useEffect(() => {
    if (selectedId !== null && dashQ.data) detailsEl.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId, !!dashQ.data]);

  // create map once
  useEffect(() => {
    if (!mapReady || !mapEl.current || map.current) return;
    const m = L.map(mapEl.current, { zoomControl: true, keyboard: true, attributionControl: true, center: [53.2, 63.6], zoom: 11 });
    let loaded = 0; let errors = 0;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
      .on("tileload", () => { loaded++; setTilesDown(false); })
      .on("tileerror", () => { errors++; if (errors >= 3 && loaded === 0) setTilesDown(true); })
      .addTo(m);
    m.on("dragstart", () => setFollow(false));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(mapEl.current);
    const ls = layers.current;
    return () => { ro.disconnect(); m.remove(); map.current = null; ls.clear(); me.current = null; fitted.current = false; };
  }, [mapReady]);

  // sync polygons
  useEffect(() => {
    const m = map.current; if (!m) return;
    const ls = layers.current;
    const keep = new Set(boundaries.map((b) => b.fieldId));
    for (const [id, layer] of ls) if (!keep.has(id)) { layer.remove(); ls.delete(id); }
    for (const b of boundaries) {
      const existing = ls.get(b.fieldId);
      if (existing) { existing.setLatLngs(toLatLngs(b)); continue; }
      const poly = L.polygon(toLatLngs(b), { ...BASE, fillColor: BASE.color });
      const label = document.createElement("span");
      label.textContent = `№ ${b.fieldNumber}`; // DOM text only, never HTML interpolation
      poly.bindTooltip(label, { permanent: true, direction: "center", className: "field-map-label" });
      poly.on("click", () => selectRef.current(b.fieldId));
      poly.addTo(m); ls.set(b.fieldId, poly);
    }
    if (!fitted.current && boundaries.length) {
      const all = L.featureGroup([...ls.values()]);
      m.fitBounds(all.getBounds(), { padding: [24, 24] }); fitted.current = true;
    }
  }, [boundaries, mapReady]);

  // selection style + fly
  useEffect(() => {
    for (const [id, layer] of layers.current) {
      const s = id === selectedId ? SELECTED : BASE;
      layer.setStyle({ ...s, fillColor: s.color });
      if (id === selectedId) layer.bringToFront();
    }
    const sel = selectedId != null ? layers.current.get(selectedId) : undefined;
    if (sel && map.current) map.current.fitBounds(sel.getBounds(), { padding: [40, 40], maxZoom: 15 });
  }, [selectedId, boundaries, mapReady]);

  // GPS marker
  const pos = geo.state.status === "active" ? geo.state : null;
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!pos) { if (me.current) { me.current.dot.remove(); me.current.ring.remove(); me.current = null; } return; }
    const ll: [number, number] = [pos.lat, pos.lng];
    if (!me.current) {
      me.current = {
        ring: L.circle(ll, { radius: pos.accuracy, color: "hsl(152 55% 32%)", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(m),
        dot: L.circleMarker(ll, { radius: 7, color: "hsl(40 33% 97%)", weight: 3, fillColor: "hsl(152 55% 32%)", fillOpacity: 1, interactive: false }).addTo(m),
      };
    } else { me.current.dot.setLatLng(ll); me.current.ring.setLatLng(ll).setRadius(pos.accuracy); }
    if (follow) m.panTo(ll, { animate: true });
  }, [pos?.lat, pos?.lng, pos?.accuracy, follow, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => boundaries.map((b) => ({ fieldId: b.fieldId, coordinates: b.geometry.coordinates })), [boundaries]);
  const verdict = useMemo(() => pos ? locate([pos.lng, pos.lat], pos.accuracy, items) : null, [pos?.lat, pos?.lng, pos?.accuracy, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => pos ? rankBoundaries([pos.lng, pos.lat], items) : [], [pos?.lat, pos?.lng, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const bById = useMemo(() => new Map(boundaries.map((b) => [b.fieldId, b])), [boundaries]);
  const name = (id: number) => { const b = bById.get(id); return b ? `№ ${b.fieldNumber}` : "?"; };
  const defaultYear = dashQ.data ? Number(dashQ.data.asOfDate.slice(0, 4)) : new Date().getFullYear();

  if (!allowed) return <div className="surface-card empty-state" data-testid="status-field-map-forbidden"><h3 className="text-sm font-bold">Нет доступа к карте полей</h3></div>;

  return (
    <div className="space-y-4" data-testid="field-map-workspace">
      <style>{`.field-map-shell{isolation:isolate;position:relative;z-index:0}.field-map-shell .leaflet-container{background:hsl(var(--muted));font:inherit}.field-map-label{background:hsl(var(--card));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:6px;padding:1px 6px;font-family:ui-monospace,monospace;font-weight:700;font-size:11px;box-shadow:none}.field-map-label:before{display:none}.dark .field-map-shell .leaflet-tile-pane{filter:brightness(.72) contrast(1.1) saturate(.8)}`}</style>
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Агрономия · контуры полей</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.045em] sm:text-3xl">Карта полей</h1>
          <p className="mt-1 text-xs text-muted-foreground">Узнайте поле рядом с вами и откройте его историю работ. Обновление каждые 30 с
            {(mapQ.isFetching || dashQ.isFetching) && !mapQ.isLoading && <span className="ml-2 inline-flex items-center gap-1 text-[hsl(203_87%_33%)]"><RefreshCw size={11} className="animate-spin" />синхронизация</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {geo.state.status === "idle" || geo.state.status === "error"
            ? <button type="button" className="button button-primary" onClick={() => { setFollow(true); geo.start(); }} disabled={!boundaries.length} data-testid="button-map-locate"><LocateFixed size={14} />Где я</button>
            : <button type="button" className="button button-secondary" onClick={geo.stop} data-testid="button-map-locate-stop"><Square size={13} />Остановить</button>}
          {pos && !follow && <button type="button" className="button button-secondary" onClick={() => setFollow(true)} data-testid="button-map-follow"><Crosshair size={14} />Следовать за мной</button>}
        </div>
      </header>

      {mapQ.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]" data-testid="status-field-map-loading"><div className="skeleton h-[60vh] min-h-[320px] rounded-xl" /><div className="skeleton h-64 rounded-xl" /></div>
      ) : mapQ.isError ? (
        <div className="surface-card empty-state" data-testid="status-field-map-error"><div className="empty-icon empty-icon-error"><TriangleAlert size={20} /></div><h3 className="mt-4 text-sm font-bold">Не удалось загрузить контуры</h3><p className="mt-1 text-xs text-muted-foreground">{errorInfo(mapQ.error).message}</p>
          <button type="button" className="button button-secondary mt-4" onClick={() => mapQ.refetch()} data-testid="button-field-map-retry">Повторить</button></div>
      ) : boundaries.length === 0 ? (
        <div className="surface-card empty-state" data-testid="status-field-map-empty"><div className="empty-icon"><MapIcon size={20} /></div><h3 className="mt-4 text-sm font-bold">Контуры полей не загружены</h3><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Когда границы полей будут импортированы, они появятся на карте.</p></div>
      ) : (
        <>
          <GeoStatus state={geo.state} verdict={verdict} name={name} nearest={ranked.slice(0, 3)} onSelect={(id) => selectRef.current(id)} />
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="field-map-shell surface-card overflow-hidden !p-0">
              <div ref={mapEl} className="h-[58vh] min-h-[320px] w-full lg:h-[68vh]" role="region" aria-label="Интерактивная карта полей. Стрелки перемещают карту, плюс и минус меняют масштаб." tabIndex={0} data-testid="map-fields" />
              {tilesDown && <div className="absolute inset-x-3 top-3 z-[500] rounded-lg border border-border bg-card/95 px-3 py-2 text-[11px]" role="status" data-testid="status-map-tiles-down"><b>Подложка OpenStreetMap не загружается.</b> Нет связи с сервером карт; контуры полей показаны без подложки.</div>}
              {dashQ.isError && <div className="absolute inset-x-3 bottom-8 z-[500] rounded-lg border border-border bg-card/95 px-3 py-2 text-[11px]" role="status">История полей не загрузилась. <button type="button" className="font-bold underline" onClick={() => dashQ.refetch()} data-testid="button-map-dashboard-retry">Повторить</button></div>}
            </div>
            <div className="flex min-h-0 flex-col gap-3 lg:max-h-[68vh]">
              {selected ? <div className="surface-card px-4 py-3 text-xs" data-testid="text-map-selected-hint">Выбрано поле <b className="font-mono">№ {selected.fieldNumber}</b> — план и факт работ ниже.</div>
                : <div className="surface-card px-4 py-3 text-xs text-muted-foreground" data-testid="text-map-hint">Нажмите на контур или выберите поле в списке, чтобы увидеть план и факт работ.</div>}
              <nav className="surface-card min-h-0 overflow-y-auto" aria-label="Список полей на карте">
                <ul className="divide-y divide-border/70">
                  {boundaries.map((b) => (
                    <li key={b.fieldId}><button type="button" onClick={() => selectRef.current(b.fieldId)} aria-pressed={b.fieldId === selectedId} data-testid={`button-map-select-field-${b.fieldId}`}
                      className={cx("flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-xs hover:bg-muted/40 focus-visible:bg-muted/40", b.fieldId === selectedId && "bg-muted/60")}>
                      <span><span className="font-mono font-bold">№ {b.fieldNumber}</span> <span className="text-[10.5px] text-muted-foreground">{b.unit}</span></span>
                      <span className="font-mono text-[10.5px] text-muted-foreground">{ha(fieldById.get(b.fieldId)?.areaHa ?? b.areaHa)}</span>
                    </button></li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
          {selected && <div ref={detailsEl} className="scroll-mt-24">
            {dashQ.isLoading ? <div className="skeleton h-64 rounded-xl" data-testid="status-map-field-loading" /> : dashQ.isError && !dashQ.data ? null :
            <FieldHistoryPanel key={selected.fieldId} role={role} boundary={selected} field={fieldById.get(selected.fieldId)} seasons={dashQ.data?.seasons ?? []} operations={dashQ.data?.operations ?? []} defaultYear={defaultYear} onClose={() => {
              setSelectedId(null); mapEl.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }} />}
          </div>}
          <p className="text-[10.5px] text-muted-foreground">Геопозиция используется только на этой странице, пока она открыта и включена кнопкой «Где я». Координаты не сохраняются и не отправляются на сервер; фонового отслеживания нет.</p>
        </>
      )}
    </div>
  );
}

function GeoStatus({ state, verdict, name, nearest, onSelect }: {
  state: ReturnType<typeof useGeolocation>["state"]; verdict: ReturnType<typeof locate> | null; name: (id: number) => string;
  nearest: { fieldId: number; inside: boolean; distanceM: number }[]; onSelect: (id: number) => void;
}) {
  if (state.status === "idle") return null;
  if (state.status === "error") return <div className="notice-banner" role="alert" data-testid="status-geo-error"><TriangleAlert size={14} /><span>{state.message}{state.suggestNewTab && <> <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="font-bold underline" data-testid="link-geo-open-new-tab">Открыть в новой вкладке</a></>}</span></div>;
  if (state.status === "requesting" || !verdict) return <div className="surface-card px-4 py-2.5 text-xs" role="status" data-testid="status-geo-requesting"><Navigation size={13} className="mr-1.5 inline animate-pulse" />Определяем местоположение…</div>;
  const acc = `точность ±${Math.round(state.status === "active" ? state.accuracy : 0)} м`;
  let text = "";
  if (verdict.kind === "inside") text = verdict.certain ? `Вы на поле ${name(verdict.fieldId)}` : `Вероятно, на поле ${name(verdict.fieldId)}, но до границы ${distanceText(verdict.edgeM)} — меньше погрешности GPS`;
  else if (verdict.kind === "edge") text = `По GPS — у границы поля ${name(verdict.fieldId)}`;
  else if (verdict.kind === "outside") text = verdict.certain ? `Вне контуров. Ближайшее поле ${name(verdict.fieldId)}: ${distanceText(verdict.distanceM)} до границы` : `Рядом с границей поля ${name(verdict.fieldId)} (${distanceText(verdict.distanceM)}). Погрешность GPS не позволяет точно сказать, внутри вы или снаружи`;
  else text = "Контуров для сравнения нет";
  const primary = verdict.kind === "none" ? null : verdict.fieldId;
  return (
    <div className="surface-card flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite" data-testid="status-geo-verdict">
      <div><p className="text-sm font-bold">{text}</p><p className="text-[10.5px] text-muted-foreground">{acc} · расстояние до ближайшей границы контура, не до центра</p></div>
      <div className="flex flex-wrap gap-1.5">
        {primary != null && <button type="button" className="button button-primary !min-h-[30px] text-[11px]" onClick={() => onSelect(primary)} data-testid="button-geo-open-field">Открыть {name(primary)}</button>}
        {nearest.filter((n) => n.fieldId !== primary).slice(0, 2).map((n) => <button key={n.fieldId} type="button" className="button button-secondary !min-h-[30px] text-[11px]" onClick={() => onSelect(n.fieldId)} data-testid={`button-geo-nearby-${n.fieldId}`}>{name(n.fieldId)} · {distanceText(n.distanceM)}</button>)}
      </div>
    </div>
  );
}
