import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
  ReferenceDot, ReferenceLine, LabelList
} from 'recharts';
import { Sun, History, TrendingUp } from 'lucide-react';

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);

  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255
  };
};

const mixColor = (a, b, t) => {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);

  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b2 = Math.round(c1.b + (c2.b - c1.b) * t);

  return `rgb(${r}, ${g}, ${b2})`;
};


// Colore corrispondente a un punto della scala 0 → 1
const solarScaleColor = (score) => {
  const s = Math.max(0, Math.min(1, score));

  // ambra scuro → rame → oro → bianco caldo
  if (s <= 0.35) {
    return mixColor("#b45309", "#c2410c", s / 0.35);
  }

  if (s <= 0.65) {
    return mixColor(
      "#c2410c",
      "#fbbf24",
      (s - 0.35) / 0.30
    );
  }

  return mixColor(
    "#fbbf24",
    "#d6c9ae",
    (s - 0.65) / 0.35
  );
};


const SolarGradientBar = ({
  x,
  y,
  width,
  height,
  payload,
  side,
  min,
  max
}) => {

  const realValue =
    side === 'prua'
      ? Number(payload.solar_prua) || 0
      : Number(payload.solar_poppa) || 0;

  if (realValue <= 0 || !height) return null;

// Recharts può fornire height negativa per le barre sotto lo zero.
// Normalizziamo sempre la geometria.
const barHeight = Math.abs(height);
const barTop = Math.min(y, y + height);
const barBottom = Math.max(y, y + height);

const gradientId =
  `solar-${side}-${String(payload.day).replace(/\s/g, '-')}`;

// minimo e massimo effettivi della serie
const minValue = Math.max(min || 0, 0);
const maxValue = Math.max(max || 0.01, 0.01);

// Se il valore è uguale al minimo settimanale,
// la barra deve essere praticamente tutta bianco caldo.
const baseRatio = Math.max(
  0,
  Math.min(1, minValue / Math.max(realValue, 0.01))
);

// Delta relativo solo per la parte "extra" oltre il minimo.
// 0 = giorno peggiore, 1 = giorno migliore.
const deltaScore =
  maxValue === minValue
    ? 0
    : Math.max(
        0,
        Math.min(1, (realValue - minValue) / (maxValue - minValue))
      );

const stops = [
  {
    offset: 0,
    color: "#d6c9ae"
  },
  {
    offset: baseRatio,
    color: "#d6c9ae"
  }
];

// Se c'è davvero del delta oltre il minimo,
// coloriamo solo quella parte
if (deltaScore > 0.001 && baseRatio < 1) {

  const deltaSpan = 1 - baseRatio;

  stops.push({
    offset: baseRatio + deltaSpan * 0.35,
    color: "#fbbf24"
  });

  stops.push({
    offset: baseRatio + deltaSpan * 0.70,
    color: "#f97316"
  });

  stops.push({
    offset: 1,
    color: "#ef4444"
  });
}


  const r = Math.min(6, width / 2, barHeight / 2);

let path;

if (side === 'prua') {

  // PRUA:
  // estremità alta arrotondata, zero piatto
  path = `
    M ${x} ${barBottom}
    L ${x} ${barTop + r}
    Q ${x} ${barTop} ${x + r} ${barTop}
    L ${x + width - r} ${barTop}
    Q ${x + width} ${barTop} ${x + width} ${barTop + r}
    L ${x + width} ${barBottom}
    Z
  `;

} else {

  // POPPA:
  // zero piatto, estremità bassa arrotondata
  path = `
    M ${x} ${barTop}
    L ${x + width} ${barTop}
    L ${x + width} ${barBottom - r}
    Q ${x + width} ${barBottom} ${x + width - r} ${barBottom}
    L ${x + r} ${barBottom}
    Q ${x} ${barBottom} ${x} ${barBottom - r}
    Z
  `;
}


  return (
    <g>
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1={side === 'prua' ? "1" : "0"}
          x2="0"
          y2={side === 'prua' ? "0" : "1"}
        >
          {stops.map((stop, i) => (
            <stop
              key={i}
              offset={`${stop.offset * 100}%`}
              stopColor={stop.color}
            />
          ))}
        </linearGradient>
      </defs>

      <path
        d={path}
        fill={`url(#${gradientId})`}
      />
    </g>
  );
};


