import React from 'react';
import {
  Wind, Triangle, CloudRain, Thermometer,
  CloudSun, Moon, Cloud, Sun, ChevronDown,
  CloudDrizzle, CloudLightning, ArrowRight
} from 'lucide-react';

// ============================================================
// 1. LOGICHE DI SUPPORTO
// ============================================================
const getWindColor = (knots) => {
    if (knots < 10) return 'text-cyan-400';
    if (knots < 18) return 'text-green-400';
    if (knots < 25) return 'text-yellow-400';
    if (knots < 35) return 'text-orange-500';
    return 'text-red-500';
};

const getWeatherIcon = (hourData, size = 24) => {
    if (!hourData) return <Cloud size={size} className="text-gray-400" />;
    const prec = hourData.precipitation || 0;
    const iconName = hourData.icon.toLowerCase();
    if (prec >= 1.5) return <CloudLightning size={size} className="text-purple-400" />;
    if (prec >= 0.4) return <CloudRain size={size} className="text-cyan-400" />;
    if (prec > 0) return <CloudDrizzle size={size} className="text-cyan-200" />;
    if (iconName.includes('sun') || iconName.includes('clear')) return <CloudSun size={size} className="text-yellow-400" />;
    if (iconName.includes('moon')) return <Moon size={size} className="text-blue-300" />;
    if (iconName.includes('cloud')) return <Cloud size={size} className="text-gray-400" />;
    return <Sun size={size} className="text-orange-400" />;
};

// ============================================================
// 2. VISTA PRINCIPALE AMBIENTE
// ============================================================
const EnvironmentView = ({ manager }) => {
    const { data } = manager;
    if (!data) return <div className="p-20 text-center opacity-30 font-mono text-sm uppercase text-white">Ricezione dati...</div>;

    const env = data.environment;
    const windPerc = Math.min(100, (env.wind_now / Math.max(env.wind_max_30m, 1)) * 100);

    return (
        <div className="px-2 pt-5 pb-24 landscape:pt-4 space-y-2 text-white">
            
            {/* --- RIGA 1: VENTO E BUSSOLE --- */}
            <div className="grid grid-cols-2 landscape:grid-cols-4 gap-2">
                
                {/* 1. Box velocità vento attuale */}
                <div className="bg-white/5 p-5 landscape:py-2 landscape:px-5 rounded-[2rem] landscape:rounded-[1.5rem] border border-white/10 flex flex-col landscape:flex-row items-center justify-center landscape:justify-between text-center shadow-xl">
                    <div className="flex flex-col items-center landscape:items-start">
                        <div className={`text-6xl landscape:text-4xl font-black tracking-tighter ${getWindColor(env.wind_now)} drop-shadow-lg leading-none`}>
                            {env.wind_now.toFixed(0)}
                        </div>
                        <div className="text-[10px] landscape:text-[8px] font-black text-gray-500 tracking-widest mt-1 uppercase font-mono">Knots</div>
                    </div>
                    
                    <div className="w-full landscape:w-5 h-3 landscape:h-14 bg-white/10 rounded-full mt-4 landscape:mt-0 overflow-hidden border border-white/5 flex flex-col justify-end">
                        <div
                            className={`bg-current ${getWindColor(env.wind_now)} transition-all duration-1000 shadow-[0_0_10px_currentColor]`}
                            style={{
                                width: window.innerHeight > window.innerWidth ? `${windPerc}%` : '100%',
                                height: window.innerHeight > window.innerWidth ? '100%' : `${windPerc}%`
                            }}
                        ></div>
                    </div>
                </div>

                {/* 2. Statistiche min/max vento */}
                <div className="bg-white/5 p-5 landscape:py-2 rounded-[2rem] landscape:rounded-[1.5rem] border border-white/10 space-y-4 landscape:space-y-1 justify-center flex flex-col shadow-xl font-mono text-white">
                    <WindStat label="MIN 30m" val={env.wind_min_30m} color="text-cyan-400" />
                    <div className="h-px bg-white/5 w-full"></div>
                    <WindStat label="MAX 30m" val={env.wind_max_30m} color="text-orange-400" />
                    <div className="h-px bg-white/5 w-full"></div>
                    <WindStat label="MAX 24h" val={env.wind_max_24h} color="text-red-500" />
                </div>

                {/* 3. Bussola APPARENTE */}
                <CompassCard title="APPARENTE" windAngle={env.wind_dir_rel} boatAngle={0} color={getWindColor(env.wind_now)} />

                {/* 4. Bussola REALE */}
                <CompassCard title="REALE" windAngle={env.wind_dir_true} boatAngle={env.heading} color={getWindColor(env.wind_now)} isTrue={true} />
            </div>

            {/* --- RIGA 2: TEMPERATURE --- */}
            <div className="grid grid-cols-2 gap-2">
                <EnvTempCard icon={<Thermometer className="text-yellow-500"/>} title="POZZETTO" val={env.temp_pozzetto} sub={`Umidità: ${env.hum_pozzetto.toFixed(0)}%`} />
                <EnvTempCard icon={getWeatherIcon(env.hourly_forecast[0], 28)} title="MODELLO" val={env.temp_forecast} sub="OpenMeteo" />
            </div>

            {/* --- RIGA 3: PREVISIONE 6 ORE --- */}
            <div className="bg-white/5 p-3 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <h3 className="text-[10px] font-black text-center text-gray-500 tracking-[0.2em] mb-4 uppercase font-mono opacity-50 text-white">Previsione 6 Ore</h3>
                <div className="grid grid-cols-3 gap-2">
                    {env.hourly_forecast.slice(0, 6).map((h, i) => (
                        <ForecastBox key={i} hour={h} />
                    ))}
                </div>
            </div>
        </div>
    );
};

