import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Battery, Power, Thermometer, Droplet, Flame,
  Shirt, Snowflake, Sofa, Navigation, Plus, Minus, Target,
  AlertTriangle, ChevronRight
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
// 2. LOGICHE COLORE DINAMICO (DA IOS)
// ============================================================
const getFridgeColor = (t) => {
    if (t === undefined || t === null) return 'text-white';
    if (t < 1) return 'text-blue-400';
    if (t <= 8) return 'text-white';
    if (t <= 10) return 'text-orange-500';
    return 'text-red-500';
};

const getFreezerColor = (t) => {
    if (t === undefined || t === null) return 'text-white';
    if (t < -2) return 'text-white';
    if (t <= 1) return 'text-orange-500';
    return 'text-red-500';
};

// ============================================================
// 3. PLUGIN CONTROLLI MAPPA
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
                <button onClick={(e) => { e.stopPropagation(); setAutoFollow(false); map.zoomIn(); }} className="w-12 h-12 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all shadow-lg"><Plus size={24} /></button>
                <button onClick={(e) => { e.stopPropagation(); setAutoFollow(false); map.zoomOut(); }} className="w-12 h-12 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all shadow-lg"><Minus size={24} /></button>
                <button onClick={(e) => { e.stopPropagation(); setAutoFollow(true); map.setView(coords, 18, { animate: true }); }} className={`w-12 h-12 rounded-2xl backdrop-blur-md border transition-all flex items-center justify-center active:scale-90 shadow-lg ${autoFollow ? 'bg-cyan-500/30 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-black/40 border-white/10'}`}><Target size={24} className={autoFollow ? "text-cyan-400" : "text-white"} /></button>
            </div>
        </>
    );
};

// ============================================================
// 4. VISTA PRINCIPALE HOME
// ============================================================
const HomeView = ({ manager }) => {
    const { data, toggleSwitch, isDataStale, apiUrl } = manager;
    const [autoFollow, setAutoFollow] = useState(true);

    const lat = parseFloat(data?.gps?.lat) || 36.78;
    const lon = parseFloat(data?.gps?.lon) || 14.54;
    const coords = [lat, lon];
    const trail = data?.environment?.gps_history ? data.environment.gps_history.map(h => [parseFloat(h.lat), parseFloat(h.lon)]) : [];

    return (
        <div className="p-4 space-y-6">

            {/* ALLARME CONNESSIONE */}
            {isDataStale && (
                <button onClick={() => window.open(`${apiUrl}`, '_blank')} className="w-full bg-red-500/90 hover:bg-red-600 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg transition-all active:scale-[0.98]">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-full"><AlertTriangle size={20} /></div>
                        <div className="text-left">
                            <p className="font-black text-sm uppercase tracking-tight">Dati Scaduti</p>
                            <p className="text-[10px] opacity-80 font-bold uppercase">Tocca per sbloccare certificato SSL</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="opacity-50" />
                </button>
            )}
            
            {/* 1. POWER */}
            <div className="grid grid-cols-2 gap-3">
                <StatusBox title="BATTERIA" icon={<Battery className="text-green-500"/>} value={`${data?.power?.soc?.toFixed(1) || '-'}%`} sub={`${data?.power?.dc_draw_w || 0}W`} />
                <StatusBox title="BANCHINA" icon={<Power className={data?.power?.shore_power ? "text-green-500" : "text-red-500"}/>} value={data?.power?.shore_power ? "ON" : "OFF"} sub="230V AC" />
            </div>

            {/* 2. TEMPERATURE (Ordine originale iOS e Colori Dinamici) */}
            <div className="grid grid-cols-4 gap-2">
                <TempCard icon={<Thermometer size={18}/>} title="POZZ." val={data?.environment?.temp_pozzetto} color="text-yellow-500" />
                <TempCard icon={<Sofa size={18}/>} title="QUADR." val={data?.environment?.temp_quadrato} color="text-orange-500" />
                <TempCard icon={<Snowflake size={18}/>} title="FRIGO" val={data?.environment?.temp_frigo} color="text-cyan-400" valueColor={getFridgeColor(data?.environment?.temp_frigo)} />
                <TempCard icon={<Snowflake size={18}/>} title="FREEZER" val={data?.environment?.temp_freezer} color="text-blue-500" valueColor={getFreezerColor(data?.environment?.temp_freezer)} />
            </div>

            {/* 3. AZIONI RAPIDE */}
            <div className="bg-white/5 rounded-[2rem] divide-y divide-white/5 border border-white/10 overflow-hidden shadow-xl">
                <QuickActionRow icon={<Droplet className="text-blue-400"/>} name="Pompa Acqua" isOn={data?.switches?.pump_on} onToggle={(v) => toggleSwitch('pump', v)} />
                <QuickActionRow icon={<Flame className="text-orange-400"/>} name="Boiler" isOn={data?.switches?.boiler_on} onToggle={(v) => toggleSwitch('boiler', v)} />
                <QuickActionRow icon={<Shirt className="text-purple-400"/>} name="Lavatrice" isOn={data?.switches?.washing_machine_on} onToggle={(v) => toggleSwitch('washer', v)} />
            </div>

            {/* 4. MAPPA SAT (80% Centrata) */}
            <div className="space-y-3 pb-32 flex flex-col items-center">
                <div className="flex justify-between items-center w-[80%] px-2">
                    <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase font-mono">Posizione GPS</h3>
                    <button onClick={() => window.open(`maps://?q=${lat},${lon}`, '_blank')} className="text-[10px] font-black bg-cyan-500/10 text-cyan-400 px-3 py-1 rounded-full border border-cyan-500/20 flex items-center gap-2 uppercase tracking-tight"><Navigation size={12} /> Apri in Mappe</button>
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
// 5. COMPONENTI UI
// ============================================================
const StatusBox = ({ icon, title, value, sub }) => (
    <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 flex flex-col shadow-lg text-white">
        <div className="flex items-center gap-1 text-gray-500 text-[9px] font-black tracking-widest uppercase">{icon} {title}</div>
        <div className="text-3xl font-black mt-1 tracking-tighter">{value}</div>
        <div className="text-[10px] text-gray-600 font-bold uppercase tracking-tight">{sub}</div>
    </div>
);

const TempCard = ({ icon, title, val, color, valueColor = "text-white" }) => (
    <div className="bg-white/5 py-4 rounded-3xl border border-white/5 flex flex-col items-center gap-1 text-center shadow-md">
        <div className={color}>{icon}</div>
        <div className="text-[8px] font-black text-gray-600 uppercase tracking-tighter mt-1">{title}</div>
        <div className={`text-lg font-black ${valueColor}`}>{val?.toFixed(1) || '-'}°</div>
    </div>
);

const QuickActionRow = ({ icon, name, isOn, onToggle }) => (
    <div className="flex items-center justify-between p-5 bg-white/[0.02] text-white">
        <div className="flex items-center gap-3">
            {React.cloneElement(icon, { size: 20, className: isOn ? icon.props.className : 'text-gray-700' })}
            <span className="text-sm font-bold tracking-tight">{name}</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={isOn || false} onChange={(e) => onToggle(e.target.checked)} />
            <div className="w-11 h-6 bg-gray-800 rounded-full peer peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full shadow-inner"></div>
        </label>
    </div>
);

export default HomeView;