const EnergyView = ({ manager }) => {
  const { data } = manager;
  if (!data) return <div className="p-20 text-center opacity-30 font-mono text-sm">Caricamento dati energia...</div>;

  // --- LOGICA PREPARAZIONE DATI SOC ---
  const rawHistory = data.power.soc_history_24h;
  const currentSoc = data.power.soc;
  const fullHistory = [...rawHistory, currentSoc];
  const chartData = fullHistory.map((val, i) => ({ index: i, soc: val }));

  const minVal = Math.min(...fullHistory);
  const maxVal = Math.max(...fullHistory);
  const minIdx = fullHistory.lastIndexOf(minVal);
  const maxIdx = fullHistory.indexOf(maxVal);
  const lastIdx = fullHistory.length - 1;

  const weeklyData = data.power.soc_history_7d_minmax;

const pruaValuesWeek = weeklyData
  .map(d => Number(d.solar_prua) || 0)
  .filter(v => v > 0);

const poppaValuesWeek = weeklyData
  .map(d => Number(d.solar_poppa) || 0)
  .filter(v => v > 0);

const pruaMaxWeek = Math.max(...pruaValuesWeek, 0.01);
const poppaMaxWeek = Math.max(...poppaValuesWeek, 0.01);

const pruaMinWeek = Math.min(...pruaValuesWeek, pruaMaxWeek);
const poppaMinWeek = Math.min(...poppaValuesWeek, poppaMaxWeek);

const solarWeeklyData = weeklyData.map(d => {
  const prua = Number(d.solar_prua) || 0;
  const poppa = Number(d.solar_poppa) || 0;

  return {
    ...d,

    // Valori reali
    solar_prua: prua,
    solar_poppa: poppa,

    // Valori normalizzati indipendentemente
    prua_chart: prua / pruaMaxWeek,
    poppa_chart: -(poppa / poppaMaxWeek)
  };
});

const [weeklyMode, setWeeklyMode] = useState(() => {
  return localStorage.getItem('rotevista_energy_weekly_mode') || 'soc';
});

  return (
    <div className="px-2 pt-5 pb-24 landscape:pt-4 space-y-2">
      
      {/* CONTENITORE RESPONSIVO PER I PRIMI DUE BLOCCHI */}
      <div className="flex flex-col landscape:flex-row gap-2 w-full">
        
        {/* ============================================================
            BLOCCO 1: GRAFICO ANALITICO 24 ORE (SOC %)
            ============================================================ */}
        <div className="w-full landscape:w-1/2 bg-white/5 p-5 rounded-[2rem] border border-white/10 shadow-2xl">
          <h3 className="text-[10px] font-black font-mono text-cyan-400 mb-2 flex items-center gap-2 tracking-widest uppercase">
            <History size={14}/> STATO DI CARICA (24h)
          </h3>
          
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 25, right: 65, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="colorSoc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={currentSoc < 40 ? "#ef4444" : "#22c55e"} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#121212" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff40" vertical={false} />
                <YAxis
                  domain={[40, 100]}
                  ticks={[40, 60, 80, 100]}
                  tick={{fill: '#666', fontSize: 11, fontWeight: 'bold'}}
                  axisLine={false}
                  tickLine={false}
                  width={27}
                />
                <XAxis dataKey="index" hide />
                <Area
                  type="monotone"
                  dataKey="soc"
                  stroke={currentSoc < 40 ? "#ef4444" : "#22c55e"}
                  strokeWidth={4}
                  fill="url(#colorSoc)"
                  isAnimationActive={false}
                />
                <ReferenceDot x={maxIdx} y={maxVal} r={4} fill="#22c55e" stroke="#121212" strokeWidth={2}
                  label={{ position: 'top', value: `${maxVal.toFixed(0)}%`, fill: '#22c55e', fontSize: 10, fontWeight: 'bold', dy: -10 }}
                />
                <ReferenceDot x={minIdx} y={minVal} r={4} fill="#ef4444" stroke="#121212" strokeWidth={2}
                  label={{ position: 'bottom', value: `${minVal.toFixed(0)}%`, fill: '#ef4444', fontSize: 10, fontWeight: 'bold', dy: 10 }}
                />
                <ReferenceDot x={lastIdx} y={currentSoc} r={6} fill="#fff" stroke="#06b6d4" strokeWidth={2}
                  label={{ position: 'right', value: `${currentSoc.toFixed(1)}%`, fill: '#fff', fontSize: 13, fontWeight: '900', dx: 12 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ============================================================
            BLOCCO 2: PRODUZIONE SOLARE
            ============================================================ */}
        <div className="w-full landscape:w-1/2 bg-white/5 p-5 rounded-[2rem] border border-white/10 space-y-5 shadow-2xl">
          <h3 className="text-[10px] font-black font-mono text-orange-400 mb-2 flex items-center gap-2 tracking-widest uppercase">
              <Sun size={14}/> PRODUZIONE SOLARE
          </h3>
          
          <div className="grid grid-cols-3 gap-2 text-center">
            <SolarStat title="OGGI" val={data.solar.today_kwh} color="text-orange-400" />
            <SolarStat title="PREV." val={data.solar.forecast_kwh} color="text-yellow-400" />
            <SolarStat title="IERI" val={data.solar.yesterday_kwh} color="text-gray-300" />
          </div>
          
          {(() => {
              const pmax = data.solar.today_prua_max_w || 0;
              const smax = data.solar.today_poppa_max_w || 0;
              const globalMax = Math.max(pmax, smax, 1);
              return (
                  <div className="space-y-5 pt-2">
                      <SolarBar label="PRUA" current={data.solar.prua_w} localMax={pmax} globalMax={globalMax} />
                      <SolarBar label="POPPA" current={data.solar.poppa_w} localMax={smax} globalMax={globalMax} />
                  </div>
              );
          })()}
        </div>
      </div>

      {/* ============================================================
    BLOCCO 3: SETTIMANALE BATTERIA / SOLARE
    ============================================================ */}
<div className="bg-white/5 px-5 pt-5 pb-2 rounded-[2rem] border border-white/10 shadow-2xl">

  {/* Header + selettore */}
  <div className="flex items-center justify-between mb-2">

  <div className="flex items-center gap-6">

    <h3 className={`text-[10px] font-black font-mono flex items-center gap-2 tracking-widest uppercase ${
      weeklyMode === 'soc' ? 'text-cyan-400' : 'text-orange-400'
    }`}>
      {weeklyMode === 'soc'
        ? <><TrendingUp size={14}/> MIN/MAX SETTIMANALE</>
        : <><Sun size={14}/> PRODUZIONE SETTIMANALE</>
      }
    </h3>

    {weeklyMode === 'solar' && (
      <div className="hidden sm:flex items-center gap-5 text-[8px] font-black font-mono text-gray-400 uppercase tracking-wider">

        <span>
          ↑ PRUA
          <span className="ml-1 text-gray-600">
            max {pruaMaxWeek.toFixed(2)}
          </span>
        </span>

        <span>
          POPPA ↓
          <span className="ml-1 text-gray-600">
            max {poppaMaxWeek.toFixed(2)}
          </span>
        </span>

      </div>
    )}

  </div>

  <div className="flex bg-black/20 rounded-xl p-1 border border-white/5">

      <button
        onClick={() => {
  setWeeklyMode('soc');
  localStorage.setItem('rotevista_energy_weekly_mode', 'soc');
}}
        className={`px-3 py-1.5 rounded-lg text-[8px] font-black tracking-wider transition-all ${
          weeklyMode === 'soc'
            ? 'bg-cyan-500/20 text-cyan-400'
            : 'text-gray-500'
        }`}
      >
        BATTERIA
      </button>

      <button
        onClick={() => {
  setWeeklyMode('solar');
  localStorage.setItem('rotevista_energy_weekly_mode', 'solar');
}}
        className={`px-3 py-1.5 rounded-lg text-[8px] font-black tracking-wider transition-all ${
          weeklyMode === 'solar'
            ? 'bg-orange-500/20 text-orange-400'
            : 'text-gray-500'
        }`}
      >
        SOLARE
      </button>

    </div>
  </div>


  {/* ==========================================================
      VISTA BATTERIA
      ========================================================== */}
  {weeklyMode === 'soc' && (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={weeklyData}
          margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        >

          <defs>
            {weeklyData.map((d, i) => {
              const range = d.max - d.min || 1;
              const stopOrange = ((35 - d.min) / range) * 100;
              const stopYellow = ((65 - d.min) / range) * 100;

              return (
                <linearGradient
                  key={`grad-${i}`}
                  id={`grad-${i}`}
                  x1="0"
                  y1="1"
                  x2="0"
                  y2="0"
                >
                  <stop
                    offset="0%"
                    stopColor={
                      d.min < 35
                        ? "#ef4444"
                        : d.min < 65
                        ? "#f97316"
                        : "#22c55e"
                    }
                  />

                  {stopOrange > 0 && stopOrange < 100 && (
                    <stop
                      offset={`${stopOrange}%`}
                      stopColor="#f97316"
                    />
                  )}

                  {stopYellow > 0 && stopYellow < 100 && (
                    <stop
                      offset={`${stopYellow}%`}
                      stopColor="#eab308"
                    />
                  )}

                  <stop
                    offset="100%"
                    stopColor={
                      d.max > 65
                        ? "#22c55e"
                        : d.max > 35
                        ? "#eab308"
                        : "#ef4444"
                    }
                  />
                </linearGradient>
              );
            })}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#ffffff40"
            vertical={false}
          />

          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{
              fill: '#d1d5db',
              fontSize: 11,
              fontWeight: 'bold'
            }}
          />

          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            hide
          />

          <Bar
            dataKey={(d) => [d.min, d.max]}
            radius={[6, 6, 6, 6]}
            barSize={18}
            isAnimationActive={false}
          >

            {weeklyData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={`url(#grad-${index})`}
              />
            ))}

            <LabelList
              dataKey="max"
              position="top"
              content={(props) => {
                const { x, y, width, value } = props;

                return (
                  <text
                    x={x + width / 2}
                    y={y - 8}
                    fill="#fff"
                    fontSize="10"
                    fontWeight="900"
                    textAnchor="middle"
                  >
                    {value.toFixed(0)}%
                  </text>
                );
              }}
            />

            <LabelList
              dataKey="min"
              position="bottom"
              content={(props) => {
                const { x, y, width, value, height } = props;

                return (
                  <text
                    x={x + width / 2}
                    y={y + height + 18}
                    fill={value < 40 ? "#ef4444" : "#d1d5db"}
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {value.toFixed(0)}%
                  </text>
                );
              }}
            />

          </Bar>

        </BarChart>
      </ResponsiveContainer>
    </div>
  )}


  {/* ==========================================================
    VISTA SOLARE - DIVERGENTE PRUA / POPPA
    ========================================================== */}
{weeklyMode === 'solar' && (
  <>

    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
  data={solarWeeklyData}
  barGap={-24}
  margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
>

          


          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#ffffff20"
            vertical={false}
          />


          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{
              fill: '#d1d5db',
              fontSize: 11,
              fontWeight: 'bold'
            }}
          />


          {/* Scala normalizzata:
              +1 = miglior giorno Prua
              -1 = miglior giorno Poppa
          */}
          <YAxis
            domain={[-1.15, 1.15]}
            hide
          />


          {/* Zero centrale */}
          <ReferenceLine
            y={0}
            stroke="#ffffff"
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />


          {/* ==========================
              PRUA - SOPRA LO ZERO
              ========================== */}
          <Bar
  dataKey="prua_chart"
  barSize={24}
  isAnimationActive={false}
  shape={(props) => (
    <SolarGradientBar
      {...props}
      side="prua"
      min={pruaMinWeek}
      max={pruaMaxWeek}
    />
  )}
>
            <LabelList
              dataKey="solar_prua"
              position="top"
              content={(props) => {
                const { x, y, width, value } = props;

                return (
                  <text
                    x={x + width / 2}
                    y={y - 7}
                    fill="#fff"
                    fontSize="9"
                    fontWeight="900"
                    textAnchor="middle"
                  >
                    {Number(value).toFixed(2)}
                  </text>
                );
              }}
            />
          </Bar>


          {/* ==========================
              POPPA - SOTTO LO ZERO
              ========================== */}
          <Bar
  dataKey="poppa_chart"
  barSize={24}
  isAnimationActive={false}
  shape={(props) => (
    <SolarGradientBar
      {...props}
      side="poppa"
      min={poppaMinWeek}
      max={poppaMaxWeek}
    />
  )}
>
            <LabelList
  dataKey="solar_poppa"
  position="bottom"
  content={(props) => {
    const { x, y, width, value } = props;

    if (!value) return null;

    return (
      <text
        x={x + width / 2}
        y={y + 14}
        fill="#fff"
        fontSize="9"
        fontWeight="900"
        textAnchor="middle"
      >
        {Number(value).toFixed(2)}
      </text>
    );
  }}
/>
          </Bar>

        </BarChart>
      </ResponsiveContainer>
    </div>


    

  </>
)}

