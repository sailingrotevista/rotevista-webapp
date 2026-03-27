import React from 'react';
import { Wind, Navigation, CloudRain, Thermometer, Droplets, Compass } from 'lucide-react';

// Funzione per i colori del vento (come avevi in Swift)
const getWindColor = (knots) => {
    if (knots < 10) return 'text-cyan-400';
    if (knots < 18) return 'text-green-400';
    if (knots < 25) return 'text-yellow-400';
    if (knots < 35) return 'text-orange-500';
    return 'text-red-500';
};

const EnvironmentView = ({ manager }) => {
  const { data } = manager;
  if (!data) return <div className="p-10 text-center opacity-50 font-mono">Ricezione dati ambientali...</div>;

  const env = data.environment;

  return (
    <div className="p-4 space-y-6 pb-24">
      
      {/* 1. HERO SECTION: VENTO ATTUALE */}
      <div className="flex gap-3">
        <div className="flex-1 bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col items-center justify-center text-center">
            <div className={`text-6xl font-black tracking-tighter ${getWindColor(env.wind_now)}`}>
                {env.wind_now.toFixed(0)}
            </div>
            <div className="text-[10px] font-black text-gray-500 tracking-widest mt-1">KNOTS</div>
            <div className="w-full h-1.5 bg-white/10 rounded-full mt-4 overflow-hidden">
                <div className={`h-full bg-current ${getWindColor(env.wind_now)} transition-all duration-1000`} 
                     style={{ width: `${Math.min(100, (env.wind_now / env.wind_max_30m) * 100)}%` }}></div>
            </div>
        </div>

        <div className="flex-1 bg-white/5 p-4 rounded-3xl border border-white/10 space-y-3 justify-center flex flex-col">
            <WindStat label="MIN 30m" val={env.wind_min_30m} color="text-cyan-400" />
            <div className="h-px bg-white/5 w-full"></div>
            <WindStat label="MAX 30m" val={env.wind_max_30m} color="text-orange-400" />
            <div className="h-px bg-white/5 w-full"></div>
            <WindStat label="MAX 24h" val={env.wind_max_24h} color="text-red-500" />
        </div>
      </div>

      {/* 2. BUSSOLE: APPARENTE & REALE */}
      <div className="grid grid-cols-2 gap-3">
        <CompassCard title="APPARENTE (AWA)" angle={env.wind_dir_rel} color="border-orange-500" />
        <CompassCard title="REALE (TWD)" angle={env.wind_dir_true} hdg={env.heading} color="border-blue-500" isTrue={true} />
      </div>

      {/* 3. TEMPERATURE & UMIDITÀ */}
      <div className="grid grid-cols-2 gap-3">
          <EnvCard icon={<Thermometer className="text-yellow-500"/>} title="POZZETTO" val={env.temp_pozzetto} sub={`Hum: ${env.hum_pozzetto}%`} />
          <EnvCard icon={<CloudRain className="text-cyan-400"/>} title="MODELLO" val={env.temp_forecast} sub="OpenMeteo" />
      </div>

      {/* 4. PREVISIONI 6 ORE */}
      <div className="bg-white/5 p-4 rounded-3xl border border-white/10">
          <h3 className="text-[10px] font-black text-center text-gray-500 tracking-widest mb-4">PREVISIONE 6 ORE</h3>
          <div className="grid grid-cols-3 gap-3">
              {env.hourly_forecast.slice(0, 6).map((h, i) => (
                  <ForecastBox key={i} hour={h} />
              ))}
          </div>
      </div>

    </div>
  );
};

// --- Componenti UI Ambiente ---

const WindStat = ({ label, val, color }) => (
    <div className="flex justify-between items-baseline">
        <span className="text-[8px] font-black text-gray-500">{label}</span>
        <span className={`text-lg font-black font-mono ${color}`}>{val.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-50">kt</span></span>
    </div>
);

const CompassCard = ({ title, angle, hdg = 0, color, isTrue = false }) => (
    <div className="bg-white/5 p-4 rounded-3xl border border-white/10 flex flex-col items-center gap-3">
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter">{title}</span>
        <div className="relative w-24 h-24 flex items-center justify-center">
            {/* Cerchio Graduato */}
            <div className="absolute inset-0 border-2 border-white/10 rounded-full"></div>
            {isTrue && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black opacity-30">
                    <span className="absolute -top-1 text-red-500">N</span>
                    <span className="absolute -right-1">E</span>
                    <span className="absolute -bottom-1">S</span>
                    <span className="absolute -left-1">W</span>
                </div>
            )}
            {/* Barca (se reale mostra Heading) */}
            <div className="absolute transition-transform duration-1000" style={{ transform: `rotate(${hdg}deg)` }}>
                <Navigation size={24} fill="white" className="text-white opacity-40" />
            </div>
            {/* Freccia Vento */}
            <div className="absolute inset-0 transition-transform duration-1000" style={{ transform: `rotate(${angle}deg)` }}>
                <div className={`w-1 h-12 absolute left-1/2 -translate-x-1/2 top-0 rounded-full ${isTrue ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
            </div>
        </div>
        <span className="text-xl font-black font-mono">{angle.toFixed(0)}° {isTrue ? 'N' : ''}</span>
    </div>
);

const EnvCard = ({ icon, title, val, sub }) => (
    <div className="bg-white/5 p-4 rounded-3xl border border-white/10 flex flex-col items-center text-center gap-1">
        {icon}
        <span className="text-[8px] font-black text-gray-500 mt-1 uppercase">{title}</span>
        <span className="text-2xl font-black">{val.toFixed(1)}°</span>
        <span className="text-[9px] font-bold text-gray-600">{sub}</span>
    </div>
);

const ForecastBox = ({ hour }) => (
    <div className="bg-white/5 p-2 rounded-2xl flex flex-col items-center gap-1 border border-white/5">
        <span className="text-[9px] font-bold text-gray-500">{hour.time}</span>
        <span className="text-lg">☁️</span> {/* Qui potremmo mappare le icone */}
        <span className="text-sm font-black">{hour.temp}°</span>
        <div className="flex gap-1 text-[9px] font-bold">
            <span className="text-gray-400">{hour.windSpeed}</span>
            <span className="text-orange-500">{hour.windGust}</span>
        </div>
    </div>
);

export default EnvironmentView;