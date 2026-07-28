import React, { useState, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";

const HISTORICO_URL = "https://raw.githubusercontent.com/agusstinamansilla/fondos-dashboard/main/historico.csv";
const HISTORICO_MEP_CCL_URL = "https://raw.githubusercontent.com/agusstinamansilla/fondos-dashboard/main/mep_ccl_historico.csv";
const PLAZO_FIJO_URL = "https://raw.githubusercontent.com/agusstinamansilla/fondos-dashboard/main/plazo_fijo_tna_diaria.csv";
const INFLACION_URL = "https://raw.githubusercontent.com/agusstinamansilla/fondos-dashboard/main/inflacion_mensual.csv";

const BASE_MS = Date.UTC(2013, 0, 1);
const DAY_MS = 86400000;

/* Categorizacion de instrumentos por moneda, segun lo confirmado */
const ITEMS_PESOS = [
  { name: "Fima Premium - Clase A", color: "#06C263", moneda: "pesos" },
  { name: "Gainvest FF - Clase A", color: "#38BDF8", moneda: "pesos" },
  { name: "Galileo Ahorro Plus - Clase A", color: "#FB7185", moneda: "pesos" },
  { name: "Plazo fijo (indice, TNA diaria)", color: "#A3E635", moneda: "pesos" },
  { name: "Inflacion (indice acumulado)", color: "#F97316", moneda: "pesos" },
];

const ITEMS_DOLARES = [
  { name: "Gainvest Global I - Clase A", color: "#F59E0B", moneda: "dolares" },
  { name: "Gainvest Renta Fija Dolares - Clase A", color: "#A78BFA", moneda: "dolares" },
  { name: "Galileo Event Driven - Clase A", color: "#34D399", moneda: "dolares" },
  { name: "Galileo Fixed Income - Clase B", color: "#F472B6", moneda: "dolares" },
  { name: "Galileo Income - Clase B", color: "#FBBF24", moneda: "dolares" },
  { name: "Galileo Multi Strategy - Clase A", color: "#60A5FA", moneda: "dolares" },
  { name: "Parakeet MM Investments Fund - Clase B", color: "#FDBA74", moneda: "dolares" },
  { name: "Dolar MEP implicito (AL30/AL30D)", color: "#22D3EE", moneda: "dolares" },
  { name: "Dolar CCL implicito (AL30/AL30C)", color: "#F87171", moneda: "dolares" },
];

const TODOS_LOS_INSTRUMENTOS = [...ITEMS_PESOS, ...ITEMS_DOLARES];

function offsetToDate(offset) {
  return new Date(BASE_MS + offset * DAY_MS);
}
function dateToOffset(date) {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((utc - BASE_MS) / DAY_MS);
}
function offsetToISO(offset) {
  return offsetToDate(offset).toISOString().slice(0, 10);
}
function isoToOffset(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return dateToOffset(new Date(Date.UTC(y, m - 1, d)));
}
function fmtDateShort(offset) {
  const d = offsetToDate(offset);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
}
function fmtPct(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const v = (x * 100).toFixed(digits);
  return (x >= 0 ? "+" : "") + v.replace(".", ",") + "%";
}
function fmtNum(x, digits = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return x.toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function parseHistoricoCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idxFondo = header.indexOf("fondo");
  const idxFecha = header.indexOf("fecha");
  const idxVcp = header.indexOf("vcp");
  const porFondo = {};
  for (let i = 1; i < lines.length; i++) {
    const linea = lines[i];
    if (!linea) continue;
    const cols = linea.split(",");
    const fondo = cols[idxFondo];
    const fecha = cols[idxFecha];
    const vcp = parseFloat(cols[idxVcp]);
    if (!fondo || !fecha || Number.isNaN(vcp)) continue;
    const offset = isoToOffset(fecha);
    if (!porFondo[fondo]) porFondo[fondo] = [];
    porFondo[fondo].push([offset, vcp]);
  }
  Object.keys(porFondo).forEach(f => porFondo[f].sort((a, b) => a[0] - b[0]));
  return porFondo;
}

function parseMepCclCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idxFecha = header.indexOf("fecha");
  const idxMep = header.indexOf("mep_implicito");
  const idxCcl = header.indexOf("ccl_implicito");
  const mep = [];
  const ccl = [];
  for (let i = 1; i < lines.length; i++) {
    const linea = lines[i];
    if (!linea) continue;
    const cols = linea.split(",");
    const fecha = cols[idxFecha];
    const valMep = parseFloat(cols[idxMep]);
    const valCcl = parseFloat(cols[idxCcl]);
    if (!fecha) continue;
    const offset = isoToOffset(fecha);
    if (!Number.isNaN(valMep)) mep.push([offset, valMep]);
    if (!Number.isNaN(valCcl)) ccl.push([offset, valCcl]);
  }
  mep.sort((a, b) => a[0] - b[0]);
  ccl.sort((a, b) => a[0] - b[0]);
  return {
    "Dolar MEP implicito (AL30/AL30D)": mep,
    "Dolar CCL implicito (AL30/AL30C)": ccl,
  };
}

