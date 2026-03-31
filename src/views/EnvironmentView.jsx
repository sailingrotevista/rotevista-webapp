import React from 'react';
import {
  Wind, Triangle, CloudRain, Thermometer,
  CloudSun, Moon, Cloud, Sun, ChevronDown,
  CloudDrizzle, CloudLightning, ArrowRight
} from 'lucide-react';

// ============================================================
// 1. LOGICHE DI SUPPORTO (COLORI E ICONE)
// ============================================================

/**
 * Restituisce il colore CSS in base all'intensità del vento (nodi)
 */
const getWindColor = (knots) => {
    if (knots < 10) return 'text-cyan-400';
    if (knots < 18) return 'text-green-400';
    if (knots < 25) return 'text-yellow-400';
    if (knots < 35) return 'text-orange-500';
    return 'text-red-500';
};

/**
 * Determina l'icona Lucide corretta in base ai dati della previsione (precipitazioni e nome icona)
 */
const getWeatherIcon = (hourData, size = 24) => {
    if (!hourData) return <Cloud size={size} className="text-gray-400" />;
    
    const prec = hourData.precipitation || 0;
    const iconName = hourData.icon.toLowerCase();

    // Priorità 1: Intensità pioggia (stessa logica dell'app iOS)
    if (prec >= 1.5) return <CloudLightning size={size} className="text-purple-400" />;
    if (prec >= 0.4) return <CloudRain size={size} className="text-cyan-400" />;
    if (prec > 0) return <CloudDrizzle size={size} className="text-cyan-200" />;
    
    // Priorità 2: Mappatura nomi icone standard da API
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

    // Fallback se i dati non sono ancora stati caricati
    if (!data) return (
        <div className="p-20 text-center opacity-30 font-mono text-sm uppercase tracking-widest text-white">
            Ricezione dati ambientali...
        </div>
    );

    const env = data.environment;

    return (
        <div className="p-4 space-y-6 pb-32">
            
            {/* --- HERO SECTION: VENTO ATTUALE --- */}
            <div className="flex gap-3">
                {/* Box grande velocità vento */}
                <div className="flex-1 bg-white/5 p-6 rounded-[2rem] border border-white/10 flex flex-col items-center justify-center text-center shadow-xl">
                    <div className={`text-6xl font-black tracking-tighter ${getWindColor(env.wind_now)} drop-shadow-lg`}>
                        {env.wind_now.toFixed(0)}
                    </div>
                    <div className="text-[10px] font-black text-gray-500 tracking-widest mt-1">KNOTS</div>
                    
                    {/* Barra intensità (spessore h-3 raddoppiato) */}
                    <div className="w-full h-3 bg-white/5 rounded-full mt-4 overflow-hidden border border-white/5">
                        <div
                            className={`h-full bg-current ${getWindColor(env.wind_now)} transition-all duration-1000 shadow-[0_0_10px_currentColor]`}
                            style={{ width: `${Math.min(100, (env.wind_now / env.wind_max_30m) * 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Statistiche min/max vento */}
                <div className="flex-1 bg-white/5 p-5 rounded-[2rem] border border-white/10 space-y-4 justify-center flex flex-col shadow-xl">
                    <WindStat label="MIN 30m" val={env.wind_min_30m} color="text-cyan-400" />
                    <div className="h-px bg-white/5 w-full"></div>
                    <WindStat label="MAX 30m" val={env.wind_max_30m} color="text-orange-400" />
                    <div className="h-px bg-white/5 w-full"></div>
                    <WindStat label="MAX 24h" val={env.wind_max_24h} color="text-red-500" />
                </div>
            </div>

            {/* --- SEZIONE BUSSOLE: APPARENTE & REALE --- */}
            <div className="grid grid-cols-2 gap-3">
                {/* APPARENTE (AWA): Prua bloccata in alto (0°) */}
                <CompassCard
                    title="APPARENTE (AWA)"
                    windAngle={env.wind_dir_rel}
                    boatAngle={0}
                    color={getWindColor(env.wind_now)}
                />
                {/* REALE (TWD): Nord in alto, barca ruota all'Heading */}
                <CompassCard
                    title="REALE (TWD)"
                    windAngle={env.wind_dir_true}
                    boatAngle={env.heading}
                    color={getWindColor(env.wind_now)}
                    isTrue={true}
                />
            </div>

            {/* --- TEMPERATURE & UMIDITÀ --- */}
            <div className="grid grid-cols-2 gap-3">
                <EnvTempCard
                    icon={<Thermometer className="text-yellow-500"/>}
                    title="POZZETTO"
                    val={env.temp_pozzetto}
                    sub={`Umidità: ${env.hum_pozzetto.toFixed(0)}%`}
                />
                <EnvTempCard
                    // ICONA DINAMICA: Prende il meteo previsto per l'ora corrente (indice 0 dell'array)
                    icon={getWeatherIcon(env.hourly_forecast[0], 28)}
                    title="MODELLO"
                    val={env.temp_forecast}
                    sub="OpenMeteo"
                />
            </div>

            {/* --- PREVISIONE 6 ORE (Padding ridotto per ingrandire blocchetti) --- */}
            <div className="bg-white/5 p-3 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <h3 className="text-[10px] font-black text-center text-gray-500 tracking-[0.2em] mb-4 uppercase font-mono opacity-50">Previsione 6 Ore</h3>
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
// 3. COMPONENTI UI DI SUPPORTO (RIUTILIZZABILI)
// ============================================================

/**
 * Bussola rotante per direzione vento e prua barca
 */
const CompassCard = ({ title, windAngle, boatAngle, color, isTrue = false }) => (
    <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 flex flex-col items-center gap-4 shadow-lg overflow-hidden">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter font-mono">{title}</span>
        
        <div className="relative w-28 h-28 flex items-center justify-center">
            {/* Cerchio Graduato */}
            <div className="absolute inset-0 border-2 border-white/10 rounded-full"></div>
            
            {/* Punti Cardinali (solo per Vento Reale / Nord-up) */}
            {isTrue && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black opacity-30">
                    <span className="absolute top-1 text-red-500 font-mono">N</span>
                    <span className="absolute right-1 font-mono">E</span>
                    <span className="absolute bottom-1 text-white/50 font-mono">S</span>
                    <span className="absolute left-1 font-mono">W</span>
                </div>
            )}

            {/* Sagoma Barca (Usa Triangle per puntare a 0° nativamente) */}
            <div className="absolute transition-transform duration-1000 ease-in-out" style={{ transform: `rotate(${boatAngle}deg)` }}>
                <Triangle size={32} fill="white" className="text-white opacity-20 scale-x-75 scale-y-125 shadow-2xl" />
            </div>

            {/* Indicatore Vento: Triangolo che indica la PROVENIENZA puntando al centro */}
            <div className="absolute inset-0 transition-transform duration-1000 ease-in-out" style={{ transform: `rotate(${windAngle}deg)` }}>
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 -mt-1 ${color} drop-shadow-[0_0_5px_currentColor]`}>
                    <ChevronDown size={24} strokeWidth={4} fill="currentColor" />
                </div>
            </div>
        </div>
        
        <span className={`text-2xl font-black font-mono tracking-tighter ${color}`}>
            {windAngle.toFixed(0)}° {isTrue ? 'N' : ''}
        </span>
    </div>
);

const WindStat = ({ label, val, color }) => (
    <div className="flex justify-between items-baseline px-1">
        <span className="text-[9px] font-black text-gray-600 uppercase font-mono">{label}</span>
        <span className={`text-lg font-black font-mono ${color}`}>{val.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-40">kt</span></span>
    </div>
);

const EnvTempCard = ({ icon, title, val, sub }) => (
    <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 flex flex-col items-center text-center gap-1 shadow-lg">
        <div className="bg-white/5 p-2 rounded-full mb-1">{icon}</div>
        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest font-mono">{title}</span>
        <span className="text-3xl font-black text-white">{val.toFixed(1)}°</span>
        <span className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-tighter font-mono">{sub}</span>
    </div>
);

/**
 * Blocchetto orario della griglia previsioni
 */
const ForecastBox = ({ hour }) => {
    return (
        <div className="bg-white/5 p-2 rounded-[1.5rem] flex flex-col items-center gap-1.5 border border-white/5 shadow-md overflow-hidden">
            <span className="text-[9px] font-black text-gray-600 font-mono tracking-tighter uppercase">{hour.time}</span>
            <div className="my-0.5">{getWeatherIcon(hour, 26)}</div>
            <span className="text-lg font-black text-white leading-none">{hour.temp}°</span>
            
            {/* Visualizzazione Pioggia (mostrata solo se rilevante > 15%) */}
            {hour.rainChance > 15 ? (
                <div className="flex items-center gap-1 text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded-full">
                    <span className="text-[9px] font-black">{hour.rainChance}%</span>
                    <span className="text-[8px] font-bold opacity-70">{hour.precipitation?.toFixed(1)}mm</span>
                </div>
            ) : (
                <div className="h-4"></div> // Spacer per mantenere l'allineamento verticale
            )}
            
            {/* Range Vento con font grande (text-lg) e freccia di direzione */}
            <div className="flex flex-col items-center w-full border-t border-white/5 pt-1.5 mt-1 text-white">
                <div className="flex items-center gap-1 justify-center w-full">
                    <span className="text-lg font-bold text-gray-400 font-mono leading-none">{hour.windSpeed}</span>
                    <ArrowRight size={12} className="text-gray-600 shrink-0" />
                    <span className={`text-lg font-black font-mono leading-none ${getWindColor(hour.windGust)}`}>
                        {hour.windGust}
                    </span>
                </div>
                <span className="text-[7px] font-black text-gray-700 uppercase tracking-tighter mt-1">knots</span>
            </div>
        </div>
    );
};

export default EnvironmentView;
