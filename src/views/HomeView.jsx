/* --- File: src/views/HomeView.jsx --- */
import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
    Battery, Power, Thermometer, Droplet, Flame,
    Shirt, Snowflake, Sofa, Navigation, Plus, Minus, Target,
    AlertTriangle, ChevronRight, Maximize2, Minimize2, Anchor
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

/** Generatore dell'icona dell'ancora propria (passa a rosso brillante in caso di pericolo incrocio, con forzatura testuale per iOS) */
const myAnchorMarkerIcon = (isThreatened) => new L.DivIcon({
    html: `<div style="font-size: 18px; color: ${isThreatened ? '#ef4444' : 'rgba(255, 255, 255, 0.85)'}; filter: drop-shadow(0 0 3px black); transition: color 0.5s ease-in-out;">⚓&#xFE0E;</div>`,
    className: 'anchor-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

/** Icona dell'ancora sommersa del vicino (disegnata in rosso, più grande e con lampeggio ad impulsi di Tailwind) */
const nearbyVesselAnchorIcon = new L.DivIcon({
    html: `<div style="font-size: 18px; color: #ef4444; filter: drop-shadow(0 0 3px black);">⚓&#xFE0E;</div>`,
    className: 'nearby-anchor-marker animate-pulse',
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

/** Calcola la coordinata Ovest (270°) esatta sul bordo del cerchio per posizionare le etichette */
const getWestLabelCoords = (center, radius) => {
    const d2r = Math.PI / 180;
    const dLon = -radius / (111139 * Math.cos(center.lat * d2r));
    return [center.lat, center.lon + dLon];
};

/** Restituisce i 3 cerchi di distanza dinamici in base allo zoom attuale, scalati per rientrare su schermi iPhone */
const getDynamicRangeRings = (zoom) => {
    if (zoom >= 19) return [{ r: 15, label: "15m" }, { r: 30, label: "30m" }, { r: 45, label: "45m" }];
    if (zoom === 18) return [{ r: 25, label: "25m" }, { r: 50, label: "50m" }, { r: 75, label: "75m" }];
    if (zoom === 17) return [{ r: 50, label: "50m" }, { r: 100, label: "100m" }, { r: 150, label: "150m" }];
    if (zoom === 16) return [{ r: 100, label: "100m" }, { r: 200, label: "200m" }, { r: 300, label: "300m" }];
    if (zoom === 15) return [{ r: 250, label: "250m" }, { r: 500, label: "500m" }, { r: 750, label: "750m" }];
    if (zoom === 14) return [{ r: 500, label: "500m" }, { r: 926, label: "0.5 NM" }, { r: 1852, label: "1 NM" }];
    if (zoom === 13) return [{ r: 926, label: "0.5 NM" }, { r: 1852, label: "1 NM" }, { r: 3704, label: "2 NM" }];
    return [{ r: 1852, label: "1 NM" }, { r: 3704, label: "2 NM" }, { r: 9260, label: "5 NM" }];
};

/** Calcola la coordinata di proiezione futura a 15 minuti basandosi su COG e SOG */
const getVectorCoords = (lat, lon, cog, sog) => {
    const d2r = Math.PI / 180;
    const distance = sog * 463; // Metri percorsi in 15 minuti (sog * 1852 * 0.25)
    const projectedLat = lat + (distance * Math.cos(cog * d2r)) / 111139;
    const projectedLon = lon + (distance * Math.sin(cog * d2r)) / (111139 * Math.cos(lat * d2r));
    return [projectedLat, projectedLon];
};

/** Icona del puntino per le barche all'ancora con colore in base al rischio */
const stationaryVesselIcon = (risk) => {
    let color = "rgba(225, 225, 225, 0.85)";
    if (risk === "RED") color = "#ef4444";
    else if (risk === "ORANGE") color = "#f97316";

    return new L.DivIcon({
        html: `<div style="width: 8px; height: 8px; background-color: ${color}; border-radius: 50%; border: 1.2px solid rgba(0, 0, 0, 0.6); box-shadow: 0 0 3px rgba(0,0,0,0.5);"></div>`,
        className: 'stationary-vessel-marker',
        iconSize: [8, 8],
        iconAnchor: [4, 4]
    });
};

/** Colore semaforico univoco pilotato al 100% dal backend Node-RED (Single Source of Truth) */
const getVesselStatusColor = (v) => {
    return v.color || "rgba(225, 225, 225, 0.85)";
};

/** Calcola le dimensioni di icone e testi in base al livello di zoom della mappa */
const getAisSizes = (zoom) => {
    if (zoom >= 18) {
        return { nameSize: "15px", subSize: "11px", emojiSize: "26px", markerSize: 20, iconSize: [400, 64], iconAnchor: [-14, 32] };
    }
    if (zoom <= 14) {
        return { nameSize: "10px", subSize: "7.5px", emojiSize: "16px", markerSize: 12, iconSize: [280, 42], iconAnchor: [-8, 21] };
    }
    return { nameSize: "13px", subSize: "9.5px", emojiSize: "22px", markerSize: 16, iconSize: [350, 56], iconAnchor: [-12, 28] };
};

/** Icona del triangolo per le barche in movimento con dimensione dinamica da zoom */
const movingVesselIcon = (cog, color, zoom) => {
    const s = getAisSizes(zoom);
    return new L.DivIcon({
        html: `<div style="transform: rotate(${cog}deg); font-size: ${s.markerSize}px; color: ${color}; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">▲</div>`,
        className: 'moving-vessel-marker',
        iconSize: [s.markerSize, s.markerSize],
        iconAnchor: [s.markerSize / 2, s.markerSize / 2]
    });
};

/** Funzione per convertire il codice AIS del tipo di nave nell'emoji corrispondente */
const getShipTypeEmoji = (type) => {
    const t = parseInt(type) || 0;
    if (t === 36) return "⛵";
    if (t === 37) return "🛥️";
    if (t === 30) return "🐟";
    if (t >= 50 && t <= 59) return "👨🏻‍✈️";
    if (t === 31 || t === 32 || t === 52) return "🚜";
    if (t >= 60 && t <= 69) return "⛴️";
    if (t >= 70 && t <= 79) return "📦";
    if (t >= 80 && t <= 89) return "🛢️";
    if (t >= 40 && t <= 49) return "🚤";
    return "";
};

/** Icona testuale per bersagli all'ancora con Emoji affiancata e scala dinamica da zoom */
const stationaryVesselLabelIcon = (name, risk, riskMsg, dist, ageSec, type, zoom) => {
    let color = "rgba(225, 225, 225, 0.85)";
    let extraTxt = "";

    if (risk === "RED") {
        color = "#ef4444";
        extraTxt = `(${riskMsg} - ${dist}m)`;
    } else if (risk === "ORANGE") {
        color = "#f97316";
        extraTxt = `(${riskMsg} - ${dist}m)`;
    } else if (dist <= 200) {
        extraTxt = `${dist}m`;
    }

    if (ageSec >= 120) {
        let ageMin = Math.round(ageSec / 60);
        extraTxt = extraTxt ? `${extraTxt} • RIT: ${ageMin} MIN` : `RIT: ${ageMin} MIN`;
    }

    const emoji = getShipTypeEmoji(type);
    const s = getAisSizes(zoom);

    return new L.DivIcon({
        html: `
            <div style="display: flex; flex-direction: row; align-items: center; gap: 5px; white-space: nowrap; text-transform: uppercase;">
                ${emoji ? `<span style="font-size: ${s.emojiSize}; line-height: 1;">${emoji}</span>` : ""}
                <div style="display: flex; flex-direction: column; align-items: flex-start; justify-content: center; line-height: 1.15;">
                    <span style="font-size: ${s.nameSize}; font-weight: 900; color: ${color}; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">${name}</span>
                    ${extraTxt ? `<span style="font-size: ${s.subSize}; font-weight: 900; color: ${color}; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; margin-top: 1px;">(${extraTxt})</span>` : ""}
                </div>
            </div>
        `,
        className: 'ais-vessel-label',
        iconSize: s.iconSize,
        iconAnchor: s.iconAnchor
    });
};

/** Icona testuale per bersagli in movimento con Emoji e blocco proporzionato allo zoom */
const movingVesselLabelIcon = (name, sog, cpa, tcpa, crossDir, risk, riskMsg, ageSec, color, type, zoom) => {
    let ritTxt = "";
    if (ageSec >= 120) {
        let ageMin = Math.round(ageSec / 60);
        ritTxt = ` • RIT: ${ageMin} MIN`;
    }

    let speedLine = `${sog} kn${ritTxt}`;
    let cpaLine = "";

    if (risk === "RED") {
        let alertTitle = riskMsg || "COLLISIONE!";
        let dirTxt = crossDir ? ` (${crossDir})` : "";
        let timeTxt = (tcpa !== null && tcpa >= 0) ? ` IN ${Math.round(tcpa)} MIN` : "";
        cpaLine = `🚨 ${alertTitle} - CPA: ${cpa}m${dirTxt}${timeTxt}`;
    } else if (tcpa !== null && tcpa >= 0) {
        cpaLine = `CPA: ${cpa}m (${crossDir}) IN ${Math.round(tcpa)} MIN`;
    }

    const emoji = getShipTypeEmoji(type);
    const s = getAisSizes(zoom);

    return new L.DivIcon({
        html: `
            <div style="display: flex; flex-direction: row; align-items: center; gap: 5px; white-space: nowrap; text-transform: uppercase;">
                ${emoji ? `<span style="font-size: ${s.emojiSize}; line-height: 1;">${emoji}</span>` : ""}
                <div style="display: flex; flex-direction: column; align-items: flex-start; justify-content: center; line-height: 1.15;">
                    <span style="font-size: ${s.nameSize}; font-weight: 900; color: ${color}; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">${name}</span>
                    <span style="font-size: ${s.subSize}; font-weight: 900; color: ${color}; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; margin-top: 1px;">${speedLine}</span>
                    ${cpaLine ? `<span style="font-size: ${s.nameSize}; font-weight: 900; color: ${color}; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; margin-top: 2px;">${cpaLine}</span>` : ""}
                </div>
            </div>
        `,
        className: 'ais-moving-label',
        iconSize: s.iconSize,
        iconAnchor: s.iconAnchor
    });
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

/** Verifica il carico AC per banchina o inverter */
const getShorePowerColor = (w, limitAmps, v, isShoreOn) => {
    const absW = Math.abs(w);
    const isGridStable = isShoreOn && v > 180;
    const safeLimit = isGridStable ? (limitAmps * v) : 1200;
    const usageRatio = absW / (safeLimit > 100 ? safeLimit : 1200);

    if (usageRatio > 0.9) return 'text-red-500 animate-pulse font-black';
    if (usageRatio > 0.7) return 'text-orange-500 font-black';
    if (isGridStable && absW > 1000) return 'text-yellow-400 font-black';
    return 'text-gray-100';
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
    if (t <= -12) return 'text-blue-600';
    if (t < -4) return 'text-blue-400';
    if (t < 4) return 'text-orange-500';
    if (t <= 9) return 'text-white';
    if (t <= 12) return 'text-orange-500';
    return 'text-red-500';
};

// ============================================================
// 3. PLUGIN LOGICA E CONTROLLI MAPPA
// ============================================================
const MapPlugins = ({
    coords,
    trail,
    autoFollow,
    setAutoFollow,
    isMapFull,
    setIsMapFull,
    defaultZoom,
    onZoomChange
}) => {
    const map = useMap();

    const mapEvents = useMapEvents({
        dragstart: () => setAutoFollow(false),
        zoomstart: () => setAutoFollow(false),
        zoomend: () => {
            if (onZoomChange) onZoomChange(map.getZoom());
        }
    });

    useEffect(() => {
        if (onZoomChange) onZoomChange(map.getZoom());
    }, [map, onZoomChange]);

    const handleZoom = (type) => {
        setAutoFollow(false);
        const currentZoom = map.getZoom();
        const nextZoom = type === 'in' ? currentZoom + 1 : currentZoom - 1;
        map.setZoom(nextZoom);
        if (onZoomChange) onZoomChange(nextZoom);
    };

    useEffect(() => {
        const id = requestAnimationFrame(() => {
            map.invalidateSize(false);
            if (autoFollow && coords[0] !== 0) {
                map.setView(coords, map.getZoom(), { animate: false });
            }
        });
        return () => cancelAnimationFrame(id);
    }, [isMapFull, autoFollow, coords, map]);

    useEffect(() => {
        if (autoFollow && coords[0] !== 0) {
            map.setView(coords, defaultZoom, { animate: true, duration: 0.5 });
        }
    }, [coords, autoFollow, defaultZoom, map]);

    return (
        <>
            {/* GPS TRAIL */}
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

            {/* CONTROLLI MAPPA */}
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
                        map.flyTo(coords, defaultZoom, { duration: 0.5 });
                    }}
                    className={`w-12 h-12 rounded-2xl backdrop-blur-xl border transition-all flex items-center justify-center shadow-xl active:scale-90 ${
                        autoFollow
                            ? 'bg-cyan-500/40 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                            : 'bg-black/50 border-white/20'
                    }`}
                >
                    <Target size={24} className={autoFollow ? "text-white" : "text-gray-300"} />
                </button>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setAutoFollow(false);
                        setIsMapFull(prev => !prev);
                    }}
                    className="w-12 h-12 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-xl active:scale-90 transition-all hover:bg-black/60"
                >
                    {isMapFull ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
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

    const isAnchored = data?.anchor?.status && data.anchor.status !== 'MOVING';
    const defaultZoom = isAnchored ? 18 : 11;
    const [currentZoom, setCurrentZoom] = useState(defaultZoom);

    useEffect(() => {
        if (error) setShowSSLModal(true);
        else setShowSSLModal(false);
    }, [error]);

    const lat = parseFloat(data?.gps?.lat) || 36.78;
    const lon = parseFloat(data?.gps?.lon) || 14.54;
    const coords = [lat, lon];

    /** Calcola il centro dinamico per gli anelli di distanza (Ancora o Barca) */
    const rangeRingsCenter = useMemo(() => {
        if (isAnchored && data?.anchor?.lat && data?.anchor?.lon) {
            return { lat: parseFloat(data.anchor.lat), lon: parseFloat(data.anchor.lon) };
        }
        return { lat: lat, lon: lon };
    }, [isAnchored, data?.anchor?.lat, data?.anchor?.lon, lat, lon]);

    /** Scansiona i bersagli AIS per capire se un vicino sta galleggiando sopra la nostra ancora */
    const isMyAnchorThreatened = useMemo(() => {
        return (data?.environment?.ais_targets || []).some(
            v => v.risk === "RED" && v.riskMsg === "SOPRA TUA ANCORA!"
        );
    }, [data?.environment?.ais_targets]);

    // --- ALGORITMO DI SMOOTHING CATMULL-ROM PER LA TRACCIA GPS ---
    const smoothedTrail = useMemo(() => {
        const rawHistory = data?.environment?.gps_history || [];
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

            for (let t = 0; t < 1; t += 0.25) {
                const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t * t + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t * t * t);
                const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t * t + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t * t * t);
                smoothPoints.push([x, y]);
            }
        }
        smoothPoints.push([points[points.length - 1].x, points[points.length - 1].y]);
        return smoothPoints;
    }, [data?.environment?.gps_history, coords]);

    return (
        <div className="px-2 pt-5 pb-4 landscape:p-2 landscape:pt-4 space-y-2 landscape:space-y-2">

            {/* --- MODALE SBLOCCO SSL --- */}
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
            
            {/* --- SEZIONE 1: ENERGIA --- */}
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

                {/* CARD BANCHINA / INVERTER */}
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
                {/* Temperature */}
                <div className="w-full md:w-1/2 grid grid-cols-4 md:grid-cols-2 gap-2">
                    <div onClick={() => onTabChange(2)} className="cursor-pointer active:scale-95 transition-transform h-full">
                        <TempCard icon={<Thermometer size={18}/>} title="POZZ." val={data?.environment?.temp_pozzetto} color="text-yellow-500" />
                    </div>
                    <TempCard icon={<Sofa size={18}/>} title="QUADR." val={data?.environment?.temp_quadrato} color="text-orange-500" />
                    <TempCard icon={<Snowflake size={18}/>} title="FRIGO" val={data?.environment?.temp_frigo} color="text-cyan-400" valueColor={getHybridTempColor(data?.environment?.temp_frigo)} />
                    <TempCard icon={<Snowflake size={18}/>} title="FREEZER" val={data?.environment?.temp_freezer} color="text-blue-500" valueColor={getHybridTempColor(data?.environment?.temp_freezer)} />
                </div>

                {/* Interruttori Shelly */}
                <div className={`w-full md:w-1/2 bg-white/5 rounded-[2rem] flex flex-col divide-y divide-white/5 border border-white/10 overflow-hidden shadow-xl ${isUpdating ? 'opacity-60 grayscale-[0.5]' : 'opacity-100'}`}>
                    <QuickActionRow icon={<Droplet className="text-blue-400"/>} name="Pompa Acqua" isOn={data?.switches?.pump_on} onToggle={(v) => toggleSwitch('pump', v)} disabled={isUpdating} />
                    <QuickActionRow icon={<Flame className="text-orange-400"/>} name="Boiler" isOn={data?.switches?.boiler_on} onToggle={(v) => toggleSwitch('boiler', v)} disabled={isUpdating} />
                    <QuickActionRow icon={<Shirt className="text-purple-400"/>} name="Lavatrice" isOn={data?.switches?.washing_machine_on} onToggle={(v) => toggleSwitch('washer', v)} disabled={isUpdating} />
                </div>
            </div>

            {/* --- SEZIONE 4: MAPPA SATELLITARE CON STRUTTURA COCKPIT NAUTICO --- */}
            <div className="space-y-3 pb-24 flex flex-col items-center w-full">
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

                        {/* RIGA 2: Griglia Dinamica (4 Colonne in navigazione, 3 Colonne in avvicinamento o all'ancora) */}
                        {data?.anchor?.status && (
                            <div className={`grid ${
                                data.anchor.status === 'MOVING' && (!data.anchor.radius || data.anchor.radius === 0)
                                    ? 'grid-cols-4'
                                    : 'grid-cols-3'
                            } gap-1.5 py-2 border-t border-b border-white/5 text-center bg-white/[0.01] rounded-2xl`}>
                                {data.anchor.status === 'MOVING' && data.anchor.radius > 0 ? (
                                    // 1. Anteprima Calata attiva in avvicinamento (3 Colonne)
                                    <>
                                        <div className="flex flex-col">
                                            <span className="text-[7.5px] font-black uppercase text-gray-400 tracking-wider">Distanza</span>
                                            <span className="text-sm font-black font-mono mt-0.5 text-gray-500">--</span>
                                        </div>
                                        <div className="flex flex-col border-l border-r border-white/5">
                                            <span className="text-[7.5px] font-black uppercase text-cyan-400 tracking-wider">Raggio Previsto</span>
                                            <span className="text-sm font-black font-mono mt-0.5 text-cyan-400">
                                                {data.anchor.radius?.toFixed(0) || '0'}<span className="text-[10px] font-bold text-gray-400 ml-0.5">m</span>
                                            </span>
                                        </div>
                                        <div className="flex flex-col font-mono">
                                            <span className="text-[7.5px] font-black uppercase text-gray-400 tracking-wider">Spazio in Baia</span>
                                            <span className={`text-sm font-black mt-0.5 ${
                                                (data.anchor.description && data.anchor.description.includes("Ristretto")) ? 'text-orange-400 animate-pulse' : 'text-green-400'
                                            }`}>
                                                {(data.anchor.description && data.anchor.description.includes("Ristretto")) ? 'OCCUPATO' : 'LIBERO'}
                                            </span>
                                        </div>
                                    </>
                                ) : data.anchor.status === 'MOVING' ? (
                                    // 2. Navigazione Aperta: Griglia Tattica a 4 Colonne (Motore, Vela, Tratta, SOG)
                                    <>
                                        <div className="flex flex-row items-center justify-center gap-1.5 px-1">
                                            <span className="text-xl select-none leading-none">🚤</span>
                                            <div className="flex flex-col items-start justify-center">
                                                <span className="text-[7.5px] font-black uppercase text-yellow-400 tracking-wider leading-none">Motore</span>
                                                <span className="text-sm font-black font-mono mt-0.5 text-white leading-none">
                                                    {data?.trip?.engine_time || '0m'}
                                                </span>
                                                <span className="text-[8.5px] font-bold font-mono text-gray-400 mt-1 leading-none">
                                                    {data?.trip?.engine_nm || '0.00 NM'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-row items-center justify-center gap-1.5 border-l border-r border-white/5 px-1">
                                            <span className="text-xl select-none leading-none">⛵</span>
                                            <div className="flex flex-col items-start justify-center">
                                                <span className="text-[7.5px] font-black uppercase text-cyan-400 tracking-wider leading-none">Vela</span>
                                                <span className="text-sm font-black font-mono mt-0.5 text-white leading-none">
                                                    {data?.trip?.sail_time || '0m'}
                                                </span>
                                                <span className="text-[8.5px] font-bold font-mono text-gray-400 mt-1 leading-none">
                                                    {data?.trip?.sail_nm || '0.00 NM'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-row items-center justify-center gap-1.5 border-r border-white/5 px-1">
                                            <span className="text-xl select-none leading-none">⏱️</span>
                                            <div className="flex flex-col items-start justify-center">
                                                <span className="text-[7.5px] font-black uppercase text-gray-400 tracking-wider leading-none">Tratta</span>
                                                <span className="text-sm font-black font-mono mt-0.5 text-gray-200 leading-none">
                                                    {data?.trip?.total_nav_time || '0m'}
                                                </span>
                                                <span className="text-[8.5px] font-bold font-mono text-cyan-400 mt-1 leading-none">
                                                    {data?.trip?.total_nm || '0.00 NM'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-row items-center justify-center gap-1.5 px-1">
                                            <span className="text-xl select-none leading-none">⚡</span>
                                            <div className="flex flex-col items-start justify-center font-mono">
                                                <span className="text-[7.5px] font-black uppercase text-cyan-400 tracking-wider leading-none">SOG</span>
                                                <span className="text-sm font-black mt-0.5 text-cyan-400 leading-none">
                                                    {(data?.anchor?.sog !== undefined ? data.anchor.sog : (data?.gps?.sog !== undefined ? data.gps.sog : (data?.gps?.speed ? parseFloat(data.gps.speed) * 1.94384 : 0))).toFixed(1)}<span className="text-[9px] font-bold ml-0.5">kn</span>
                                                </span>
                                                <span className="text-[8.5px] font-bold text-gray-400 mt-1 leading-none">
                                                    {Math.round(data?.environment?.heading !== undefined ? data.environment.heading : (data?.gps?.cog || 0))}°
                                                </span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    // 3. All'Ancora o in Porto (3 Colonne di Sicurezza)
                                    <>
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
                                            <span className="text-[7.5px] font-black uppercase text-gray-400 tracking-wider">
                                                {data?.trip?.anchor_time && data?.trip?.anchor_time !== "0m" ? "Tempo Sosta" : "Precisione"}
                                            </span>
                                            <span className={`text-sm font-black mt-0.5 ${
                                                (data.anchor.status === 'LEARNING' || data.anchor.status === 'SETTLING') ? 'text-orange-400' : 'text-cyan-400'
                                            }`}>
                                                {data?.trip?.anchor_time && data?.trip?.anchor_time !== "0m"
                                                    ? data.trip.anchor_time
                                                    : ((data.anchor.status === 'LEARNING' || data.anchor.status === 'SETTLING')
                                                        ? 'Calcolo...'
                                                        : (data.anchor.std_dev > 0 ? `±${data.anchor.std_dev.toFixed(1)}m` : '±0.0m'))}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* RIGA 3: Informazioni Ambientali, Volvo e Consuntivo Tratta */}
                        <div className="flex justify-between items-center text-[10px] font-bold text-gray-300 font-mono leading-none">
                            {/* Dati Fisici del fondale */}
                            <div className="flex gap-4">
                                {data?.anchor?.depth > 0 && (
                                    <span>Fondale: <span className="text-white font-black">{data.anchor.depth.toFixed(1)}m</span></span>
                                )}
                                {data?.anchor?.chain > 0 && data?.anchor?.status !== 'MOVING' && (
                                    <span>Catena: <span className="text-white font-black">{data.anchor.chain.toFixed(0)}m</span></span>
                                )}
                                {data?.anchor?.status === 'MOVING' && data?.anchor?.radius > 0 && data?.anchor?.chain > 0 && (
                                    <span>Catena Suggerita: <span className="text-white font-black">{data.anchor.chain.toFixed(0)}m</span></span>
                                )}
                            </div>

                            {/* Integrazione Dinamica: Allarmi Volvo Engine o Consuntivo Completo Tratta all'Ancora */}
                            <div className="flex items-center">
                                {data?.anchor?.engine_on ? (
                                    <span className="text-yellow-400 font-black animate-pulse flex items-center gap-1">
                                        ⚡ Volvo: {data.anchor.engine_v?.toFixed(1)}V {data.anchor.status !== 'MOVING' && data.anchor.score > 0 ? `[Salpamento: ${data.anchor.score}/70]` : ''}
                                    </span>
                                ) : data?.anchor?.status !== 'MOVING' && data?.trip?.total_nav_time && data.trip.total_nav_time !== "0m" ? (
                                    <span className="text-gray-300 font-medium">
                                        Tratta: <span className="text-cyan-400 font-black">{data.trip.total_nm || '0 NM'}</span> <span className="text-gray-400 text-[9px]">(🚤 {data.trip.engine_time} - {data.trip.engine_nm} • ⛵ {data.trip.sail_time} - {data.trip.sail_nm})</span>
                                    </span>
                                ) : (
                                    data?.anchor?.status === 'LEARNING' && data?.anchor?.low_conf_reason ? (
                                        <span className="text-orange-400 font-black tracking-tight">Nota: {data.anchor.low_conf_reason}</span>
                                    ) : (
                                        data?.anchor?.status === 'LOCKED' && (
                                            <span className="text-green-400 font-black uppercase">Ottima</span>
                                        )
                                    )
                                )}
                            </div>
                        </div>

                    </div>
                )}

                {/* MAPPA SATELLITARE LEAFLET */}
                <div
                    className={`${isMapFull ? 'map-full-screen' : 'h-64 landscape:h-80 w-[80%] rounded-[2.5rem]'} overflow-hidden border border-white/10 shadow-2xl relative isolate transition-opacity duration-200`}
                >
                    <MapContainer
                        center={coords}
                        zoom={defaultZoom}
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
                        <MapPlugins
                            coords={coords}
                            trail={smoothedTrail}
                            autoFollow={autoFollow}
                            setAutoFollow={setAutoFollow}
                            isMapFull={isMapFull}
                            setIsMapFull={setIsMapFull}
                            defaultZoom={defaultZoom}
                            onZoomChange={setCurrentZoom}
                        />

                        {/* CERCHIO ANTEPRIMA CALATA / GHOST FOOTPRINT */}
                        {data?.anchor?.lat && data?.anchor?.lon && data.anchor.radius > 0 &&
                         data.anchor.status === 'MOVING' && (
                            <Circle
                                center={[data.anchor.lat, data.anchor.lon]}
                                radius={data.anchor.radius}
                                pathOptions={{
                                    color: (data.anchor.description && data.anchor.description.includes("Ristretto")) ? '#f97316' : '#22d3ee',
                                    fillColor: '#22d3ee',
                                    fillOpacity: 0.04,
                                    weight: 1.5,
                                    dashArray: '4, 8',
                                    interactive: false
                                }}
                            />
                        )}

                        {/* CERCHIO DI SICUREZZA PROVVISORIO */}
                        {data?.anchor?.lat && data?.anchor?.lon && data.anchor.radius > 0 &&
                         (data.anchor.status === 'LEARNING' || data.anchor.status === 'SETTLING') && (
                            <Circle
                                center={[data.anchor.lat, data.anchor.lon]}
                                radius={data.anchor.radius}
                                pathOptions={{
                                    color: '#f97316',
                                    fillOpacity: 0,
                                    weight: 1.5,
                                    dashArray: '6, 10',
                                    interactive: false
                                }}
                            />
                        )}

                        {/* CERCHIO DI SICUREZZA DEFINITIVO */}
                        {data?.anchor?.lat && data?.anchor?.lon && data.anchor.radius > 0 &&
                         (data.anchor.status === 'LOCKED' || data.anchor.status === 'DRAGGING' || data.anchor.status === 'DRIFTING') && (
                            <Circle
                                center={[data.anchor.lat, data.anchor.lon]}
                                radius={data.anchor.radius + Math.max(15, data.anchor.radius * 0.30)}
                                pathOptions={{
                                    color: (data.anchor.status === 'DRAGGING' || data.anchor.status === 'DRIFTING') ? '#ef4444' : '#22d3ee',
                                    fillOpacity: 0,
                                    weight: 1.5,
                                    dashArray: '8, 12',
                                    interactive: false
                                }}
                            />
                        )}

                        {/* RANGE RINGS STRATEGICI */}
                        {getDynamicRangeRings(currentZoom).map((ring) => {
                            const labelPos = getWestLabelCoords(rangeRingsCenter, ring.r);

                            return (
                                <React.Fragment key={`ring-${ring.r}`}>
                                    <Circle
                                        center={[rangeRingsCenter.lat, rangeRingsCenter.lon]}
                                        radius={ring.r}
                                        pathOptions={{
                                            color: '#ffffff',
                                            weight: 1.0,
                                            opacity: 0.55,
                                            fillOpacity: 0,
                                            dashArray: '4, 12',
                                            interactive: false
                                        }}
                                    />
                                    <Marker
                                        position={labelPos}
                                        icon={new L.DivIcon({
                                            html: `<div style="font-size: 8px; font-weight: 900; color: rgba(255, 255, 255, 0.90); font-family: monospace; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; white-space: nowrap; text-align: right; width: 100%;">${ring.label}</div>`,
                                            className: 'range-label-marker',
                                            iconSize: [50, 10],
                                            iconAnchor: [53, 5]
                                        })}
                                        interactive={false}
                                    />
                                </React.Fragment>
                            );
                        })}

                        {/* BERSAGLI AIS FILTRATI */}
                        {(data?.environment?.ais_targets || []).map((v) => {
                            const isMoving = v.isMoving !== undefined ? v.isMoving : (!v.isAnchored && v.sog >= 0.3);
                            const vesselColor = getVesselStatusColor(v);

                            return (
                                <React.Fragment key={v.id}>
                                    {v.trail && v.trail.length >= 2 && (
                                        <Polyline
                                            positions={v.trail.map(pt => [pt.lat, pt.lon])}
                                            color="#ffffff"
                                            weight={1.5}
                                            opacity={0.40}
                                            dashArray="2, 6"
                                            interactive={false}
                                        />
                                    )}

                                    {isMoving ? (
                                        <React.Fragment>
                                            <Polyline
                                                positions={[[v.lat, v.lon], getVectorCoords(v.lat, v.lon, v.cog, v.sog)]}
                                                pathOptions={{
                                                    color: vesselColor,
                                                    weight: 3.0,
                                                    opacity: 0.85,
                                                    dashArray: "6, 6"
                                                }}
                                                interactive={false}
                                            />
                                            <Marker
                                                position={[v.lat, v.lon]}
                                                icon={movingVesselIcon(v.cog, vesselColor, currentZoom)}
                                                interactive={false}
                                            />
                                            <Marker
                                                position={[v.lat, v.lon]}
                                                icon={movingVesselLabelIcon(v.name, v.sog, v.cpa, v.tcpa, v.crossDir, v.risk, v.riskMsg, v.age, vesselColor, v.type, currentZoom)}
                                                interactive={false}
                                            />
                                        </React.Fragment>
                                    ) : (
                                        <React.Fragment>
                                            <Marker
                                                position={[v.lat, v.lon]}
                                                icon={stationaryVesselIcon(v.risk)}
                                                interactive={false}
                                            />
                                            <Marker
                                                position={[v.lat, v.lon]}
                                                icon={stationaryVesselLabelIcon(v.name, v.risk, v.riskMsg, v.dist, v.age, v.type, currentZoom)}
                                                interactive={false}
                                            />
                                            {v.risk === "RED" && v.riskMsg === "SOPRA SUA ANCORA!" && v.anchorLat && v.anchorLon && (
                                                <React.Fragment>
                                                    <Circle
                                                        center={[v.anchorLat, v.anchorLon]}
                                                        radius={data?.anchor?.radius || 15}
                                                        pathOptions={{
                                                            color: '#ef4444',
                                                            weight: 1.0,
                                                            opacity: 0.50,
                                                            fillColor: '#ef4444',
                                                            fillOpacity: 0.05,
                                                            dashArray: '6, 12',
                                                            interactive: false
                                                        }}
                                                    />
                                                    <Marker
                                                        position={[v.anchorLat, v.anchorLon]}
                                                        icon={nearbyVesselAnchorIcon}
                                                        zIndexOffset={400}
                                                        interactive={false}
                                                    />
                                                </React.Fragment>
                                            )}
                                        </React.Fragment>
                                    )}
                                </React.Fragment>
                            );
                        })}

                        {/* MARKER POSIZIONE PREVISTA ANCORA */}
                        {data?.anchor?.lat && data?.anchor?.lon &&
                         data.anchor.status !== 'LEARNING' && data.anchor.status !== 'SETTLING' && data.anchor.status !== 'MOVING' && (
                            <Marker
                                position={[data.anchor.lat, data.anchor.lon]}
                                icon={myAnchorMarkerIcon(isMyAnchorThreatened)}
                                zIndexOffset={500}
                            />
                        )}

                        {/* MARKER BARCA */}
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
