import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
  ReferenceDot, LabelList
} from 'recharts';
import { Sun, History, TrendingUp } from 'lucide-react';

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

  return (
    <div className="px-2 pt-5 p-2 space-y-2 pb-23 landscape:pt-4">
      
      {/* CONTENITORE RESPONSIVO PER I PRIMI DUE BLOCCHI */}
      <div className="flex flex-col landscape:flex-row gap-2 w-full">
        
        {/* ============================================================
            BLOCCO 1: GRAFICO ANALITICO 24 ORE (SOC %)
            ============================================================ */}
        <div className="w-full landscape:w-1/2 bg-white/5 p-5 rounded-[2rem] border border-white/10 shadow-2xl">
          <h3 className="text-[10px] font-black font-mono text-cyan-400 mb-2 flex items-center gap-2 tracking-widest uppercase">
            <History size={14}/> STATO DI CARICA (24h)
          </h3>
          
          <div className="h-56 w-full">
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
            <SolarStat title="IERI" val={data.solar.yesterday_kwh} color="text-gray-500" />
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
          BLOCCO 3: MIN/MAX SETTIMANALE (Sempre a tutta larghezza)
          ============================================================ */}
      <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 shadow-2xl">
        <h3 className="text-[10px] font-black font-mono text-cyan-400 mb-6 flex items-center gap-2 tracking-widest uppercase">
          <TrendingUp size={14}/> MIN/MAX SETTIMANALE
        </h3>
        
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} margin={{ top: 25, right: 0, left: 0, bottom: 40 }}>
                    <defs>
                        {weeklyData.map((d, i) => {
                            const range = d.max - d.min || 1;
                            const stopOrange = ((35 - d.min) / range) * 100;
                            const stopYellow = ((65 - d.min) / range) * 100;
                            return (
                                <linearGradient key={`grad-${i}`} id={`grad-${i}`} x1="0" y1="1" x2="0" y2="0">
                                    <stop offset="0%" stopColor={d.min < 35 ? "#ef4444" : d.min < 65 ? "#f97316" : "#22c55e"} />
                                    {stopOrange > 0 && stopOrange < 100 && <stop offset={`${stopOrange}%`} stopColor="#f97316" />}
                                    {stopYellow > 0 && stopYellow < 100 && <stop offset={`${stopYellow}%`} stopColor="#eab308" />}
                                    <stop offset="100%" stopColor={d.max > 65 ? "#22c55e" : d.max > 35 ? "#eab308" : "#ef4444"} />
                                </linearGradient>
                            );
                        })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff40" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#666', fontSize: 11, fontWeight: 'bold'}} />
                    <YAxis domain={[0, 100]} ticks={[0, 50, 100]} hide />
                    <Bar dataKey={(d) => [d.min, d.max]} radius={[6, 6, 6, 6]} barSize={18} isAnimationActive={false}>
                        {weeklyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`url(#grad-${index})`} />
                        ))}
                        <LabelList dataKey="max" position="top" content={(props) => {
                            const { x, y, width, value } = props;
                            return <text x={x + width / 2} y={y - 8} fill="#fff" fontSize="10" fontWeight="900" textAnchor="middle">{value.toFixed(0)}%</text>;
                        }} />
                        <LabelList dataKey="min" position="bottom" content={(props) => {
                            const { x, y, width, value, height } = props;
                            return <text x={x + width / 2} y={y + height + 18} fill={value < 40 ? "#ef4444" : "#666"} fontSize="10" fontWeight="bold" textAnchor="middle">{value.toFixed(0)}%</text>;
                        }} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTI UI DI SUPPORTO ---

const SolarStat = ({ title, val, color }) => (
    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
        <div className="text-[8px] font-black text-gray-600 mb-1 tracking-tighter uppercase">{title}</div>
        <div className={`text-xl font-black ${color}`}>{val.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-50">kWh</span></div>
    </div>
);

const SolarBar = ({ label, current, localMax, globalMax }) => {
    const currentPct = (current / globalMax) * 100;
    const localMaxPct = (localMax / globalMax) * 100;
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-black">
                <span className="text-gray-500 font-mono tracking-tighter uppercase">{label}</span>
                <span className="text-orange-400 font-mono">{current}W <span className="text-gray-700 font-normal uppercase">/ Peak {localMax}W</span></span>
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