// ============================================================
// 3. COMPONENTI UI DI SUPPORTO
// ============================================================

const CompassCard = ({ title, windAngle, boatAngle, color, isTrue = false }) => (
    /*
       MODIFICA: py-3 px-4 riduce lo spazio verticale rispetto al vecchio p-5.
       gap-2 avvicina gli elementi interni.
    */
    <div className="bg-white/5 py-3 px-4 landscape:py-2 landscape:px-4 rounded-[2rem] landscape:rounded-[1.5rem] border border-white/10 flex flex-col landscape:flex-row items-center justify-center landscape:justify-between shadow-lg overflow-hidden h-full gap-2 landscape:gap-0">
        
        {/* Cerchio Bussola */}
        <div className="relative w-28 h-28 landscape:w-16 landscape:h-16 flex items-center justify-center shrink-0">
            <div className="absolute inset-0 border-2 border-white/10 rounded-full"></div>
            {isTrue && (
                <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black opacity-30 text-white">
                    <span className="absolute top-0 text-red-500 font-mono">N</span>
                    <span className="absolute bottom-0 text-white/50 font-mono">S</span>
                </div>
            )}
            <div className="absolute transition-transform duration-1000 ease-in-out" style={{ transform: `rotate(${boatAngle}deg)` }}>
                <Triangle size={18} fill="white" className="text-white opacity-20 scale-x-75 scale-y-125" />
            </div>
            <div className="absolute inset-0 transition-transform duration-1000 ease-in-out" style={{ transform: `rotate(${windAngle}deg)` }}>
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 -mt-1 ${color}`}>
                    <ChevronDown size={16} strokeWidth={4} fill="currentColor" />
                </div>
            </div>
        </div>
        
        {/* Testi */}
        <div className="flex flex-col items-center landscape:items-end leading-none">
            <span className="text-[10px] landscape:text-[7px] font-black text-gray-500 uppercase tracking-tighter font-mono whitespace-nowrap mb-1 landscape:mb-0">{title}</span>
            <span className={`text-2xl landscape:text-lg font-black font-mono tracking-tighter ${color} whitespace-nowrap`}>
                {windAngle.toFixed(0)}° {isTrue ? 'N' : ''}
            </span>
        </div>
    </div>
);

const WindStat = ({ label, val, color }) => (
    <div className="flex justify-between items-baseline px-1 leading-none text-white">
        <span className="text-[9px] landscape:text-[7px] font-black text-gray-600 uppercase font-mono">{label}</span>
        <span className={`text-lg landscape:text-sm font-black font-mono ${color}`}>{val.toFixed(1)}</span>
    </div>
);

const EnvTempCard = ({ icon, title, val, sub }) => (
    <div className="bg-white/5 p-5 landscape:py-2 landscape:px-4 rounded-[2rem] landscape:rounded-[1.5rem] border border-white/10 flex flex-col landscape:flex-row items-center landscape:justify-between shadow-lg h-full text-white group hover:bg-white/10 transition-all">
        <div className="flex flex-col landscape:flex-row items-center gap-1 landscape:gap-3 text-white">
            <div className="bg-white/5 p-2 landscape:p-1.5 rounded-full flex items-center justify-center">
                {React.cloneElement(icon, { size: 18, className: `${icon.props.className} landscape:scale-90` })}
            </div>
            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest font-mono whitespace-nowrap">{title}</span>
        </div>
        <div className="flex flex-col items-center landscape:items-end leading-tight text-white">
            <span className="text-3xl landscape:text-2xl font-black text-white">{val.toFixed(1)}°</span>
            <span className="text-[10px] landscape:text-[8px] font-bold text-gray-500 uppercase font-mono whitespace-nowrap opacity-80">{sub}</span>
        </div>
    </div>
);

const ForecastBox = ({ hour }) => {
    return (
        <div className="bg-white/5 p-2 rounded-[1.5rem] flex flex-col items-center gap-1.5 border border-white/5 shadow-md overflow-hidden text-white h-full justify-between">
            <span className="text-[9px] font-black text-gray-600 font-mono tracking-tighter uppercase">{hour.time}</span>
            <div className="my-0.5">{getWeatherIcon(hour, 26)}</div>
            <span className="text-lg font-black text-white leading-none">{hour.temp}°</span>
            {hour.rainChance > 15 ? (
                <div className="flex items-center gap-1 text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded-full">
                    <span className="text-[9px] font-black">{hour.rainChance}%</span>
                </div>
            ) : <div className="h-4"></div>}
            <div className="flex flex-col items-center w-full border-t border-white/5 pt-1.5 text-white">
                <div className="flex items-center gap-1 justify-center w-full text-white">
                    <span className="text-lg landscape:text-base font-bold text-gray-400 font-mono leading-none">{hour.windSpeed}</span>
                    <ArrowRight size={10} className="text-gray-600 shrink-0" />
                    <span className={`text-lg landscape:text-base font-black font-mono leading-none ${getWindColor(hour.windGust)}`}>{hour.windGust}</span>
                </div>
            </div>
        </div>
    );
};

export default EnvironmentView;
