/* --- File: src/views/HomeView.jsx --- */
import React, { useEffect, useState, useMemo } from 'react';
// Aggiunto Circle agli import di react-leaflet
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Battery, Power, Thermometer, Droplet, Flame,
  Shirt, Snowflake, Sofa, Navigation, Plus, Minus, Target,
  AlertTriangle, ChevronRight, Maximize2, Minimize2, Anchor // Aggiunto Anchor
} from 'lucide-react';

// ============================================================
// 1. CONFIGURAZIONE ICONE (Barca e Ancora)
// ============================================================
const boatIcon = new L.DivIcon({
    html: `<div style="font-size: 20px; opacity: 0.8; filter: drop-shadow(0 0 5px black);">⛵</div>`,
    className: 'boat-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
});

const anchorMarkerIcon = new L.DivIcon({
    html: `<div style="font-size: 18px; filter: drop-shadow(0 0 3px black);">⚓</div>`,
    className: 'anchor-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

const formatNautic = (val, isLat) => {
        if (!val) return '';
        const hemi = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
        const absVal = Math.abs(val);
        const deg = Math.floor(absVal);
        const min = ((absVal - deg) * 60).toFixed(4);
        return `${deg} ${min}${hemi}`;
    };

// ============================================================
// 2. LOGICHE COLORE DINAMICO
// ============================================================

/** Scala Sicurezza Voltaggio AC Banchina */
const getShoreVoltageColor = (v) => {
    if (!v || v < 50) return 'text-gray-300';
    if (v < 195 || v > 255) return 'text-red-500';
    if (v < 210 || v > 245) return 'text-orange-500';
    return 'text-gray-400';
};

/**
 * getShorePowerColor: Verifica il carico AC
 * - Se isShoreOn è true: Limite = Ampere * Volt
 * - Se isShoreOn è false: Limite = 1200W (Inverter)
 */
const getShorePowerColor = (w, limitAmps, v, isShoreOn) => {
    const absW = Math.abs(w);
    const isGridStable = isShoreOn && v > 180;
    const safeLimit = isGridStable ? (limitAmps * v) : 1200;
    const usageRatio = absW / (safeLimit > 100 ? safeLimit : 1200);

    if (usageRatio > 0.9) return 'text-red-500 animate-pulse font-black';
    if (usageRatio > 0.7) return 'text-orange-500 font-black';
    if (isGridStable && absW > 1000) return 'text-yellow-400 font-black';
    return 'text-gray-100'; // Bianco di base se tutto OK
};

const toggleFullscreen = () => {
    const element = document.getElementById("map-container");
    if (!document.fullscreenElement) {
        element.requestFullscreen().catch(err => {
            console.error(`Errore nel fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
};

/** Scala cromatica universale per Pozzetti (Freezer/Frigo) */
const getHybridTempColor = (t) => {
    if (t === undefined || t === null) return 'text-white';
    if (t <= -12) return 'text-blue-600';     // Freezer OK
    if (t < -4) return 'text-blue-400';       // Freezer al limite
    if (t < 4) return 'text-orange-500';      // Zona critica (scongelamento/ghiaccio)
    if (t <= 9) return 'text-white';          // Frigo OK
    if (t <= 12) return 'text-orange-500';    // Frigo caldo
    return 'text-red-500';                    // Allarme
};

// ============================================================
// 3. PLUGIN LOGICA E CONTROLLI MAPPA (Versione Evoluta + Fullscreen Fix)
// ============================================================
const MapPlugins = ({
    coords,
    trail,
    autoFollow,
    setAutoFollow,
    isMapFull,
    setIsMapFull
}) => {
    const map = useMap();

    // =========================
    // ZOOM CONTROL
    // =========================
    const handleZoom = (type) => {
        setAutoFollow(false);

        const currentZoom = map.getZoom();
        const nextZoom = type === 'in'
            ? currentZoom + 1
            : currentZoom - 1;

        map.setZoom(nextZoom);
    };

    // =========================
    // FULLSCREEN / RESIZE FIX
    // =========================
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            map.invalidateSize(false);

            if (autoFollow && coords[0] !== 0) {
                map.setView(coords, map.getZoom(), {
                    animate: false
                });
            }
        });

        return () => cancelAnimationFrame(id);
    }, [isMapFull, autoFollow, coords, map]);

    // =========================
    // USER INTERACTION STOP AUTO FOLLOW
    // =========================
    useMapEvents({
        dragstart: () => setAutoFollow(false),
        zoomstart: () => setAutoFollow(false),
    });

    // =========================
    // LIVE FOLLOW
    // =========================
    useEffect(() => {
        if (autoFollow && coords[0] !== 0) {
            map.setView(coords, map.getZoom(), {
                animate: true,
                duration: 0.5
            });
        }
    }, [coords, autoFollow, map]);

    return (
        <>
            {/* =========================
                GPS TRAIL
            ========================= */}
            {trail.length > 0 && (
                <Polyline
                    positions={trail}
                    color="#22d3ee"
                    weight={3}
                    opacity={0.75}
                    lineCap="round"
                    lineJoin="round"
                    smoothFactor={0}
                />
            )}

            {/* =========================
                CONTROLLI MAPPA
            ========================= */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-[1000]">

                <button
                    onClick={() => handleZoom('in')}
                    className="w-12 h-12 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-xl active:scale-90 transition-all hover:bg-black/60"
                >
                    <Plus size={24} />
                </button>

                <button
                    onClick={() => handleZoom('out')}
                    className="w-12 h-12 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-xl active:scale-90 transition-all hover:bg-black/60"
                >
                    <Minus size={24} />
                </button>

                <button
                    onClick={() => {
                        setAutoFollow(true);
                        // Forza il ritorno alle coordinate e allo zoom di default (18)
                        map.flyTo(coords, 18, {
                            duration: 0.5
                        });
                    }}
                    className={`w-12 h-12 rounded-2xl backdrop-blur-xl border transition-all flex items-center justify-center shadow-xl active:scale-90 ${
                        autoFollow
                            ? 'bg-cyan-500/40 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                            : 'bg-black/50 border-white/20'
                    }`}
                >
                    <Target size={24} className={autoFollow ? "text-white" : "text-gray-300"} />
                </button>

                {/* FULLSCREEN TOGGLE */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setAutoFollow(false);
                        setIsMapFull(prev => !prev);
                    }}
                    className="w-12 h-12 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-xl active:scale-90 transition-all hover:bg-black/60"
                >
                    {isMapFull
                        ? <Minimize2 size={20} />
                        : <Maximize2 size={20} />
                    }
                </button>
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
    const [isMapFull, setIsMapFull] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        if (error) setShowSSLModal(true);
        else setShowSSLModal(false);
    }, [error]);

    const lat = parseFloat(data?.gps?.lat) || 36.78;
    const lon = parseFloat(data?.gps?.lon) || 14.54;
    const coords = [lat, lon];

    // --- ALGORITMO DI SMOOTHING CATMULL-ROM PER LA TRACCIA GPS ---
    const smoothedTrail = useMemo(() => {
        const rawHistory = data?.environment?.gps_history || [];
        
        // Aggiungiamo coords (lat, lon) come ultimo punto dinamico per la visualizzazione
        const currentPos = { lat: coords[0], lon: coords[1] };
        const pointsWithCurrent = [...rawHistory, currentPos];

        if (pointsWithCurrent.length < 4) return pointsWithCurrent.map(h => [parseFloat(h.lat), parseFloat(h.lon)]);

        const points = pointsWithCurrent.map(h => ({ x: parseFloat(h.lat), y: parseFloat(h.lon) }));
        let smoothPoints = [];

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i === 0 ? i : i - 1];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[i + 1 === points.length - 1 ? i + 1 : i + 2];

            // Generiamo 4 punti intermedi per ogni segmento
            for (let t = 0; t < 1; t += 0.25) {
                const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t * t + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t * t * t);
                const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t * t + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t * t * t);
                smoothPoints.push([x, y]);
            }
        }
        smoothPoints.push([points[points.length - 1].x, points[points.length - 1].y]);
        return smoothPoints;
    }, [data?.environment?.gps_history, coords]); // Aggiunto coords come dipendenza

    return (
        <div className="px-2 pt-5 pb-4 landscape:p-2 landscape:pt-4 space-y-2 landscape:space-y-2">

            {/* --- MODALE SBLOCCO SSL (Ottimizzata per schermi bassi) --- */}
            {showSSLModal && (
                <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
                    <div className="bg-[#1a1a1a] border border-white/10 p-6 landscape:p-5 rounded-[2rem] shadow-2xl max-w-sm w-full space-y-4 landscape:space-y-3 my-auto">
                        <div className="bg-red-500/20 w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-lg text-red-500">
                            <AlertTriangle size={24} />
                        </div>
                        <div className="space-y-1 text-center">
                            <h2 className="text-lg font-black uppercase tracking-tight text-white font-mono leading-none">Sicurezza API</h2>
                            <p className="text-gray-400 text-[11px] font-bold px-2">Autorizza il certificato per ricevere i dati.</p>
                        </div>
                        <div className="space-y-2 pt-2">
                            <button onClick={() => window.open(`${apiUrl}`, '_blank')} className="w-full bg-red-500 hover:bg-red-600 text-white font-black py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 uppercase text-[11px] tracking-widest font-mono">1. Autorizza SSL</button>
                            <p className="text-[9px] text-gray-300 font-black uppercase tracking-tighter text-center">Poi chiudi la scheda e torna qui</p>
                            <button onClick={() => setShowSSLModal(false)} className="w-full bg-white/5 hover:bg-white/10 text-white font-black py-3 rounded-2xl border border-white/10 active:scale-95 uppercase text-[11px] tracking-widest font-mono">2. Ho fatto</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* --- SEZIONE 1: ENERGIA (Con logica dinamica per Watt e Segni) --- */}
            <div className="grid grid-cols-2 gap-2 landscape:gap-2">
                {/* CARD BATTERIA */}
                <div onClick={() => onTabChange(1)} className="cursor-pointer active:scale-95 transition-transform">
                    <StatusBox
                        title="BATTERIA"
                        icon={<Battery className="text-green-500"/>}
                        value={`${data?.power?.soc?.toFixed(1) || '-'}%`}
                        sub={
                            <span className={data?.power?.dc_draw_w >= 0 ? "text-green-400" : "text-gray-100"}>
                                {data?.power?.dc_draw_w > 0 ? `+${Math.round(data.power.dc_draw_w)}` : Math.round(data?.power?.dc_draw_w || 0)}
                                <span className="opacity-40 ml-0.5 font-black uppercase text-[12px]">w</span>
                            </span>
                        }
                    />
                </div>

                {/* CARD BANCHINA / INVERTER (Sempre su due righe a destra) */}
                <div onClick={() => onTabChange(3)} className="cursor-pointer active:scale-95 transition-transform">
                    <StatusBox
                        title="BANCHINA"
                        icon={<Power className={data?.power?.shore_power ? "text-green-500" : "text-red-500"}/>}
                        value={data?.power?.shore_power ? "ON" : "OFF"}
                        sub={
                            <div className="flex flex-col items-end leading-none">
                                <span className={getShorePowerColor(data?.power?.ac_power_w, data?.switches?.shore_limit, data?.power?.shore_v, data?.power?.shore_power)}>
                                    {Math.round(data?.power?.ac_power_w || 0)}
                                    <span className="opacity-40 ml-0.5 font-black uppercase text-[12px]">w</span>
                                </span>
                                {data?.power?.shore_power && data?.power?.shore_v > 50 && (
                                    <span className={`${getShoreVoltageColor(data?.power?.shore_v)} text-[12px] font-bold mt-1.5`}>
                                        ({data?.power?.shore_v?.toFixed(0)}V)
                                    </span>
                                )}
                            </div>
                        }
                    />
                </div>
            </div>

            {/* --- SEZIONE 2 & 3: TEMPERATURE E INTERRUTTORI --- */}
            <div className="flex flex-col md:flex-row gap-2 landscape:gap-2 w-full">
                {/* Temperature (4 colonne o 2x2 in landscape) */}
                <div className="w-full md:w-1/2 grid grid-cols-4 md:grid-cols-2 gap-2">
                    <div onClick={() => onTabChange(2)} className="cursor-pointer active:scale-95 transition-transform h-full">
                        <TempCard icon={<Thermometer size={18}/>} title="POZZ." val={data?.environment?.temp_pozzetto} color="text-yellow-500" />
                    </div>
                    <TempCard icon={<Sofa size={18}/>} title="QUADR." val={data?.environment?.temp_quadrato} color="text-orange-500" />
                    <TempCard icon={<Snowflake size={18}/>} title="FRIGO" val={data?.environment?.temp_frigo} color="text-cyan-400" valueColor={getHybridTempColor(data?.environment?.temp_frigo)} />
                    <TempCard icon={<Snowflake size={18}/>} title="FREEZER" val={data?.environment?.temp_freezer} color="text-blue-500" valueColor={getHybridTempColor(data?.environment?.temp_freezer)} />
                </div>

                {/* Interruttori Shelly (Inibiti durante il sync) */}
                <div className={`w-full md:w-1/2 bg-white/5 rounded-[2rem] flex flex-col divide-y divide-white/5 border border-white/10 overflow-hidden shadow-xl  ${isUpdating ? 'opacity-60 grayscale-[0.5]' : 'opacity-100'}`}>
                    <QuickActionRow icon={<Droplet className="text-blue-400"/>} name="Pompa Acqua" isOn={data?.switches?.pump_on} onToggle={(v) => toggleSwitch('pump', v)} disabled={isUpdating} />
                    <QuickActionRow icon={<Flame className="text-orange-400"/>} name="Boiler" isOn={data?.switches?.boiler_on} onToggle={(v) => toggleSwitch('boiler', v)} disabled={isUpdating} />
                    <QuickActionRow icon={<Shirt className="text-purple-400"/>} name="Lavatrice" isOn={data?.switches?.washing_machine_on} onToggle={(v) => toggleSwitch('washer', v)} disabled={isUpdating} />
                </div>
            </div>

            {/* --- SEZIONE 4: MAPPA SATELLITARE CON STRUTTURA COCKPIT NAUTICO --- */}
            <div className="space-y-3 pb-22 flex flex-col items-center w-full">
                {!isMapFull && (
                    <div className="w-[80%] bg-[#121212]/90 backdrop-blur-xl border border-white/10 p-4 rounded-[2rem] shadow-2xl flex flex-col gap-2.5 text-white">
                        
                        {/* RIGA 1: Stato dell'Ancoraggio (Intera Larghezza) */}
                        <div className="flex items-center gap-2 w-full">
                            <Anchor
                                size={14}
                                className={`${
                                    data?.anchor?.status === 'LOCKED' ? 'text-cyan-400' :
                                    (data?.anchor?.status === 'DRAGGING' || data?.anchor?.status === 'DRIFTING') ? 'text-red-500 animate-pulse' :
                                    (data?.anchor?.status === 'LEARNING' || data?.anchor?.status === 'SETTLING') ? 'text-yellow-400 animate-spin-slow' : 'text-green-400'
                                }`}
                            />
                            <span className="text-[11px] font-black uppercase tracking-widest text-white font-mono leading-none whitespace-nowrap">
                                {data?.anchor?.description || "In Navigazione"}
                            </span>
                        </div>

                        {/* RIGA 1B: Coordinate Nautiche con riga dedicata (visibile solo se all'ancora) */}
                        {data?.anchor?.lat && (
                            <div className="w-full flex items-center justify-between mt-0.5 border-b border-white/5 pb-2">
                                <span
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!data?.anchor?.status) return;
                                        
                                        const isArmed = (data.anchor.status === 'LOCKED' || data.anchor.status === 'DRAGGING' || data.anchor.status === 'DRIFTING' || data.anchor.status === 'LEARNING');
                                        
                                        // Genera una stringa diagnostica ultra-completa per le analisi in chat
                                        const textToCopy = isArmed
                                            ? `⛵ ROTEVISTA: [${data.anchor.description || data.anchor.status}] | D: ${data.anchor.boat_dist?.toFixed(1) || '0.0'}m | ${formatNautic(data.anchor.lat, true)} ${formatNautic(data.anchor.lon, false)} | R: ${data.anchor.radius?.toFixed(0) || '0'}m | Prec: ±${data.anchor.std_dev?.toFixed(1) || '0.0'}m | Fondale: ${data.anchor.depth?.toFixed(1) || '0.0'}m | Catena: ${data.anchor.chain?.toFixed(0) || '0'}m | Volvo: ${data.anchor.engine_on ? 'ON' : 'OFF'} (${data.anchor.engine_v?.toFixed(1) || '0.0'}V)${data.anchor.score > 0 ? ` [Score: ${data.anchor.score}/70]` : ''}`
                                            : `⛵ ROTEVISTA: ${data.anchor.description || data.anchor.status}`;
                                        
                                        if (navigator.clipboard && window.isSecureContext) {
                                            navigator.clipboard.writeText(textToCopy).then(() => {
                                                setIsCopied(true);
                                                setTimeout(() => setIsCopied(false), 2000);
                                            });
                                        } else {
                                            const textArea = document.createElement("textarea");
                                            textArea.value = textToCopy;
                                            textArea.style.position = "fixed";
                                            textArea.style.opacity = "0";
                                            document.body.appendChild(textArea);
                                            textArea.focus();
                                            textArea.select();
                                            document.execCommand('copy');
                                            setIsCopied(true);
                                            setTimeout(() => setIsCopied(false), 2000);
                                            document.body.removeChild(textArea);
                                        }
                                    }}
                                    className={`text-[10px] font-mono tracking-tight cursor-pointer transition-colors duration-200 uppercase font-black leading-none ${
                                        isCopied ? 'text-green-400 animate-pulse' : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {isCopied ? "✓ Copiato in appunti" : `📌 Posiz: ${formatNautic(data.anchor.lat, true)}   ${formatNautic(data.anchor.lon, false)}`}
                                </span>
                            </div>
                        )}

                        {/* RIGA 2: Griglia delle Distanze di Sicurezza (Attiva solo in rada) */}
                        {data?.anchor?.status && data?.anchor?.status !== 'MOVING' && (
                            <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-white/5 text-center bg-white/[0.01] rounded-2xl">
                                <div className="flex flex-col">
                                    <span className="text-[7.5px] font-black uppercase text-gray-400 tracking-wider">Distanza</span>
                                    <span className={`text-sm font-black font-mono mt-0.5 ${
                                        (data.anchor.status === 'LEARNING' || data.anchor.status === 'SETTLING') ? 'text-orange-500' : 'text-cyan-400'
                                    }`}>
                                        {data.anchor.boat_dist?.toFixed(1) || '0.0'}<span className="text-[10px] font-bold text-gray-400 ml-0.5">m</span>
                                    </span>
                                </div>
                                <div className="flex flex-col border-l border-r border-white/5">
                                    <span className="text-[7.5px] font-black uppercase text-gray-400 tracking-wider">Raggio Guardia</span>
                                    <span className={`text-sm font-black font-mono mt-0.5 ${
                                        (data.anchor.status === 'LEARNING' || data.anchor.status === 'SETTLING') ? 'text-orange-500' : 'text-white'
                                    }`}>
                                        {data.anchor.radius?.toFixed(0) || '0'}<span className="text-[10px] font-bold text-gray-400 ml-0.5">m</span>
                                    </span>
                                </div>
                                <div className="flex flex-col font-mono">
                                    <span className="text-[7.5px] font-black uppercase text-gray-400 tracking-wider">Precisione</span>
                                    <span className={`text-sm font-black mt-0.5 ${
                                        (data.anchor.status === 'LEARNING' || data.anchor.status === 'SETTLING') ? 'text-orange-400' : 'text-cyan-400'
                                    }`}>
                                        {(data.anchor.status === 'LEARNING' || data.anchor.status === 'SETTLING')
                                            ? 'Calcolo...'
                                            : (data.anchor.std_dev > 0 ? `±${data.anchor.std_dev.toFixed(1)}m` : '±0.0m')}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* RIGA 3: Informazioni Ambientali, Volvo e Note di Bassa Fiducia */}
                        <div className="flex justify-between items-center text-[10px] font-bold text-gray-300 font-mono leading-none">
                            {/* Dati Fisici del fondale (Fondale & Catena) */}
                            <div className="flex gap-4">
                                {data?.anchor?.depth > 0 && (
                                    <span>Fondale: <span className="text-white font-black">{data.anchor.depth.toFixed(1)}m</span></span>
                                )}
                                {data?.anchor?.chain > 0 && (
                                    <span>Catena: <span className="text-white font-black">{data.anchor.chain.toFixed(0)}m</span></span>
                                )}
                            </div>

                            {/* Integrazione Dinamica Allarmi/Volvo Engine/Bassa Fiducia */}
                            <div className="flex items-center">
                                {data?.anchor?.engine_on ? (
                                    <span className="text-yellow-400 font-black animate-pulse flex items-center gap-1">
                                        ⚡ Volvo: {data.anchor.engine_v?.toFixed(1)}V {data.anchor.score > 0 ? `[Salpamento: ${data.anchor.score}/70]` : ''}
                                    </span>
                                ) : (
                                    data?.anchor?.status === 'LEARNING' && data?.anchor?.low_conf_reason ? (
                                        <span className="text-orange-400 font-black tracking-tight">Nota: {data.anchor.low_conf_reason}</span>
                                    ) : (
                                        data?.anchor?.status === 'LOCKED' && (
                                            <span className="text-gray-400">Fiducia: <span className="text-green-400 font-black uppercase">Ottima</span></span>
                                        )
                                    )
                                )}
                            </div>
                        </div>

                    </div>
                )}

                {/* Aggiungiamo la classe condizionale map-full-screen */}
                <div
                    className={`${isMapFull ? 'map-full-screen' : 'h-64 landscape:h-80 w-[80%] rounded-[2.5rem]'} overflow-hidden border border-white/10 shadow-2xl relative isolate transition-opacity duration-200`}
                >
                
                    <MapContainer
                        center={coords}
                        zoom={18}
                        maxZoom={22}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={false}
                        attributionControl={false}
                    >
                        <TileLayer
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            maxZoom={22}
                            maxNativeZoom={18}
                            errorTileUrl=""
                        />
                        {/* Passiamo setIsMapFull qui dentro */}
                        <MapPlugins
                            coords={coords}
                            trail={smoothedTrail}
                            autoFollow={autoFollow}
                            setAutoFollow={setAutoFollow}
                            isMapFull={isMapFull}
                            setIsMapFull={setIsMapFull}
                        />

                        {/* CERCHIO DI SICUREZZA PROVVISORIO (Arancione, visibile in fase di LEARNING o SETTLING) */}
                        {data?.anchor?.lat && data?.anchor?.lon && data.anchor.radius > 0 &&
                         (data.anchor.status === 'LEARNING' || data.anchor.status === 'SETTLING') && (
                            <Circle
                                center={[data.anchor.lat, data.anchor.lon]}
                                radius={data.anchor.radius}
                                pathOptions={{
                                    color: '#f97316', // Arancione vivido per indicare l'assestamento/apprendimento
                                    fillOpacity: 0,
                                    weight: 1.5,
                                    dashArray: '6, 10', // Tratteggio differente per distinguerlo dalla guardia attiva
                                    interactive: false
                                }}
                            />
                        )}

                        {/* CERCHIO DI SICUREZZA DEFINITIVO (Cyan/Rosso, visibile in LOCKED, DRAGGING o DRIFTING) */}
                        {data?.anchor?.lat && data?.anchor?.lon && data.anchor.radius > 0 &&
                         (data.anchor.status === 'LOCKED' || data.anchor.status === 'DRAGGING' || data.anchor.status === 'DRIFTING') && (
                            <Circle
                                center={[data.anchor.lat, data.anchor.lon]}
                                radius={data.anchor.radius + Math.max(15, data.anchor.radius * 0.30)} // Allineato al metro con la soglia allarme reale
                                pathOptions={{
                                    color: (data.anchor.status === 'DRAGGING' || data.anchor.status === 'DRIFTING') ? '#ef4444' : '#22d3ee',
                                    fillOpacity: 0,
                                    weight: 1.5,
                                    dashArray: '8, 12',
                                    interactive: false
                                }}
                            />
                        )}

                        {/* MARKER POSIZIONE PREVISTA ANCORA (Nascosto in LEARNING/SETTLING per evitare confusione visiva) */}
                        {data?.anchor?.lat && data?.anchor?.lon &&
                         data.anchor.status !== 'LEARNING' && data.anchor.status !== 'SETTLING' && data.anchor.status !== 'MOVING' && (
                            <Marker
                                position={[data.anchor.lat, data.anchor.lon]}
                                icon={anchorMarkerIcon}
                                zIndexOffset={500}
                            />
                        )}

                        {/* MARKER BARCA (Sempre sopra a tutto) */}
                        <Marker position={coords} icon={boatIcon} zIndexOffset={1000} />
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
    <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 flex flex-row items-center justify-between shadow-lg text-white group hover:bg-white/10 transition-colors h-full">
        <div className="flex flex-col">
            <div className="flex items-center gap-1 text-gray-300 text-[9px] font-black tracking-widest uppercase whitespace-nowrap">{icon} {title}</div>
            <div className="text-3xl font-black mt-1 tracking-tighter">{value}</div>
        </div>
        <div className="text-[18px] text-gray-200 font-black uppercase tracking-tight text-right pl-2 leading-tight">{sub}</div>
    </div>
);

const TempCard = ({ icon, title, val, color, valueColor = "text-white" }) => (
    <div className="bg-white/5 py-4 landscape:py-3 rounded-3xl border border-white/5 flex flex-col items-center gap-1 text-center shadow-md hover:bg-white/10 transition-colors h-full justify-center text-white">
        <div className={color}>{icon}</div>
        <div className="text-[8px] font-black text-gray-300 uppercase tracking-tighter mt-1">{title}</div>
        <div className={`text-lg font-black ${valueColor}`}>{val?.toFixed(1) || '-'}°</div>
    </div>
);

const QuickActionRow = ({ icon, name, isOn, onToggle, disabled }) => (
    <div className={`flex flex-1 items-center justify-between p-5 landscape:p-4 bg-white/[0.02] text-white transition-all ${disabled ? 'pointer-events-none opacity-40' : 'hover:bg-white/5'}`}>
        <div className="flex items-center gap-3">
            {React.cloneElement(icon, { size: 20, className: isOn ? icon.props.className : 'text-gray-700 opacity-50' })}
            <span className="text-sm font-bold text-white tracking-tight uppercase">{name}</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={isOn || false} onChange={(e) => onToggle(e.target.checked)} disabled={disabled} />
            <div className="w-11 h-6 bg-gray-800 rounded-full peer peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full shadow-inner"></div>
        </label>
    </div>
);

export default HomeView;