</div>
    </div>
  );
};

// --- COMPONENTI UI DI SUPPORTO ---

const SolarStat = ({ title, val, color }) => (
    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
        <div className="text-[8px] font-black text-gray-300 mb-1 tracking-tighter uppercase">{title}</div>
        <div className={`text-xl font-black ${color}`}>{val.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-50">kWh</span></div>
    </div>
);

const SolarBar = ({ label, current, localMax, globalMax }) => {
    const currentPct = (current / globalMax) * 100;
    const localMaxPct = (localMax / globalMax) * 100;
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-black">
                <span className="text-gray-300 font-mono tracking-tighter uppercase">{label}</span>
                <span className="text-orange-400 font-mono">{current}W <span className="text-gray-300 font-bold uppercase">/ Peak {localMax}W</span></span>
            </div>
            <div className="relative h-2.5 w-full">
                <div className="absolute inset-0 bg-white/5 rounded-full"></div>
                {localMaxPct < 99 && (
                    <div className="absolute top-0 bottom-0 border-y border-r border-dashed border-white/10 rounded-r-full" style={{ left: `${localMaxPct}%`, right: 0 }}></div>
                )}
                <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full" style={{ width: `${localMaxPct}%` }}></div>
                <div className="absolute inset-y-0 left-0 bg-orange-500 rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(249,115,22,0.4)]" style={{ width: `${currentPct}%` }}></div>
            </div>
        </div>
    );
};

export default EnergyView;
