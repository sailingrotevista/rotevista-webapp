import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Battery, Power, Thermometer, Droplet, Flame,
  Shirt, Snowflake, Sofa, Navigation, Plus, Minus, Target,
  AlertTriangle, ChevronRight, Loader2
} from 'lucide-react';

// ============================================================
// 1. CONFIGURAZIONE ICONA BARCA
// ============================================================
const boatIcon = new L.DivIcon({
    html: `<div style="font-size: 30px; filter: drop-shadow(0 0 5px black);">⛵</div>`,
    className: 'boat-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
});

// ============================================================
// 2. LOGICHE COLORE DINAMICO (REPLICA IOS)
// ============================================================
const getFridgeColor = (t) => {
    if (t === undefined || t === null) return 'text-white';
    if (t < 1) return 'text-blue-400';
    if (t <= 9) return 'text-white';
    if (t <= 12) return 'text-orange-500';
    return 'text-red-500';
};

const getFreezerColor = (t) => {
    if (t === undefined || t === null) return 'text-white';
    if (t < -2) return 'text-white';
    if (t <= 2) return 'text-orange-500';
    return 'text-red-500';
};

// ============================================================
// 3. PLUGIN LOGICA E CONTROLLI MAPPA
// ============================================================
const MapPlugins = ({ coords, trail, autoFollow, setAutoFollow }) => {
    const map = useMap();
    useMapEvents({
        dragstart: () => setAutoFollow(false),
        zoomstart: () => setAutoFollow(false),
        touchstart: () => setAutoFollow(false),
    });
    useEffect(() => {
        if (autoFollow && coords[0] !== 0) {
            map.setView(coords, map.getZoom(), { animate: true, duration: 1 });
        }
    }, [coords, autoFollow, map]);
    useEffect(() => {
        const timer = setTimeout(() => { map.invalidateSize(); }, 400);
        return () => clearTimeout(timer);
    }, [map]);
    return (
        <>
            {trail.length > 0 && <Polyline positions={trail} color="#22d3ee" weight={5} opacity={0.8} lineCap="round" />}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-[1000]">
                <button onClick={(e) => { e.stopPropagation(); setAutoFollow(false); map.zoomIn(); }} className="w-12 h-12 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all"><Plus size={24} /></button>
                <button onClick={(e) => { e.stopPropagation(); setAutoFollow(false); map.zoomOut(); }} className="w-12 h-12 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all"><Minus size={24} /></button>
                <button onClick={(e) => { e.stopPropagation(); setAutoFollow(true); map.setView(coords, 18, { animate: true }); }} className={`w-12 h-12 rounded-2xl backdrop-blur-md border transition-all flex items-center justify-center shadow-lg ${autoFollow ? 'bg-cyan-500/30 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-black/40 border-white/10'}`}><Target size={24} className={autoFollow ? "text-cyan-400" : "text-white"} /></button>
            </div>
        </>
    );
};

