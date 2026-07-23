import React, { useState, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";

const HISTORICO_URL = "https://raw.githubusercontent.com/agusstinamansilla/fondos-dashboard/main/historico.csv";

const BASE_MS = Date.UTC(2013, 0, 1);
const DAY_MS = 86400000;

const FUNDS = [
  { name: "Fima Premium - Clase A", color: "#06C263" },
  { name: "Gainvest FF - Clase A", color: "#38BDF8" },
  { name: "Gainvest Global I - Clase A", color: "#F59E0B" },
  { name: "Gainvest Renta Fija Dolares - Clase A", color: "#A78BFA" },
  { name: "Galileo Ahorro Plus - Clase A", color: "#FB7185" },
  { name: "Galileo Event Driven - Clase A", color: "#34D399" },
  { name: "Galileo Fixed Income - Clase B", color: "#F472B6" },
  { name: "Galileo Income - Clase B", color: "#FBBF24" },
  { name: "Galileo Multi Strategy - Clase A", color: "#60A5FA" },
  { name: "Parakeet MM Investments Fund - Clase B", color: "#FDBA74" },
];

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

function ChangeCell({ metric }) {
  if (!metric) return <span style={{ color: "#4A6461" }}>—</span>;
  const positive = metric.variacion >= 0;
  return (
    <span style={{ color: positive ? "#3DE8A0" : "#FF7A68", fontFamily: "'IBM Plex Mono', monospace" }}>
      {fmtPct(metric.variacion)}
    </span>
  );
}

export default function FondosDashboard() {
  const [seriesData, setSeriesData] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    fetch(HISTORICO_URL, { cache: "no-store" })
      .then(res => {
        if (!res.ok) throw new Error(`No se pudo descargar historico.csv (status ${res.status})`);
        return res.text();
      })
      .then(text => setSeriesData(parseHistoricoCSV(text)))
      .catch(err => setLoadError(err.message));
  }, []);

  const globalOffsets = useMemo(() => {
    if (!seriesData) return { min: 0, max: 0 };
    let min = Infinity, max = -Infinity;
    FUNDS.forEach(f => {
      const s = seriesData[f.name];
      if (s && s.length) {
        min = Math.min(min, s[0][0]);
        max = Math.max(max, s[s.length - 1][0]);
      }
    });
    return { min, max };
  }, [seriesData]);

  const [chartSelected, setChartSelected] = useState(() => new Set([0, 3, 9]));
  const [chartFrom, setChartFrom] = useState(null);
  const [chartTo, setChartTo] = useState(null);
  const [compSelected, setCompSelected] = useState(() => new Set([3]));
  const [compFrom, setCompFrom] = useState(null);
  const [compTo, setCompTo] = useState(null);

  useEffect(() => {
    if (seriesData && globalOffsets.max) {
      setChartFrom(offsetToISO(Math.max(globalOffsets.max - 365, globalOffsets.min)));
      setChartTo(offsetToISO(globalOffsets.max));
      setCompFrom(offsetToISO(Math.max(globalOffsets.max - 30, globalOffsets.min)));
      setCompTo(offsetToISO(globalOffsets.max));
    }
  }, [seriesData, globalOffsets]);

  const metrics = useMemo(() => {
    if (!seriesData) return [];
    return FUNDS.map(f => ({ fund: f, m: computeMetrics(seriesData[f.name]) }));
  }, [seriesData]);

  function toggle(setFn, idx) {
    setFn(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function setQuickRange(days) {
    const from = days === null ? globalOffsets.min : Math.max(globalOffsets.max - days, globalOffsets.min);
    setChartFrom(offsetToISO(from));
    setChartTo(offsetToISO(globalOffsets.max));
  }

  const chartData = useMemo(() => {
    if (!seriesData || !chartFrom || !chartTo) return [];
    const fromOffset = isoToOffset(chartFrom);
    const toOffset = isoToOffset(chartTo);
    const selectedFunds = FUNDS.filter((_, i) => chartSelected.has(i));
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
  }, [seriesData, chartSelected, chartFrom, chartTo]);

  const compResults = useMemo(() => {
    if (!seriesData || !compFrom || !compTo) return [];
    const fromOffset = isoToOffset(compFrom);
    const toOffset = isoToOffset(compTo);
    return FUNDS.filter((_, i) => compSelected.has(i)).map(f => {
      const series = seriesData[f.name] || [];
      const from = findAtOrBefore(series, fromOffset);
      const to = findAtOrBefore(series, toOffset);
      if (!from || !to || from[1] === 0) return { fund: f, variacion: null };
      return { fund: f, variacion: to[1] / from[1] - 1 };
    });
  }, [seriesData, compSelected, compFrom, compTo]);

  const tickerItems = metrics.filter(({ m }) => m && m.diario);

  if (loadError) {
    return (
      <div style={{ background: "#06211F", color: "#FF7A68", padding: 40, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        No se pudo cargar el historico: {loadError}. Revisa que HISTORICO_URL apunte a tu historico.csv en GitHub (raw).
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
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: ticker-scroll 45s linear infinite;
        }
        .ticker-wrap:hover .ticker-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track { animation: none; flex-wrap: wrap; }
        }
        input[type="date"] {
          background: #0C302D;
          border: 1px solid #1E3E3A;
          color: #EAF6F2;
          border-radius: 8px;
          padding: 7px 10px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          color-scheme: dark;
        }
        table.metrics-table { border-collapse: collapse; width: 100%; }
        table.metrics-table th, table.metrics-table td {
          padding: 10px 12px;
          text-align: right;
          border-bottom: 1px solid #123B3A;
          font-size: 13px;
          white-space: nowrap;
        }
        table.metrics-table th:first-child, table.metrics-table td:first-child {
          text-align: left;
        }
        table.metrics-table th {
          color: #7FA69E;
          font-weight: 500;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div style={{ padding: "36px 32px 20px", borderBottom: "1px solid #123B3A" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.15em", color: "#3DE8A0", fontWeight: 600, marginBottom: 8 }}>
          PANEL DE SEGUIMIENTO
        </div>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Fondos comunes de inversión
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "#7FA69E", fontFamily: "'IBM Plex Mono', monospace" }}>
          {FUNDS.length} fondos · datos al {fmtDateShort(globalOffsets.max)} · fuente: GitHub (historico.csv)
        </div>
      </div>

      <div className="ticker-wrap" style={{ overflow: "hidden", borderBottom: "1px solid #123B3A", background: "#0A2B29" }}>
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map(({ fund, m }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRight: "1px solid #123B3A" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: fund.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#B9D6D0", fontWeight: 500 }}>{fund.name.replace(" - Clase", " ·")}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: m.diario && m.diario.variacion >= 0 ? "#3DE8A0" : "#FF7A68" }}>
                {fmtPct(m.diario ? m.diario.variacion : null)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: 40 }}>

        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Rendimientos</h2>
          <div style={{ fontSize: 13, color: "#7FA69E", marginBottom: 16 }}>
            Variación directa a la fecha de corte · TNA anualizada a tasa simple sobre 360 días
          </div>
          <div style={{ overflowX: "auto", background: "#0A2B29", borderRadius: 12, border: "1px solid #123B3A" }}>
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>Fondo</th>
                  <th>VCP</th>
                  <th>Diario</th>
                  <th>7 días</th>
                  <th>30 días</th>
                  <th>YTD 2026</th>
                  <th>TNA (360d)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map(({ fund, m }) => (
                  <tr key={fund.name}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: fund.color, flexShrink: 0 }} />
                        {fund.name}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{m ? fmtNum(m.lastVal) : "—"}</td>
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
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Comparar variación entre dos fechas</h2>
          <div style={{ fontSize: 13, color: "#7FA69E", marginBottom: 16 }}>
            Elegí los fondos y el rango de fechas de cuotaparte a comparar
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {FUNDS.map((f, i) => (
              <Pill key={f.name} active={compSelected.has(i)} color={f.color} onClick={() => toggle(setCompSelected, i)}>
                {f.name.replace(" - Clase", " ·")}
              </Pill>
            ))}
          </div>
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
              <div style={{ color: "#4A6461", fontSize: 13 }}>Elegí al menos un fondo para comparar.</div>
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
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Evolución comparada</h2>
          <div style={{ fontSize: 13, color: "#7FA69E", marginBottom: 16 }}>
            Variación % indexada a 0 en el inicio del rango elegido
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {FUNDS.map((f, i) => (
              <Pill key={f.name} active={chartSelected.has(i)} color={f.color} onClick={() => toggle(setChartSelected, i)}>
                {f.name.replace(" - Clase", " ·")}
              </Pill>
            ))}
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
                Elegí al menos un fondo y un rango de fechas válido.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="#123B3A" vertical={false} />
                  <XAxis
                    dataKey="offset"
                    tickFormatter={fmtDateShort}
                    stroke="#4A6461"
                    tick={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}
                    minTickGap={40}
                  />
                  <YAxis
                    stroke="#4A6461"
                    tick={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickFormatter={v => v.toFixed(0) + "%"}
                    width={48}
                  />
                  <ReferenceLine y={0} stroke="#1E3E3A" />
                  <Tooltip
                    contentStyle={{ background: "#0C302D", border: "1px solid #1E3E3A", borderRadius: 8, fontSize: 12 }}
                    labelFormatter={fmtDateShort}
                    formatter={(v, name) => [v === null ? "—" : v.toFixed(2) + "%", name]}
                    itemStyle={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    labelStyle={{ color: "#EAF6F2", marginBottom: 4 }}
                  />
                  {FUNDS.filter((_, i) => chartSelected.has(i)).map(f => (
                    <Line
                      key={f.name}
                      type="monotone"
                      dataKey={f.name}
                      stroke={f.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
            {FUNDS.filter((_, i) => chartSelected.has(i)).map(f => (
              <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#B9D6D0" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: f.color }} />
                {f.name}
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