/* Construye un indice sintetico (arranca en 100) componiendo dia a dia con la TNA,
   para poder comparar el plazo fijo con los fondos usando la misma logica de retorno. */
function parsePlazoFijoCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idxFecha = header.indexOf("fecha");
  const idxTna = header.indexOf("tna_diaria_pct");
  const puntos = [];
  for (let i = 1; i < lines.length; i++) {
    const linea = lines[i];
    if (!linea) continue;
    const cols = linea.split(",");
    const fecha = cols[idxFecha];
    const tna = parseFloat(cols[idxTna]);
    if (!fecha || Number.isNaN(tna)) continue;
    puntos.push([isoToOffset(fecha), tna]);
  }
  puntos.sort((a, b) => a[0] - b[0]);

  const indice = [];
  let nivel = 100;
  for (let i = 0; i < puntos.length; i++) {
    const [offset, tna] = puntos[i];
    if (i === 0) {
      indice.push([offset, nivel]);
      continue;
    }
    const diasTranscurridos = offset - puntos[i - 1][0];
    nivel = nivel * (1 + (tna / 100) * (diasTranscurridos / 365));
    indice.push([offset, nivel]);
  }
  return { "Plazo fijo (indice, TNA diaria)": indice };
}

/* Construye un indice sintetico (arranca en 100) componiendo mes a mes con la inflacion,
   asignado a la ultima fecha de cada mes (misma logica que un fondo con datos mensuales). */
function parseInflacionCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idxFecha = header.indexOf("fecha");
  const idxPct = header.indexOf("inflacion_mensual_pct");
  const puntos = [];
  for (let i = 1; i < lines.length; i++) {
    const linea = lines[i];
    if (!linea) continue;
    const cols = linea.split(",");
    const fecha = cols[idxFecha];
    const pct = parseFloat(cols[idxPct]);
    if (!fecha || Number.isNaN(pct)) continue;
    puntos.push([isoToOffset(fecha), pct]);
  }
  puntos.sort((a, b) => a[0] - b[0]);

  const indice = [];
  let nivel = 100;
  for (let i = 0; i < puntos.length; i++) {
    const [offset, pct] = puntos[i];
    if (i > 0) {
      nivel = nivel * (1 + pct / 100);
    }
    indice.push([offset, nivel]);
  }
  return { "Inflacion (indice acumulado)": indice };
}

function findAtOrBefore(series, target) {
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= target) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? series[ans] : null;
}

function computeMetrics(series) {
  if (!series || series.length === 0) return null;
  const last = series[series.length - 1];
  const [lastOffset, lastVal] = last;

  function retBack(days) {
    const ref = findAtOrBefore(series, lastOffset - days);
    if (!ref) return null;
    const [refOffset, refVal] = ref;
    const dias = lastOffset - refOffset;
    if (dias <= 0 || refVal === 0) return null;
    return { variacion: lastVal / refVal - 1, dias };
  }

  const diario = retBack(1);
  const d7 = retBack(7);
  const d30 = retBack(30);
  const d360 = retBack(360);

  const ytdTarget = isoToOffset("2026-01-01") - 1;
  const ytdRef = findAtOrBefore(series, ytdTarget);
  let ytd = null;
  if (ytdRef) {
    const [ro, rv] = ytdRef;
    if (rv !== 0) ytd = { variacion: lastVal / rv - 1, dias: lastOffset - ro };
  }

  const tna360 = d360 ? d360.variacion * (365 / d360.dias) : null;

  return { lastOffset, lastVal, diario, d7, d30, ytd, tna360 };
}