// ============================================================
// 4. VISTA PRINCIPALE HOME
// ============================================================
const HomeView = ({ manager, onTabChange }) => {
    const { data, toggleSwitch, apiUrl, error, isUpdating } = manager;
    const [autoFollow, setAutoFollow] = useState(true);
    const [showSSLModal, setShowSSLModal] = useState(false);

    useEffect(() => {
        if (error) setShowSSLModal(true);
        else setShowSSLModal(false);
    }, [error]);

    const lat = parseFloat(data?.gps?.lat) || 36.78;
    const lon = parseFloat(data?.gps?.lon) || 14.54;
    const coords = [lat, lon];
    const trail = data?.environment?.gps_history ? data.environment.gps_history.map(h => [parseFloat(h.lat), parseFloat(h.lon)]) : [];

    return (
        <div className="p-4 space-y-6">

            {/* MODALE SBLOCCO SSL */}
            {showSSLModal && (
                <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md text-center border-none">
                    <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full space-y-6 border-none">
                        <div className="bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto"><AlertTriangle size={32} className="text-red-500" /></div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-black uppercase tracking-tight text-white font-mono">Sicurezza API</h2>
                            <p className="text-gray-400 text-xs font-bold leading-relaxed px-4">Autorizza il certificato della barca per ricevere i dati in tempo reale.</p>
                        </div>
                        <div className="space-y-3 pt-2">
                            <button onClick={() => window.open(`${apiUrl}`, '_blank')} className="w-full bg-red-500 hover:bg-red-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 uppercase text-xs font-mono">
                                <Navigation size={18} className="rotate-90" /> 1. Autorizza SSL
                            </button>
                            <button onClick={() => setShowSSLModal(false)} className="w-full bg-white/5 hover:bg-white/10 text-white font-black py-3 rounded-2xl border border-white/10 active:scale-95 uppercase text-xs font-mono">2. Ho fatto</button>
                        </div>
                    </div>
                </div>
            )}

            {/* FEEDBACK AGGIORNAMENTO (SPINNER) */}
            <div className="h-4 flex justify-end px-2">
                {isUpdating && (
                    <div className="flex items-center gap-2 text-cyan-400 animate-pulse">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest font-mono text-cyan-400">Sync...</span>
                    </div>
                )}
            </div>
            
            {/* --- SEZIONE 1: CARTE ENERGIA --- */}
            <div className="grid grid-cols-2 gap-3">
                {/* BATTERIA */}
                <div onClick={() => onTabChange(1)} className="cursor-pointer active:scale-95 transition-transform">
                    <StatusBox
                        title="BATTERIA"
                        icon={<Battery className="text-green-500"/>}
                        value={`${data?.power?.soc?.toFixed(1) || '-'}%`}
                        sub={<>{data?.power?.dc_draw_w || 0}<span className="opacity-40 ml-0.5 font-bold">W</span></>}
                    />
                </div>
                {/* BANCHINA - Gestione Condizionale della riga sub */}
                <div onClick={() => onTabChange(3)} className="cursor-pointer active:scale-95 transition-transform">
                    <StatusBox
                        title="BANCHINA"
                        icon={<Power className={data?.power?.shore_power ? "text-green-500" : "text-red-500"}/>}
                        value={data?.power?.shore_power ? "ON" : "OFF"}
                        sub={data?.power?.shore_power ? (
                            <span className="flex flex-row landscape:flex-col items-center landscape:items-end">
                                {/* In verticale (inline), in orizzontale (pila su due righe) */}
                                <span>{Math.round(data?.power?.ac_power_w || 0)}W</span>
                                <span className="ml-1 landscape:ml-0 text-[11px] opacity-60 font-bold leading-none landscape:mt-1">
                                    ({data?.power?.shore_v?.toFixed(0)}V)
                                </span>
                            </span>
                        ) : (
                            <>{Math.round(data?.power?.ac_power_w || 0)}<span className="opacity-40 ml-0.5 font-bold uppercase">w</span></>
                        )}
                    />
                </div>
            </div>

            {/* --- SEZIONE 2 & 3: TEMPERATURE E INTERRUTTORI (RESPONSIVI) --- */}
            <div className="flex flex-col md:flex-row gap-4 w-full">
                {/* TEMPERATURE (2x2 in orizzontale) */}
                <div className="w-full md:w-1/2 grid grid-cols-4 md:grid-cols-2 gap-2">
                    <div onClick={() => onTabChange(2)} className="cursor-pointer active:scale-95 transition-transform">
                        <TempCard icon={<Thermometer size={18}/>} title="POZZ." val={data?.environment?.temp_pozzetto} color="text-yellow-500" />
                    </div>
                    <TempCard icon={<Sofa size={18}/>} title="QUADR." val={data?.environment?.temp_quadrato} color="text-orange-500" />
                    <TempCard icon={<Snowflake size={18}/>} title="FRIGO" val={data?.environment?.temp_frigo} color="text-cyan-400" valueColor={getFridgeColor(data?.environment?.temp_frigo)} />
                    <TempCard icon={<Snowflake size={18}/>} title="FREEZER" val={data?.environment?.temp_freezer} color="text-blue-500" valueColor={getFreezerColor(data?.environment?.temp_freezer)} />
                </div>

                {/* INTERRUTTORI RAPIDI */}
                <div className={`w-full md:w-1/2 bg-white/5 rounded-[2rem] divide-y divide-white/5 border border-white/10 overflow-hidden shadow-xl transition-opacity duration-300 ${isUpdating ? 'opacity-60' : 'opacity-100'}`}>
                    <QuickActionRow icon={<Droplet className="text-blue-400"/>} name="Pompa Acqua" isOn={data?.switches?.pump_on} onToggle={(v) => toggleSwitch('pump', v)} disabled={isUpdating} />
                    <QuickActionRow icon={<Flame className="text-orange-400"/>} name="Boiler" isOn={data?.switches?.boiler_on} onToggle={(v) => toggleSwitch('boiler', v)} disabled={isUpdating} />
                    <QuickActionRow icon={<Shirt className="text-purple-400"/>} name="Lavatrice" isOn={data?.switches?.washing_machine_on} onToggle={(v) => toggleSwitch('washer', v)} disabled={isUpdating} />
                </div>
            </div>

            {/* --- SEZIONE 4: MAPPA SATELLITARE (80%) --- */}
            <div className="space-y-3 pb-32 flex flex-col items-center">
                <div className="flex justify-between items-center w-[80%] px-2">
                    <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase font-mono opacity-50">Posizione GPS</h3>
                    <button onClick={() => window.open(`maps://?q=${lat},${lon}`, '_blank')} className="text-[9px] font-black bg-cyan-500/10 text-cyan-400 px-3 py-1 rounded-full border border-cyan-500/20 flex items-center gap-1 uppercase active:scale-95 transition-transform"><Navigation size={10} /> Apri in Mappe</button>
                </div>
                <div onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} className="h-80 w-[80%] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl relative isolate touch-none">
                    <MapContainer center={coords} zoom={17} maxZoom={20} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
                        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} maxNativeZoom={19} />
                        <MapPlugins coords={coords} trail={trail} autoFollow={autoFollow} setAutoFollow={setAutoFollow} />
                        <Marker position={coords} icon={boatIcon} />
                    </MapContainer>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// 5. COMPONENTI UI RIUTILIZZABILI
// ============================================================

const StatusBox = ({ icon, title, value, sub }) => (
    <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 flex flex-col landscape:flex-row landscape:items-center landscape:justify-between shadow-lg text-white group hover:bg-white/10 transition-colors h-full">
        <div className="flex flex-col">
            <div className="flex items-center gap-1 text-gray-500 text-[9px] font-black tracking-widest uppercase whitespace-nowrap">
                {icon} {title}
            </div>
            <div className="text-3xl font-black mt-1 tracking-tighter">
                {value}
            </div>
        </div>
        
        {/* Sub-label (Watt/Volt) - Allineato a destra in orizzontale */}
        <div className="text-[14px] text-gray-400 font-black uppercase tracking-tight mt-1 landscape:mt-0 landscape:text-right landscape:pl-2">
            {sub}
        </div>
    </div>
);

const TempCard = ({ icon, title, val, color, valueColor = "text-white" }) => (
    <div className="bg-white/5 py-4 rounded-3xl border border-white/5 flex flex-col items-center gap-1 text-center shadow-md hover:bg-white/10 transition-colors h-full justify-center">
        <div className={color}>{icon}</div>
        <div className="text-[8px] font-black text-gray-600 uppercase tracking-tighter mt-1">{title}</div>
        <div className={`text-lg font-black ${valueColor}`}>{val?.toFixed(1) || '-'}°</div>
    </div>
);

const QuickActionRow = ({ icon, name, isOn, onToggle, disabled }) => (
    <div className={`flex items-center justify-between p-5 bg-white/[0.02] text-white transition-all ${disabled ? 'pointer-events-none' : ''}`}>
        <div className="flex items-center gap-3">
            {React.cloneElement(icon, { size: 20, className: isOn ? icon.props.className : 'text-gray-700' })}
            <span className="text-sm font-bold text-white tracking-tight uppercase">{name}</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={isOn || false} onChange={(e) => onToggle(e.target.checked)} disabled={disabled} />
            <div className="w-11 h-6 bg-gray-800 rounded-full peer peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full shadow-inner"></div>
        </label>
    </div>
);

export default HomeView;