function Pill({ active, color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontFamily: "'IBM Plex Sans', sans-serif",
        border: active ? `1.5px solid ${color}` : "1.5px solid #1E3E3A",
        background: active ? `${color}22` : "transparent",
        color: active ? color : "#7FA69E",
        cursor: "pointer",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function BotonMoneda({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "'IBM Plex Sans', sans-serif",
        border: active ? "1.5px solid #3DE8A0" : "1.5px solid #1E3E3A",
        background: active ? "#3DE8A022" : "transparent",
        color: active ? "#3DE8A0" : "#7FA69E",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ChangeCell({ metric }) {
  if (!metric) return <span style={{ color: "#4A6461" }}>—</span>;
  const positive = metric.variacion >= 0;
  return (
    <span style={{ color: positive ? "#3DE8A0" : "#FF7A68", fontFamily: "'IBM Plex Mono', monospace" }}>
      {fmtPct(metric.variacion)}
    </span>
  );
}

/* Selector de moneda + pills individuales, reutilizado en las 3 secciones */
function SelectorInstrumentos({ selected, setSelected }) {
  function setMoneda(moneda) {
    const indices = TODOS_LOS_INSTRUMENTOS
      .map((it, i) => (it.moneda === moneda ? i : null))
      .filter(i => i !== null);
    setSelected(new Set(indices));
  }
  function setTodos() {
    setSelected(new Set(TODOS_LOS_INSTRUMENTOS.map((_, i) => i)));
  }
  function toggle(idx) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <BotonMoneda active={false} onClick={setTodos}>Todos</BotonMoneda>
        <BotonMoneda active={false} onClick={() => setMoneda("pesos")}>Pesos</BotonMoneda>
        <BotonMoneda active={false} onClick={() => setMoneda("dolares")}>Dolares</BotonMoneda>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {TODOS_LOS_INSTRUMENTOS.map((f, i) => (
          <Pill key={f.name} active={selected.has(i)} color={f.color} onClick={() => toggle(i)}>
            {f.name.replace(" - Clase", " ·")}
          </Pill>
        ))}
      </div>
    </div>
  );
}

export default function FondosDashboard() {
  const [seriesData, setSeriesData] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(HISTORICO_URL, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("historico.csv " + r.status); return r.text(); }),
      fetch(HISTORICO_MEP_CCL_URL, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("mep_ccl_historico.csv " + r.status); return r.text(); }),
      fetch(PLAZO_FIJO_URL, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("plazo_fijo_tna_diaria.csv " + r.status); return r.text(); }),
      fetch(INFLACION_URL, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("inflacion_mensual.csv " + r.status); return r.text(); }),
    ])
      .then(([tFondos, tMepCcl, tPlazoFijo, tInflacion]) => {
        setSeriesData({
          ...parseHistoricoCSV(tFondos),
          ...parseMepCclCSV(tMepCcl),
          ...parsePlazoFijoCSV(tPlazoFijo),
          ...parseInflacionCSV(tInflacion),
        });
      })
      .catch(err => setLoadError(err.message));
  }, []);

  const globalOffsets = useMemo(() => {
    if (!seriesData) return { min: 0, max: 0 };
    let min = Infinity, max = -Infinity;
    TODOS_LOS_INSTRUMENTOS.forEach(f => {
      const s = seriesData[f.name];
      if (s && s.length) {
        min = Math.min(min, s[0][0]);
        max = Math.max(max, s[s.length - 1][0]);
      }
    });
    return { min, max };
  }, [seriesData]);

  // Un solo filtro de instrumentos, compartido entre las 3 secciones
  const [seleccion, setSeleccion] = useState(() => new Set(ITEMS_PESOS.map((_, i) => i)));
  const [compFrom, setCompFrom] = useState(null);
  const [compTo, setCompTo] = useState(null);
  const [chartFrom, setChartFrom] = useState(null);
  const [chartTo, setChartTo] = useState(null);

  useEffect(() => {
    if (seriesData && globalOffsets.max) {
      setChartFrom(offsetToISO(Math.max(globalOffsets.max - 365, globalOffsets.min)));
      setChartTo(offsetToISO(globalOffsets.max));
      setCompFrom(offsetToISO(Math.max(globalOffsets.max - 30, globalOffsets.min)));
      setCompTo(offsetToISO(globalOffsets.max));
    }
  }, [seriesData, globalOffsets]);

  const metricsAll = useMemo(() => {
    if (!seriesData) return [];
    return TODOS_LOS_INSTRUMENTOS.map(f => ({ fund: f, m: computeMetrics(seriesData[f.name]) }));
  }, [seriesData]);

  const metricsRend = useMemo(
    () => metricsAll.filter((_, i) => seleccion.has(i)),
    [metricsAll, seleccion]
  );

  function setQuickRange(days) {
    const from = days === null ? globalOffsets.min : Math.max(globalOffsets.max - days, globalOffsets.min);
    setChartFrom(offsetToISO(from));
    setChartTo(offsetToISO(globalOffsets.max));
  }

  const chartData = useMemo(() => {
    if (!seriesData || !chartFrom || !chartTo) return [];
    const fromOffset = isoToOffset(chartFrom);
    const toOffset = isoToOffset(chartTo);
    const selectedFunds = TODOS_LOS_INSTRUMENTOS.filter((_, i) => seleccion.has(i));
    if (selectedFunds.length === 0 || toOffset <= fromOffset) return [];

    const baselines = {};
    selectedFunds.forEach(f => {
      const series = seriesData[f.name] || [];
      const base = findAtOrBefore(series, fromOffset);
      baselines[f.name] = base ? base[1] : null;
    });

    const offsetSet = new Set();
    selectedFunds.forEach(f => {
      (seriesData[f.name] || []).forEach(([o]) => {
        if (o >= fromOffset && o <= toOffset) offsetSet.add(o);
      });
    });
    const offsets = Array.from(offsetSet).sort((a, b) => a - b);

    return offsets.map(o => {
      const row = { offset: o };
      selectedFunds.forEach(f => {
        const base = baselines[f.name];
        if (base === null || base === undefined) { row[f.name] = null; return; }
        const point = findAtOrBefore(seriesData[f.name] || [], o);
        row[f.name] = point ? (point[1] / base - 1) * 100 : null;
      });
      return row;
    });
  }, [seriesData, seleccion, chartFrom, chartTo]);

  const compResults = useMemo(() => {
    if (!seriesData || !compFrom || !compTo) return [];
    const fromOffset = isoToOffset(compFrom);
    const toOffset = isoToOffset(compTo);
    return TODOS_LOS_INSTRUMENTOS.filter((_, i) => seleccion.has(i)).map(f => {
      const series = seriesData[f.name] || [];
      const from = findAtOrBefore(series, fromOffset);
      const to = findAtOrBefore(series, toOffset);
      if (!from || !to || from[1] === 0) return { fund: f, variacion: null };
      return { fund: f, variacion: to[1] / from[1] - 1 };
    });
  }, [seriesData, seleccion, compFrom, compTo]);

  if (loadError) {
    return (
      <div style={{ background: "#06211F", color: "#FF7A68", padding: 40, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        No se pudo cargar el historico: {loadError}.
      </div>
    );
  }

  if (!seriesData) {
    return (
      <div style={{ background: "#06211F", color: "#7FA69E", padding: 40, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        Cargando datos...
      </div>
    );
  }

  return (
    <div style={{
      background: "#06211F",
      color: "#EAF6F2",
      fontFamily: "'IBM Plex Sans', sans-serif",
      minHeight: "100%",
      padding: 0,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        input[type="date"] {
          background: #0C302D; border: 1px solid #1E3E3A; color: #EAF6F2;
          border-radius: 8px; padding: 7px 10px; font-family: 'IBM Plex Mono', monospace;
          font-size: 13px; color-scheme: dark;
        }
        table.metrics-table { border-collapse: collapse; width: 100%; }
        table.metrics-table th, table.metrics-table td {
          padding: 10px 12px; text-align: right; border-bottom: 1px solid #123B3A;
          font-size: 13px; white-space: nowrap;
        }
        table.metrics-table th:first-child, table.metrics-table td:first-child { text-align: left; }
        table.metrics-table th {
          color: #7FA69E; font-weight: 500; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
      `}</style>

      <div style={{ padding: "36px 32px 20px", borderBottom: "1px solid #123B3A" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.15em", color: "#3DE8A0", fontWeight: 600, marginBottom: 8 }}>
          PANEL DE SEGUIMIENTO
        </div>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Fondos, dolar, plazo fijo e inflacion
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "#7FA69E", fontFamily: "'IBM Plex Mono', monospace" }}>
          {TODOS_LOS_INSTRUMENTOS.length} instrumentos · datos al {fmtDateShort(globalOffsets.max)}
        </div>
      </div>

      <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: 40 }}>

        <SelectorInstrumentos selected={seleccion} setSelected={setSeleccion} />

        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Rendimientos</h2>
          <div style={{ fontSize: 13, color: "#7FA69E", marginBottom: 16 }}>
            Elegi Pesos, Dolares, Todos, o marca instrumentos puntuales. Plazo fijo e inflacion se muestran como indice, para comparar de igual a igual con los fondos.
          </div>
          <div style={{ overflowX: "auto", background: "#0A2B29", borderRadius: 12, border: "1px solid #123B3A" }}>
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Instrumento</th>
                  <th>Valor</th>
                  <th>Diario</th>
                  <th>7 dias</th>
                  <th>30 dias</th>
                  <th>YTD 2026</th>
                  <th>TNA (360d)</th>
                </tr>
              </thead>
              <tbody>
                {metricsRend.length === 0 && (
                  <tr><td colSpan={7} style={{ color: "#4A6461", textAlign: "center", padding: 24 }}>Elegi al menos un instrumento arriba.</td></tr>
                )}
                {metricsRend.map(({ fund, m }) => (
                  <tr key={fund.name}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: fund.color, flexShrink: 0 }} />
                        {fund.name}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{m ? fmtNum(m.lastVal, 2) : "—"}</td>
                    <td><ChangeCell metric={m ? m.diario : null} /></td>
                    <td><ChangeCell metric={m ? m.d7 : null} /></td>
                    <td><ChangeCell metric={m ? m.d30 : null} /></td>
                    <td><ChangeCell metric={m ? m.ytd : null} /></td>
                    <td><ChangeCell metric={m ? (m.tna360 ? { variacion: m.tna360 } : null) : null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Comparar variacion entre dos fechas</h2>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, color: "#7FA69E", display: "flex", alignItems: "center", gap: 8 }}>
              Desde
              <input type="date" value={compFrom || ""} min={offsetToISO(globalOffsets.min)} max={compTo || undefined} onChange={e => setCompFrom(e.target.value)} />
            </label>
            <label style={{ fontSize: 13, color: "#7FA69E", display: "flex", alignItems: "center", gap: 8 }}>
              Hasta
              <input type="date" value={compTo || ""} min={compFrom || undefined} max={offsetToISO(globalOffsets.max)} onChange={e => setCompTo(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {compResults.length === 0 && (
              <div style={{ color: "#4A6461", fontSize: 13 }}>Elegi al menos un instrumento para comparar.</div>
            )}
            {compResults.map(({ fund, variacion }) => (
              <div key={fund.name} style={{ background: "#0A2B29", border: "1px solid #123B3A", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: fund.color }} />
                  <span style={{ fontSize: 13, color: "#B9D6D0" }}>{fund.name}</span>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: variacion === null ? "#4A6461" : variacion >= 0 ? "#3DE8A0" : "#FF7A68" }}>
                  {variacion === null ? "Sin datos" : fmtPct(variacion)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Evolucion comparada</h2>
          <div style={{ fontSize: 13, color: "#7FA69E", marginBottom: 16 }}>
            Variacion % indexada a 0 en el inicio del rango elegido
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, color: "#7FA69E", display: "flex", alignItems: "center", gap: 8 }}>
              Desde
              <input type="date" value={chartFrom || ""} min={offsetToISO(globalOffsets.min)} max={chartTo || undefined} onChange={e => setChartFrom(e.target.value)} />
            </label>
            <label style={{ fontSize: 13, color: "#7FA69E", display: "flex", alignItems: "center", gap: 8 }}>
              Hasta
              <input type="date" value={chartTo || ""} min={chartFrom || undefined} max={offsetToISO(globalOffsets.max)} onChange={e => setChartTo(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              {[["1M", 30], ["3M", 90], ["6M", 180], ["1A", 365], ["Todo", null]].map(([label, days]) => (
                <button key={label} onClick={() => setQuickRange(days)} style={{
                  fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid #1E3E3A",
                  background: "transparent", color: "#7FA69E", cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ background: "#0A2B29", border: "1px solid #123B3A", borderRadius: 12, padding: "20px 16px 8px", height: 420 }}>
            {chartData.length === 0 ? (
              <div style={{ color: "#4A6461", fontSize: 13, textAlign: "center", paddingTop: 160 }}>
                Elegi al menos un instrumento y un rango de fechas valido.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="#123B3A" vertical={false} />
                  <XAxis dataKey="offset" tickFormatter={fmtDateShort} stroke="#4A6461"
                    tick={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }} minTickGap={40} />
                  <YAxis stroke="#4A6461" tick={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickFormatter={v => v.toFixed(0) + "%"} width={48} />
                  <ReferenceLine y={0} stroke="#1E3E3A" />
                  <Tooltip
                    contentStyle={{ background: "#0C302D", border: "1px solid #1E3E3A", borderRadius: 8, fontSize: 12 }}
                    labelFormatter={fmtDateShort}
                    formatter={(v, name) => [v === null ? "—" : v.toFixed(2) + "%", name]}
                    itemStyle={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    labelStyle={{ color: "#EAF6F2", marginBottom: 4 }}
                  />
                  {TODOS_LOS_INSTRUMENTOS.filter((_, i) => seleccion.has(i)).map(f => (
                    <Line key={f.name} type="monotone" dataKey={f.name} stroke={f.color}
                      strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
