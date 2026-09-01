import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Plus, Minus, Target, Navigation2, ChevronDown, AlertTriangle, X, Copy, Check } from 'lucide-react';

// ============================================================
// 1. CONFIGURAZIONE ICONE AIS & BARCA
// ============================================================

const ownBoatAisIcon = (heading, color = '#38bdf8') => new L.DivIcon({
    html: `
        <div style="transform: rotate(${heading || 0}deg); font-size: 22px; color: ${color}; filter: drop-shadow(0 0 5px rgba(0,0,0,0.9)); display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
            ▲
        </div>
    `,
    className: 'own-boat-ais-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
});

const targetMarkerIcon = (vessel, isSelected, zoom = 14) => {
    // Colore MarineTraffic nativo della categoria
    const ship = getShipTypeInfo(vessel.type);
    const color = ship.color;

    // Dimensioni dinamiche calibrate sullo zoom della mappa
    const dotSize = zoom <= 13 ? 6 : zoom === 14 ? 8 : 10;
    const arrowSize = zoom <= 13 ? 12 : zoom === 14 ? 15 : 18;

    const isMoving = vessel.isMoving !== undefined ? vessel.isMoving : (!vessel.isAnchored && vessel.sog >= 0.3);
    const borderStyle = isSelected ? 'border: 2px solid #22d3ee; box-shadow: 0 0 8px #22d3ee;' : 'border: 1px solid rgba(0,0,0,0.85);';

    // Hitbox tattile a 32x32px con grafica scalata per evitare sovrapposizioni a zoom lontano
    if (isMoving) {
        return new L.DivIcon({
            html: `
                <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <span style="transform: rotate(${vessel.cog || 0}deg); font-size: ${arrowSize}px; color: ${color}; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; line-height: 1; display: inline-block;">
                        ▲
                    </span>
                </div>
            `,
            className: 'ais-target-moving',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
    }

    return new L.DivIcon({
        html: `
            <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <div style="width: ${dotSize}px; height: ${dotSize}px; background-color: ${color}; border-radius: 50%; ${borderStyle}"></div>
            </div>
        `,
        className: 'ais-target-stationary',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
};

/** Calcola coordinata di proiezione a 15 minuti */
const getProjectedCoords = (lat, lon, cog, sog, minutes = 15) => {
    const d2r = Math.PI / 180;
    const distanceMeters = sog * 1852 * (minutes / 60);
    const projLat = lat + (distanceMeters * Math.cos(cog * d2r)) / 111139;
    const projLon = lon + (distanceMeters * Math.sin(cog * d2r)) / (111139 * Math.cos(lat * d2r));
    return [projLat, projLon];
};

/** Schema colori e classificazione ufficiale MarineTraffic per tipo nave */
const getShipTypeInfo = (type) => {
    const t = parseInt(type) || 0;
    if (t === 36) return { emoji: "⛵", label: "Vela", color: "#d946ef" }; // Magenta
    if (t === 37) return { emoji: "🛥️", label: "Yacht / Motore", color: "#d946ef" }; // Magenta
    if (t === 30) return { emoji: "🐟", label: "Peschereccio", color: "#ea580c" }; // Arancione
    if (t >= 50 && t <= 59) return { emoji: "👨🏻‍✈️", label: "Pilota / Servizio", color: "#0284c7" }; // Azzurro
    if (t === 31 || t === 32 || t === 52) return { emoji: "🚜", label: "Rimorchiatore", color: "#0284c7" }; // Azzurro
    if (t >= 60 && t <= 69) return { emoji: "⛴️", label: "Passeggeri", color: "#2563eb" }; // Blu Cobalto
    if (t >= 70 && t <= 79) return { emoji: "📦", label: "Cargo", color: "#16a34a" }; // Verde
    if (t >= 80 && t <= 89) return { emoji: "🛢️", label: "Cisterna / Tanker", color: "#dc2626" }; // Rosso Bordeaux
    if (t >= 40 && t <= 49) return { emoji: "🚤", label: "Unità Veloce (HSC)", color: "#eab308" }; // Giallo
    return { emoji: "🚢", label: "Nave", color: "#94a3b8" }; // Grigio Neutro
};

/** Calcola lo smart zoom dinamico in base alla velocità propria di navigazione (SOG) */
const getAisSmartZoom = (sog) => {
    if (sog >= 7.5) return 12; // Altura / Navigazione veloce (panoramica ~10 NM)
    if (sog >= 3.5) return 14; // Crociera a vela/motore (~3-4 NM)
    if (sog >= 1.5) return 15; // Uscita baia / dislocamento (~1.5-2 NM)
    return 17;                 // Ormeggio / manovra stretta (~500m)
};

/** Formattazione duale della distanza (Metri sotto 1 NM, Miglia nautiche sopra 1 NM) */
const formatNavDistance = (meters) => {
    if (meters === undefined || meters === null || isNaN(meters)) return '--';
    const m = Math.round(meters);
    const nm = meters / 1852.0;

    if (m < 500) {
        return `${m} m`;
    } else if (m < 1852) {
        return `${m} m (${nm.toFixed(1)} NM)`;
    } else {
        return `${nm.toFixed(1)} NM (${(m / 1000).toFixed(1)} km)`;
    }
};

/** Versione compatta per lista e badge */
const formatNavDistanceShort = (meters) => {
    if (meters === undefined || meters === null || isNaN(meters)) return '--';
    const m = Math.round(meters);
    if (m < 1852) {
        return `${m}m`;
    }
    return `${(meters / 1852.0).toFixed(1)} NM`;
};

/** Formattazione coordinate nautiche (Gradi e Primi decimali) */
const formatNautic = (val, isLat) => {
    if (val === undefined || val === null || isNaN(val)) return '';
    const hemi = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
    const absVal = Math.abs(val);
    const deg = Math.floor(absVal);
    const min = ((absVal - deg) * 60).toFixed(4);
    return `${deg}° ${min}'${hemi}`;
};

/** Ricava Bandiera e Nazione dalle prime 3 cifre dell'MMSI (Tabella ITU MID Completa) */
const getVesselFlag = (idStr) => {
    if (!idStr) return "";
    const mmsi = String(idStr).split(':').pop();
    if (!mmsi || mmsi.length < 3) return "";
    const mid = parseInt(mmsi.substring(0, 3), 10);

    const midMap = {
        // Mediterraneo & Europa
        247: "🇮🇹 ITA", 237: "🇬🇷 GRC", 239: "🇬🇷 GRC", 240: "🇬🇷 GRC", 241: "🇬🇷 GRC",
        238: "🇭🇷 CRO", 278: "🇸🇮 SLO", 262: "🇲🇪 MNE", 201: "🇦🇱 ALB", 271: "🇹🇷 TUR",
        212: "🇨🇾 CYP", 248: "🇲🇹 MLT", 249: "🇲🇹 MLT", 224: "🇪🇸 ESP", 225: "🇪🇸 ESP",
        226: "🇫🇷 FRA", 227: "🇫🇷 FRA", 228: "🇫🇷 FRA", 254: "🇲🇨 MCO", 255: "🇵🇹 POR",
        263: "🇵🇹 POR", 268: "🇸🇲 SMR", 232: "🇬🇧 GBR", 233: "🇬🇧 GBR", 234: "🇬🇧 GBR",
        235: "🇬🇧 GBR", 236: "🇬🇮 GIB", 250: "🇮🇲 IOM", 269: "🇨🇭 SUI", 203: "🇦🇹 AUT",
        211: "🇩🇪 DEU", 218: "🇩🇪 DEU", 205: "🇧🇪 BEL", 244: "🇳🇱 NLD", 245: "🇳🇱 NLD",
        246: "🇳🇱 NLD", 257: "🇳🇴 NOR", 258: "🇳🇴 NOR", 259: "🇳🇴 NOR", 219: "🇩🇰 DNK",
        220: "🇩🇰 DNK", 265: "🇸🇪 SWE", 266: "🇸🇪 SWE", 230: "🇫🇮 FIN", 261: "🇵🇱 POL",
        272: "🇺🇦 UKR", 273: "🇷🇺 RUS", 264: "🇷🇴 ROU", 207: "🇧🇬 BGR", 253: "🇱🇺 LUX",
        428: "🇮🇱 ISR", 622: "🇪🇬 EGY", 672: "🇹🇳 TUN",
        // Bandiere di Comodità & Internazionali comuni
        319: "🇰🇾 CYM", 308: "🇧🇸 BHS", 309: "🇧🇸 BHS", 311: "🇧🇸 BHS", 378: "🇻🇬 VGB",
        310: "🇧🇲 BMU", 375: "🇻🇨 VCT", 376: "🇻🇨 VCT", 377: "🇻🇨 VCT", 312: "🇧🇿 BLZ",
        304: "🇦🇬 ATG", 305: "🇦🇬 ATG", 351: "🇵🇦 PAN", 352: "🇵🇦 PAN", 353: "🇵🇦 PAN",
        354: "🇵🇦 PAN", 355: "🇵🇦 PAN", 356: "🇵🇦 PAN", 357: "🇵🇦 PAN", 370: "🇵🇦 PAN",
        371: "🇵🇦 PAN", 372: "🇵🇦 PAN", 373: "🇵🇦 PAN", 636: "🇱🇷 LBR", 538: "🇲🇭 MHL",
        518: "🇨🇰 COK", 576: "🇻🇺 VUT", 577: "🇻🇺 VUT", 664: "🇸🇨 SYC", 338: "🇺🇸 USA",
        366: "🇺🇸 USA", 367: "🇺🇸 USA", 368: "🇺🇸 USA", 369: "🇺🇸 USA", 477: "🇭🇰 HKG",
        563: "🇸🇬 SGP", 564: "🇸🇬 SGP", 565: "🇸🇬 SGP", 566: "🇸🇬 SGP", 412: "🇨🇳 CHN",
        413: "🇨🇳 CHN", 414: "🇨🇳 CHN"
    };
    return midMap[mid] || "";
};

/** Formatta la stringa ETA in formato orario leggibile */
const formatEta = (etaStr) => {
    if (!etaStr) return "";
    try {
        const d = new Date(etaStr);
        if (!isNaN(d.getTime())) {
            const day = d.getDate();
            const months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
            const month = months[d.getMonth()];
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${day} ${month}, ${hh}:${mm}`;
        }
    } catch (e) {}
    return etaStr;
};

/** Restituisce i 3 cerchi di distanza dinamici in base allo zoom attuale */
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

/** Calcola la coordinata a Ovest (270°) esatta sul bordo del cerchio per l'etichetta */
const getWestLabelCoords = (center, radius) => {
    const d2r = Math.PI / 180;
    const dLon = -radius / (111139 * Math.cos(center.lat * d2r));
    return [center.lat, center.lon + dLon];
};

/** Micro-Targhetta tattica fluttuante (Dark Glass ad altissima nitidezza per ALLARMI e WARNING) */
const threatVesselLabelIcon = (vessel) => {
    const isRed = vessel.risk === 'RED';
    const color = isRed ? '#ef4444' : '#f97316';
    const ship = getShipTypeInfo(vessel.type);

    const isMoving = vessel.isMoving !== undefined ? vessel.isMoving : (!vessel.isAnchored && vessel.sog >= 0.3);
    // Riga 2 pulita senza duplicazioni di distanza
    const speedLine = isMoving ? `${vessel.sog} kn • ${vessel.cog}°` : 'ALL\'ANCORA';

    let alertLine = '';
    if (isRed) {
        const title = vessel.riskMsg || 'COLLISIONE!';
        const timeTxt = (vessel.tcpa !== null && vessel.tcpa !== undefined && vessel.tcpa >= 0) ? ` in ${Math.round(vessel.tcpa)}m` : '';
        const cpaTxt = vessel.cpa !== null && vessel.cpa !== undefined ? ` • CPA: ${formatNavDistanceShort(vessel.cpa)}` : '';
        alertLine = `🚨 ${title}${cpaTxt}${timeTxt}`;
    } else {
        const timeTxt = (vessel.tcpa !== null && vessel.tcpa !== undefined && vessel.tcpa >= 0) ? ` in ${Math.round(vessel.tcpa)}m` : '';
        const cpaTxt = vessel.cpa !== null && vessel.cpa !== undefined ? `CPA: ${formatNavDistanceShort(vessel.cpa)}` : `Dist: ${formatNavDistanceShort(vessel.dist)}`;
        alertLine = `⚠️ ${cpaTxt}${timeTxt}`;
    }

    return new L.DivIcon({
        html: `
            <div style="
                display: inline-flex;
                flex-direction: row;
                align-items: center;
                gap: 6px;
                background: rgba(15, 23, 42, 0.90);
                backdrop-filter: blur(6px);
                border: 1px solid ${isRed ? 'rgba(239, 68, 68, 0.45)' : 'rgba(249, 115, 22, 0.45)'};
                border-radius: 10px;
                padding: 4px 8px;
                box-shadow: 0 4px 14px rgba(0,0,0,0.55);
                white-space: nowrap;
                font-family: monospace;
                pointer-events: none;
            ">
                <span style="font-size: 18px; line-height: 1;">${ship.emoji}</span>
                <div style="display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2;">
                    <span style="font-size: 13.5px; font-weight: 900; color: ${color}; text-transform: uppercase; letter-spacing: -0.2px;">
                        ${vessel.name || 'Sconosciuto'}
                    </span>
                    <span style="font-size: 10px; font-weight: 700; color: #cbd5e1; margin-top: 1px;">
                        ${speedLine}
                    </span>
                    <span style="font-size: 11px; font-weight: 900; color: ${color}; margin-top: 1px;">
                        ${alertLine}
                    </span>
                </div>
            </div>
        `,
        className: 'ais-threat-floating-label',
        iconSize: [320, 56],
        iconAnchor: [-14, 28] // Posizionata lateralmente al marker
    });
};

// ============================================================
// 2. CONTROLLI MAPPA TATTICA, SMART ZOOM E TELECAMERA
// ============================================================
const AisMapController = ({
    centerCoords,
    hasValidGps,
    autoCenter,
    setAutoCenter,
    smartZoom,
    flyTarget,
    isTargetSelected,
    cameraSnapshotRef,
    restoreSignal,
    onZoomChange,
    onBoundsChange
}) => {
    const map = useMap();
    const isManualZoomOverrideRef = useRef(false);
    const isProgrammaticMoveRef = useRef(false); // Flag anti-conflitto per distinguere i gesti dita dai voli automatici
    const isFirstLoadRef = useRef(true);

    // Aggiorna confini visibili e livello di zoom per ottimizzazione GPU
    const updateViewport = useCallback(() => {
        if (onZoomChange) onZoomChange(map.getZoom());
        if (onBoundsChange) onBoundsChange(map.getBounds().pad(0.15)); // +15% di margine per scorrimento fluido
    }, [map, onZoomChange, onBoundsChange]);

    useMapEvents({
        dragstart: () => {
            // Si disattiva SOLO quando l'utente trascina fisicamente la mappa col dito
            map.stop();
            setAutoCenter(false);
        },
        zoomstart: (e) => {
            // Riconosce il pinch-to-zoom SOLO se originato da un gesto touch/mouse reale
            if (e && e.originalEvent) {
                isManualZoomOverrideRef.current = true;
            }
        },
        zoomend: updateViewport,
        moveend: updateViewport
    });

    useEffect(() => {
        updateViewport();
    }, [updateViewport]);

    // Memoria dell'ultima posizione in cui la mappa è stata centrata
    const lastCenteredPosRef = useRef(null);

    // Inizializzazione istantanea al primo pacchetto GPS e inseguimento a Zona Morta (Dead-Band)
    useEffect(() => {
        if (!autoCenter || centerCoords[0] === 0 || isTargetSelected) return;

        // 1. Primo caricamento: salta alle coordinate GPS solo se non c'è un bersaglio selezionato
        if (isFirstLoadRef.current && hasValidGps && !flyTarget) {
            map.setView(centerCoords, smartZoom, { animate: false });
            lastCenteredPosRef.current = centerCoords;
            isFirstLoadRef.current = false;
            updateViewport();
            return;
        }

        const currentZoom = map.getZoom();

        // 2. Se lo Smart Zoom è cambiato di livello, esegui lo zoom morbido
        if (!isManualZoomOverrideRef.current && currentZoom !== smartZoom) {
            map.flyTo(centerCoords, smartZoom, { duration: 0.8 });
            lastCenteredPosRef.current = centerCoords;
            return;
        }

        // 3. Calcolo Dead-Band: sposta la mappa SOLO se la barca è uscita dalla zona centrale
        if (!lastCenteredPosRef.current) {
            lastCenteredPosRef.current = centerCoords;
        }

        const dLat = (centerCoords[0] - lastCenteredPosRef.current[0]) * 111139;
        const dLon = (centerCoords[1] - lastCenteredPosRef.current[1]) * 111139 * Math.cos(centerCoords[0] * Math.PI / 180);
        const distFromCenter = Math.sqrt(dLat * dLat + dLon * dLon);

        // Soglia di tolleranza: 25m a zoom ravvicinato, 50m a zoom crociera, 120m in altura
        const deadBandThreshold = currentZoom >= 16 ? 25 : currentZoom >= 14 ? 45 : 100;

        if (distFromCenter >= deadBandThreshold) {
            // Scivolamento morbido solo al superamento della zona morta
            map.panTo(centerCoords, { animate: true, duration: 0.8, easeLinearity: 0.25 });
            lastCenteredPosRef.current = centerCoords;
        }
    }, [autoCenter, centerCoords, hasValidGps, smartZoom, isTargetSelected, map, updateViewport]);

    // Spostamento animato diretto, nativo e matematicamente infallibile sul bersaglio
    useEffect(() => {
        if (flyTarget && flyTarget.lat && flyTarget.lon) {
            const targetZ = Math.max(map.getZoom(), 15);
            // Centratura nativa Leaflet priva di errori di proiezione all'avvio
            map.flyTo([parseFloat(flyTarget.lat), parseFloat(flyTarget.lon)], targetZ, { duration: 0.8 });
        }
    }, [flyTarget, map]);

    // Ripristino telecamera alla posizione e zoom precedenti (sia da LISTA che da CHIUDI X)
    useEffect(() => {
        if (restoreSignal && cameraSnapshotRef.current) {
            const snap = cameraSnapshotRef.current;
            map.flyTo(snap.center, snap.zoom, { duration: 0.7 });
            setAutoCenter(snap.autoCenter);
            cameraSnapshotRef.current = null; // Reset memoria post-ripristino
        }
    }, [restoreSignal, cameraSnapshotRef, map, setAutoCenter]);

    const handleManualZoom = (type) => {
        isManualZoomOverrideRef.current = true;
        const currentZ = map.getZoom();
        const nextZ = type === 'in' ? currentZ + 1 : currentZ - 1;
        map.setZoom(nextZ);
        if (onZoomChange) onZoomChange(nextZ);
    };

    return (
        /* Pulsanti Mappa: quota sicura a bottom-48 in verticale per superare Safari, a sinistra in landscape */
        <div className="absolute right-3 bottom-48 landscape:right-auto landscape:left-3 landscape:bottom-auto landscape:top-1/2 landscape:-translate-y-1/2 flex flex-col gap-2.5 z-[1000]">
            <button
                onClick={() => handleManualZoom('in')}
                className="w-11 h-11 landscape:w-10 landscape:h-10 rounded-2xl bg-[#161b22]/90 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white active:scale-95 shadow-2xl"
            >
                <Plus size={20} />
            </button>
            <button
                onClick={() => handleManualZoom('out')}
                className="w-11 h-11 landscape:w-10 landscape:h-10 rounded-2xl bg-[#161b22]/90 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white active:scale-95 shadow-2xl"
            >
                <Minus size={20} />
            </button>
            <button
                onClick={() => {
                    if (!autoCenter) {
                        // 1° Click: Centra la barca e attiva l'inseguimento mantenendo lo zoom corrente
                        isManualZoomOverrideRef.current = true;
                        setAutoCenter(true);
                        map.flyTo(centerCoords, map.getZoom(), { duration: 0.5 });
                    } else {
                        // 2° Click (già centrato): Sblocca e applica lo Smart Zoom dinamico da velocità
                        isManualZoomOverrideRef.current = false;
                        map.flyTo(centerCoords, smartZoom, { duration: 0.6 });
                    }
                }}
                className={`w-11 h-11 landscape:w-10 landscape:h-10 rounded-2xl border transition-all flex items-center justify-center shadow-2xl active:scale-95 ${
                    autoCenter ? 'bg-cyan-500/40 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-[#161b22]/90 border-white/20 text-gray-400'
                }`}
                title={autoCenter ? "Tocca per attivare Smart Zoom dinamico" : "Tocca per centrare sulla barca"}
            >
                <Target size={20} />
            </button>
        </div>
    );
};
// ============================================================
// 3. VISTA AIS PRINCIPALE
// ============================================================
// Recupero dell'ultimo punto GPS reale memorizzato per evitare il fallback fisso
const getLastKnownGps = () => {
    try {
        const saved = localStorage.getItem('rotevista_last_known_gps');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.lat && parsed.lon) return [parseFloat(parsed.lat), parseFloat(parsed.lon)];
        }
    } catch (e) {}
    return [37.96, 23.48];
};

const AisView = ({ manager, isNightMode = false, initialMmsi = null }) => {
    const { data } = manager;
    const [autoCenter, setAutoCenter] = useState(true);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [isListOpen, setIsListOpen] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(14);
    const [mapBounds, setMapBounds] = useState(null); // Confini visibili dello schermo
    const [isMmsiCopied, setIsMmsiCopied] = useState(false); // Feedback copia MMSI
    const [isGpsCopied, setIsGpsCopied] = useState(false); // Feedback copia Coordinate GPS proprie
    const [isRegistryView, setIsRegistryView] = useState(false); // Toggle tra vista Tattica e Registro Nave

    // Salva l'ultimo punto GPS valido in memoria locale a ogni ricezione dati
    useEffect(() => {
        if (data?.gps?.lat && data?.gps?.lon) {
            localStorage.setItem('rotevista_last_known_gps', JSON.stringify({
                lat: data.gps.lat,
                lon: data.gps.lon
            }));
        }
    }, [data?.gps?.lat, data?.gps?.lon]);

    /** Funzione universale di copia sicura anti-scroll per iOS Safari */
    const copyToClipboardSafe = (text, onSuccess) => {
        if (!text) return;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                if (onSuccess) onSuccess();
            }).catch(() => {});
            return;
        }

        // Fallback blindato per HTTP su iOS: readonly + coordinate fuori schermo = ZERO SCROLL
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        textArea.style.top = `${window.pageYOffset || document.documentElement.scrollTop || 0}px`;
        textArea.style.fontSize = "12pt";
        textArea.style.opacity = "0";

        document.body.appendChild(textArea);
        textArea.select();
        textArea.setSelectionRange(0, 99999);

        try {
            document.execCommand('copy');
            if (onSuccess) onSuccess();
        } catch (e) {
            console.error("Copia fallita", e);
        }

        document.body.removeChild(textArea);
    };

    /** Copia coordinate GPS proprie */
    const handleCopyGps = (latVal, lonVal) => {
        const textToCopy = `${formatNautic(latVal, true)} ${formatNautic(lonVal, false)}`;
        copyToClipboardSafe(textToCopy, () => {
            setIsGpsCopied(true);
            setTimeout(() => setIsGpsCopied(false), 2000);
        });
    };

    /** Copia MMSI nave */
    const handleCopyMmsi = (mmsiNumber) => {
        copyToClipboardSafe(mmsiNumber, () => {
            setIsMmsiCopied(true);
            setTimeout(() => setIsMmsiCopied(false), 2000);
        });
    };

    // Memoria sincrona dello stato della mappa precedente all'ispezione
    const cameraSnapshotRef = useRef(null);
    const hasHandledDeepLinkRef = useRef(false);
    const [restoreSignal, setRestoreSignal] = useState(0);
    const [flyTarget, setFlyTarget] = useState(null); // Bersaglio da inquadrare con animazione

    const hasValidGps = !!(data?.gps?.lat && data?.gps?.lon);
    const lastSavedGps = useMemo(() => getLastKnownGps(), []);
    const lat = parseFloat(data?.gps?.lat) || lastSavedGps[0];
    const lon = parseFloat(data?.gps?.lon) || lastSavedGps[1];
    const ownCoords = useMemo(() => [lat, lon], [lat, lon]);
    const heading = data?.environment?.heading || data?.gps?.cog || 0;
    const ownSog = data?.anchor?.sog !== undefined ? data.anchor.sog : (data?.gps?.sog || 0);

    // Smart Zoom tattico ricalcolato sulla velocità propria
    const smartZoom = useMemo(() => getAisSmartZoom(ownSog), [ownSog]);

    // --- 1. ORDINAMENTO BERSAGLI PER PERICOLOSITÀ (Dichiarato prima per evitare ReferenceError) ---
    const sortedTargets = useMemo(() => {
        const raw = data?.environment?.ais_targets || [];
        return [...raw].sort((a, b) => {
            const riskWeight = { RED: 3, ORANGE: 2, GREY: 1 };
            const weightA = riskWeight[a.risk] || 1;
            const weightB = riskWeight[b.risk] || 1;

            if (weightA !== weightB) return weightB - weightA;

            const distA = (a.cpa !== null && a.cpa !== undefined && a.cpa >= 0) ? a.cpa : a.dist;
            const distB = (b.cpa !== null && b.cpa !== undefined && b.cpa >= 0) ? b.cpa : b.dist;
            return distA - distB;
        });
    }, [data?.environment?.ais_targets]);

    // Viewport Culling: filtra solo i bersagli visibili a schermo per alleggerire la GPU
    const visibleMapTargets = useMemo(() => {
        if (!mapBounds) return sortedTargets;
        return sortedTargets.filter(v => {
            if (v.risk === 'RED' || selectedTarget?.id === v.id) return true;
            return mapBounds.contains([v.lat, v.lon]);
        });
    }, [sortedTargets, mapBounds, selectedTarget]);

    // Oggetto Barca Propria per la scheda telemetria
    const ownShipTarget = useMemo(() => ({
        id: 'self',
        name: 'ROTEVISTA',
        isOwnShip: true,
        lat: ownCoords[0],
        lon: ownCoords[1],
        sog: ownSog,
        cog: heading
    }), [ownCoords, ownSog, heading]);

    // Bersaglio Attivo con AGGIORNAMENTO LIVE DEI DATI (Sincronizzato in tempo reale a ogni polling)
    const activeTarget = useMemo(() => {
        if (!selectedTarget) return null;
        if (selectedTarget.isOwnShip) return ownShipTarget;
        const liveMatch = sortedTargets.find(t => t.id === selectedTarget.id);
        return liveMatch || selectedTarget;
    }, [selectedTarget, sortedTargets, ownShipTarget]);

    /** Centro degli anelli: Bersaglio AIS selezionato (live) oppure la propria Barca */
    const rangeRingsCenter = useMemo(() => {
        if (activeTarget && !activeTarget.isOwnShip && activeTarget.lat && activeTarget.lon) {
            return { lat: activeTarget.lat, lon: activeTarget.lon };
        }
        return { lat: ownCoords[0], lon: ownCoords[1] };
    }, [activeTarget, ownCoords]);

    // --- SEGMENTAZIONE SCIA BARCA PROPRIA (Solo Vela e Motore, esclude le tracce di fonda) ---
    const ownTrailSegments = useMemo(() => {
        const rawHistory = data?.environment?.gps_history || [];
        const isEngineOn = data?.anchor?.engine_on || false;
        const currentMode = isEngineOn ? "engine" : "sail";
        
        // Filtra ed elimina tutti i punti di stazionamento all'ancora
        const navPoints = rawHistory.filter(pt => pt.m !== "anchor");
        
        // Se la barca è in navigazione attiva, collega il punto live attuale
        if (data?.anchor?.status === 'MOVING') {
            navPoints.push({ lat: ownCoords[0], lon: ownCoords[1], m: currentMode });
        }

        if (navPoints.length < 2) return [];

        const segments = [];
        let curPositions = [[parseFloat(navPoints[0].lat), parseFloat(navPoints[0].lon)]];
        let curMode = navPoints[0].m || "sail";

        for (let i = 1; i < navPoints.length; i++) {
            const pt = navPoints[i];
            const ptLat = parseFloat(pt.lat);
            const ptLon = parseFloat(pt.lon);
            const mode = pt.m || "sail";

            if (mode === curMode) {
                curPositions.push([ptLat, ptLon]);
            } else {
                curPositions.push([ptLat, ptLon]);
                const color = curMode === "engine" ? "#f97316" : (isNightMode ? "#38bdf8" : "#0284c7");
                segments.push({ positions: curPositions, color, weight: 2.2, opacity: 0.85 });
                curPositions = [[ptLat, ptLon]];
                curMode = mode;
            }
        }

        if (curPositions.length >= 2) {
            const color = curMode === "engine" ? "#f97316" : (isNightMode ? "#38bdf8" : "#0284c7");
            segments.push({ positions: curPositions, color, weight: 2.2, opacity: 0.85 });
        }

        return segments;
    }, [data?.environment?.gps_history, data?.anchor?.engine_on, data?.anchor?.status, ownCoords, isNightMode]);

    /** 1. Selezione da LISTA: preserva la vista corrente (Tattica o Registro) durante l'esplorazione */
    const handleSelectFromList = (vessel) => {
        if (!cameraSnapshotRef.current) {
            cameraSnapshotRef.current = {
                center: ownCoords,
                zoom: 14,
                autoCenter: autoCenter
            };
        }
        setSelectedTarget(vessel);
        setFlyTarget(vessel);
        setAutoCenter(false);
    };

    /** 2. Selezione diretta da MAPPA: preserva la vista corrente durante l'esplorazione */
    const handleSelectFromMap = (vessel) => {
        setSelectedTarget(vessel);
        setFlyTarget(null); // Nessuna animazione telecamera
    };

    /** Ritorno alla lista con ripristino telecamera */
    const handleBackToList = () => {
        setSelectedTarget(null);
        setIsListOpen(true); // Forza la visualizzazione della lista bersagli
        setFlyTarget(null);
        if (cameraSnapshotRef.current) {
            setRestoreSignal(prev => prev + 1);
        }
    };

    /** Chiusura totale (Tasto X): chiude tutto e resetta la modalità alla Tattica di default */
    const handleCloseAll = () => {
        setSelectedTarget(null);
        setIsRegistryView(false); // Reset alla modalità Tattica di default per la prossima consultazione
        setFlyTarget(null);
        setIsListOpen(false);
        if (cameraSnapshotRef.current) {
            setRestoreSignal(prev => prev + 1);
        }
    };

    // Gestione Deep Link Telegram: aggancia e inquadra la nave all'arrivo dei dati
    useEffect(() => {
        if (!initialMmsi || hasHandledDeepLinkRef.current || sortedTargets.length === 0) return;

        const cleanMmsi = String(initialMmsi).trim();
        const target = sortedTargets.find(t => {
            const targetMmsi = String(t.id || '').split(':').pop();
            return targetMmsi === cleanMmsi || String(t.id).includes(cleanMmsi);
        });

        if (target && target.lat && target.lon) {
            hasHandledDeepLinkRef.current = true;
            setAutoCenter(false);
            setIsRegistryView(false); // Forza sempre la visuale Tattica anticollisione per gli alert Telegram
            setSelectedTarget(target);
            setFlyTarget(target); // Salto nativo sicuro sul bersaglio

            // Pulisce l'URL senza ricaricare la pagina per evitare ri-centramenti al refresh
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('mmsi');
            window.history.replaceState({}, '', cleanUrl.toString());
        }
    }, [initialMmsi, sortedTargets]);

    return (
        <div className="relative w-full h-full overflow-hidden bg-[#0d1117] text-white">
            
            {/* MAPPA CARTOGRAFICA A TUTTO SCHERMO CON RENDERING CANVAS GPU */}
            <div className="absolute inset-0 z-0">
                <MapContainer
                    center={ownCoords}
                    zoom={14}
                    maxZoom={20}
                    preferCanvas={true} // Sposta il rendering di linee e cerchi su Canvas WebGL/GPU
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                    attributionControl={false}
                >
                    {/* Layer Cartografico ESRI Dinamico (Light Gray di Giorno / Dark Gray di Notte) */}
                    <TileLayer
                        key={isNightMode ? 'esri-dark' : 'esri-light'}
                        url={
                            isNightMode
                                ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
                                : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
                        }
                        maxZoom={20}
                        maxNativeZoom={16}
                    />

                    {/* Layer Segnalamenti Marittimi OpenSeaMap (Fari, Boe, Mede) */}
                    <TileLayer
                        url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
                        maxZoom={18}
                        opacity={isNightMode ? 0.85 : 0.75}
                    />

                    {/* SCIA DI NAVIGAZIONE PROPRIA (Vela: Ciano, Motore: Arancione) */}
                    {ownTrailSegments.map((seg, idx) => (
                        <Polyline
                            key={`own-nav-trail-${idx}`}
                            positions={seg.positions}
                            color={seg.color}
                            weight={seg.weight}
                            opacity={seg.opacity}
                            lineCap="round"
                            lineJoin="round"
                            interactive={false}
                        />
                    ))}

                    <AisMapController
                        centerCoords={ownCoords}
                        hasValidGps={hasValidGps}
                        autoCenter={autoCenter}
                        setAutoCenter={setAutoCenter}
                        smartZoom={smartZoom}
                        flyTarget={flyTarget}
                        isTargetSelected={!!selectedTarget}
                        cameraSnapshotRef={cameraSnapshotRef}
                        restoreSignal={restoreSignal}
                        onZoomChange={setCurrentZoom}
                        onBoundsChange={setMapBounds}
                    />

                    {/* RANGE RINGS DINAMICI DA ZOOM AD ALTO CONTRASTO (Blu scuro di Giorno / Ciano di Notte) */}
                    {getDynamicRangeRings(currentZoom).map((ring) => {
                        const labelPos = getWestLabelCoords(rangeRingsCenter, ring.r);
                        const isTargetActive = !!selectedTarget;

                        // Colori differenziati per massima leggibilità sia sotto il sole che di notte
                        const ringColor = isTargetActive
                            ? '#06b6d4' // Ciano forte su bersaglio
                            : isNightMode
                            ? '#38bdf8' // Ciano su mappa scura
                            : '#0369a1'; // Blu marino scuro profondo su mappa chiara

                        const textColor = isTargetActive
                            ? '#0891b2'
                            : isNightMode
                            ? '#ffffff'
                            : '#0f172a'; // Nero grafite per staccare su terra e mare

                        const textShadow = isNightMode
                            ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                            : '-1px -1px 0 rgba(255,255,255,0.9), 1px -1px 0 rgba(255,255,255,0.9), -1px 1px 0 rgba(255,255,255,0.9), 1px 1px 0 rgba(255,255,255,0.9)';

                        return (
                            <React.Fragment key={`ais-ring-${ring.r}`}>
                                <Circle
                                    center={[rangeRingsCenter.lat, rangeRingsCenter.lon]}
                                    radius={ring.r}
                                    pathOptions={{
                                        color: ringColor,
                                        weight: isTargetActive ? 1.8 : 1.4,
                                        opacity: isNightMode ? 0.65 : 0.80,
                                        fillOpacity: 0,
                                        dashArray: isTargetActive ? '6, 6' : '5, 8',
                                        interactive: false
                                    }}
                                />
                                <Marker
                                    position={labelPos}
                                    icon={new L.DivIcon({
                                        html: `<div style="font-size: 9px; font-weight: 900; color: ${textColor}; font-family: monospace; text-shadow: ${textShadow}; white-space: nowrap; text-align: right; width: 100%;">${ring.label}</div>`,
                                        className: 'range-label-marker',
                                        iconSize: [50, 10],
                                        iconAnchor: [53, 5]
                                    })}
                                    interactive={false}
                                />
                            </React.Fragment>
                        );
                    })}

                    {/* BERSAGLI AIS CON OTTIMIZZAZIONE LOD, VIEWPORT CULLING E Z-INDEX DI PROFONDITÀ */}
                    {visibleMapTargets.map((v) => {
                        const isMoving = v.isMoving !== undefined ? v.isMoving : (!v.isAnchored && v.sog >= 0.3);
                        const isSelected = selectedTarget?.id === v.id;
                        const ship = getShipTypeInfo(v.type);
                        const vesselColor = ship.color;

                        const isRedAlert = v.risk === 'RED';
                        const isOrangeWarn = v.risk === 'ORANGE';

                        // LOD Tattico: disegna scia e vettore solo per bersagli vicini (<3 NM) o in allarme
                        const shouldRenderTrail = v.trail && v.trail.length >= 2 && (isRedAlert || isOrangeWarn || isSelected || v.dist <= 3704);
                        const shouldRenderVector = isMoving && (isRedAlert || isOrangeWarn || isSelected || v.dist <= 5556);

                        // Calcolo Z-Index: pericoli in cima + barca più vicina sempre sopra quelle lontane
                        const distDepthBonus = Math.max(0, 3000 - Math.round(v.dist || 0));
                        const basePriority = isRedAlert ? 10000 : isSelected ? 8000 : isOrangeWarn ? 5000 : 1000;
                        const finalZIndex = basePriority + distDepthBonus;

                        return (
                            <React.Fragment key={v.id}>
                                {/* Scia Storica */}
                                {shouldRenderTrail && (
                                    <Polyline
                                        positions={v.trail.map(pt => [pt.lat, pt.lon])}
                                        color={vesselColor}
                                        weight={isSelected ? 2 : 1.2}
                                        opacity={0.50}
                                        dashArray="3, 5"
                                        interactive={false}
                                    />
                                )}

                                {/* Vettore di prua a 15 min */}
                                {shouldRenderVector && (
                                    <Polyline
                                        positions={[[v.lat, v.lon], getProjectedCoords(v.lat, v.lon, v.cog, v.sog, 15)]}
                                        color={vesselColor}
                                        weight={isSelected ? 3 : 2}
                                        opacity={0.85}
                                        dashArray="6, 6"
                                        interactive={false}
                                    />
                                )}

                                {/* 🔴 Cerchio Allarme Rosso */}
                                {isRedAlert && (
                                    <Circle
                                        center={[v.lat, v.lon]}
                                        radius={Math.max(100, (v.sog || 1) * 45)}
                                        pathOptions={{
                                            color: '#ef4444',
                                            weight: 2.5,
                                            fillColor: '#ef4444',
                                            fillOpacity: 0.15,
                                            dashArray: '5, 5',
                                            interactive: false
                                        }}
                                    />
                                )}

                                {/* 🟠 Cerchio Warning Arancione */}
                                {!isRedAlert && isOrangeWarn && (
                                    <Circle
                                        center={[v.lat, v.lon]}
                                        radius={Math.max(70, (v.sog || 1) * 35)}
                                        pathOptions={{
                                            color: '#f97316',
                                            weight: 2,
                                            fillColor: '#f97316',
                                            fillOpacity: 0.10,
                                            dashArray: '6, 6',
                                            interactive: false
                                        }}
                                    />
                                )}

                                {/* 🩵 Cerchio Focus/Selezione */}
                                {isSelected && (
                                    <Circle
                                        center={[v.lat, v.lon]}
                                        radius={Math.max(80, (v.sog || 1) * 35)}
                                        pathOptions={{
                                            color: '#22d3ee',
                                            weight: 2.2,
                                            fillColor: '#22d3ee',
                                            fillOpacity: 0.18,
                                            dashArray: '3, 5',
                                            interactive: false
                                        }}
                                    />
                                )}

                                {/* Marker Bersaglio */}
                                <Marker
                                    position={[v.lat, v.lon]}
                                    icon={targetMarkerIcon(v, isSelected, currentZoom)}
                                    zIndexOffset={finalZIndex}
                                    eventHandlers={{
                                        click: () => handleSelectFromMap(v)
                                    }}
                                />

                                {/* Etichetta Tattica Fluttuante (Solo Allarmi Rossi, Warning Arancioni o Bersaglio Selezionato) */}
                                {(isRedAlert || isOrangeWarn || isSelected) && (
                                    <Marker
                                        position={[v.lat, v.lon]}
                                        icon={threatVesselLabelIcon(v)}
                                        zIndexOffset={finalZIndex + 100}
                                        interactive={false}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}

                    {/* VETTORE DI ROTTA PROPRIO DISTINTIVO (Spessore 2.2px, tratteggio arioso 12, 8, 3, 8) */}
                    {ownSog >= 0.5 && data?.anchor?.status === 'MOVING' && (() => {
                        const ownColor = data?.anchor?.engine_on ? '#f97316' : (isNightMode ? '#38bdf8' : '#0284c7');
                        const projCoords = getProjectedCoords(ownCoords[0], ownCoords[1], heading, ownSog, 15);
                        return (
                            <Polyline
                                positions={[ownCoords, projCoords]}
                                color={ownColor}
                                weight={2.2}
                                opacity={0.90}
                                dashArray="12, 8, 3, 8"
                                lineCap="round"
                                lineJoin="round"
                                interactive={false}
                            />
                        );
                    })()}

                    {/* PROPRIA BARCA (Clickabile per aprire scheda telemetria e viaggio) */}
                    <Marker
                        position={ownCoords}
                        icon={ownBoatAisIcon(heading, data?.anchor?.engine_on ? '#f97316' : (isNightMode ? '#38bdf8' : '#0284c7'))}
                        zIndexOffset={1000}
                        eventHandlers={{
                            click: () => handleSelectFromMap(ownShipTarget)
                        }}
                    />
                </MapContainer>
            </div>

            {/* 1. PILLOLA MINIMAL IN ALTO A DESTRA (Distanziata con respiro sotto l'header) */}
            {!isListOpen && !selectedTarget && (
                <div className="absolute top-3 right-3 z-[1001]">
                    <button
                        onClick={() => setIsListOpen(true)}
                        className="flex items-center gap-2 bg-[#161b22]/90 backdrop-blur-xl border border-white/20 px-3.5 py-2 rounded-2xl shadow-xl active:scale-95 transition-all text-white"
                    >
                        <Navigation2 size={15} className="text-cyan-400" />
                        <span className="text-xs font-black font-mono tracking-wider">{sortedTargets.length}</span>
                        {sortedTargets.some(t => t.risk === 'RED') && (
                            <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md animate-pulse">
                                🚨
                            </span>
                        )}
                        <ChevronDown size={16} className="text-gray-400" />
                    </button>
                </div>
            )}

            {/* 2. PANNELLO SUPERIORE COMPATTO (Bloccato rigidamente prima della navbar in landscape) */}
            {(isListOpen || selectedTarget) && (
                <div
                    /* Blocca la propagazione di gesture touch e swipe al contenitore tab principale */
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onTouchStartCapture={(e) => e.stopPropagation()}
                    className={`absolute top-3 right-3 w-[320px] max-w-[88vw] z-[1001] bg-[#161b22]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden isolate ${
                        selectedTarget
                            ? 'h-auto max-h-[50vh] landscape:max-h-[calc(100vh-5.5rem)]'
                            : 'h-[40vh] max-h-[40vh] landscape:h-[calc(100vh-5.5rem)] landscape:max-h-[calc(100vh-5.5rem)]'
                    }`}
                >
                    
                    {/* SCENARIO A: SCHEDA DETTAGLIO BERSAGLIO O SCHEDA BARCA PROPRIA (DATI LIVE) */}
                    {activeTarget ? (() => {
                        // 1. SCHEDA TELEMETRIA E VIAGGIO BARCA PROPRIA (ROTEVISTA)
                        if (activeTarget.isOwnShip) {
                            const engineNmVal = parseFloat(data?.trip?.engine_nm) || 0;
                            const sailNmVal = parseFloat(data?.trip?.sail_nm) || 0;
                            const totalNmVal = engineNmVal + sailNmVal;
                            const enginePct = totalNmVal > 0 ? Math.round((engineNmVal / totalNmVal) * 100) : 0;
                            const sailPct = totalNmVal > 0 ? Math.round((sailNmVal / totalNmVal) * 100) : 0;
                            const depthVal = data?.anchor?.depth || data?.environment?.depth || 0;

                            return (
                                <div className="flex flex-col p-3 font-mono gap-2 overflow-y-auto">
                                    {/* Header Barca Propria */}
                                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                        <button
                                            onClick={handleBackToList}
                                            className="flex items-center gap-1 text-[11px] font-black text-cyan-400 hover:text-cyan-300 active:scale-95 transition-transform shrink-0"
                                        >
                                            <span>←</span> LISTA
                                        </button>
                                        <div className="text-center truncate px-2">
                                            <h4 className="text-sm font-black uppercase text-cyan-400 truncate tracking-tight">⛵ ROTEVISTA</h4>
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCopyGps(ownCoords[0], ownCoords[1]);
                                                }}
                                                className={`text-[8.5px] uppercase block tracking-tight mt-0.5 cursor-pointer font-mono font-bold transition-colors ${
                                                    isGpsCopied ? 'text-green-400 animate-pulse' : 'text-gray-400 hover:text-white'
                                                }`}
                                                title="Tocca per copiare le coordinate GPS"
                                            >
                                                {isGpsCopied ? '✓ Coordinate Copiate!' : `${formatNautic(ownCoords[0], true)} ${formatNautic(ownCoords[1], false)}`}
                                            </span>
                                        </div>
                                        <button onClick={handleCloseAll} className="text-gray-400 hover:text-white p-1 shrink-0">
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* Griglia Telemetria Live Barca */}
                                    <div className="grid grid-cols-4 gap-1 text-[10px] shrink-0 text-center">
                                        <div className="bg-white/5 p-1.5 rounded-xl">
                                            <span className="text-[7.5px] text-gray-400 uppercase block">SOG</span>
                                            <span className="font-bold text-cyan-400 text-xs">{ownSog.toFixed(1)}k</span>
                                        </div>
                                        <div className="bg-white/5 p-1.5 rounded-xl">
                                            <span className="text-[7.5px] text-gray-400 uppercase block">Prua</span>
                                            <span className="font-bold text-white text-xs">{Math.round(heading)}°</span>
                                        </div>
                                        <div className="bg-white/5 p-1.5 rounded-xl">
                                            <span className="text-[7.5px] text-gray-400 uppercase block">Fondo</span>
                                            <span className="font-bold text-white text-xs">{depthVal > 0 ? `${depthVal.toFixed(1)}m` : '--'}</span>
                                        </div>
                                        <div className="bg-white/5 p-1.5 rounded-xl">
                                            <span className="text-[7.5px] text-gray-400 uppercase block">Volvo</span>
                                            <span className={`font-bold text-xs ${data?.anchor?.engine_on ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>
                                                {data?.anchor?.engine_on ? 'ON' : 'OFF'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tabella Tratta e Rendimento (data.trip) - Allineata su 4 colonne */}
                                    <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col gap-1 text-[10px]">
                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest border-b border-white/5 pb-1">
                                            Statistiche Tratta
                                        </span>
                                        
                                        {/* Riga Vela */}
                                        <div className="grid grid-cols-[52px_44px_1fr_auto] items-center text-[9.5px] leading-none gap-1 py-0.5">
                                            <span className="text-cyan-400 font-bold">⛵ Vela</span>
                                            <span className="text-white font-medium">{data?.trip?.sail_time || '0m'}</span>
                                            <span className="text-cyan-400 font-bold truncate">
                                                {data?.trip?.sail_nm || '0.00 NM'} <span className="text-gray-300 font-bold text-[8.5px]">({sailPct}%)</span>
                                            </span>
                                            <span className="text-right font-mono text-[9px] whitespace-nowrap">
                                                {data?.trip?.sail_max_kn && data.trip.sail_max_kn !== "--" ? (
                                                    <span className="text-gray-400">
                                                        <strong className="text-cyan-300 font-bold">Ø {data.trip.sail_avg_kn?.replace(' kn', '') || '--'}</strong>
                                                        <span className="mx-1">•</span>
                                                        ▲ <strong className="text-cyan-300 font-bold">{data.trip.sail_max_kn}</strong>
                                                    </span>
                                                ) : (
                                                    <strong className="text-cyan-300 font-bold">Ø {data?.trip?.sail_avg_kn || '--'}</strong>
                                                )}
                                            </span>
                                        </div>

                                        {/* Riga Motore */}
                                        <div className="grid grid-cols-[58px_44px_1fr_auto] items-center text-[9.5px] leading-none gap-1 py-0.5">
                                            <span className="text-yellow-400 font-bold">🚤 Motore</span>
                                            <span className="text-white font-medium">{data?.trip?.engine_time || '0m'}</span>
                                            <span className="text-yellow-400 font-bold truncate">
                                                {data?.trip?.engine_nm || '0.00 NM'} <span className="text-gray-300 font-bold text-[8.5px]">({enginePct}%)</span>
                                            </span>
                                            <span className="text-right font-mono text-[9px] text-gray-400 whitespace-nowrap">
                                                <span className="text-yellow-300 font-bold">Ø {data?.trip?.engine_avg_kn || '--'}</span>
                                            </span>
                                        </div>

                                        {/* Riga Totale */}
                                        <div className="grid grid-cols-[58px_44px_1fr_auto] items-center text-[9.5px] leading-none gap-1 border-t border-white/5 pt-1.5 mt-0.5">
                                            <span className="text-gray-400 font-bold">⏱️ Totale</span>
                                            <span className="text-gray-200 font-medium">{data?.trip?.total_nav_time || '0m'}</span>
                                            <span className="text-white font-black truncate">
                                                {data?.trip?.total_nm || '0.00 NM'}
                                            </span>
                                            <span className="text-right font-mono text-[9px] text-gray-300 whitespace-nowrap">
                                                <span className="text-white font-bold">Ø {data?.trip?.total_avg_kn || '--'}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // 2. SCHEDA DETTAGLIO BERSAGLIO AIS NORMALE (CON DATI AGGIORNATI IN TEMPO REALE)
                        const ship = getShipTypeInfo(activeTarget.type);
                        const ageTxt = activeTarget.age !== undefined
                            ? (activeTarget.age < 60 ? `${activeTarget.age}s fa` : `${Math.round(activeTarget.age / 60)}m fa`)
                            : '';

                        return (
                            <div className="flex flex-col p-3 font-mono gap-2 overflow-y-auto">
                                {/* Header: Riorganizzato su 2 righe a tutta larghezza con padding conforme alle curve */}
                                <div className="flex flex-col border-b border-white/10 pb-2 px-1 pt-0.5 shrink-0 gap-1">
                                    {/* Riga 1: Tasto Indietro, Nome Nave + Icona Flip e Tasto Chiudi */}
                                    <div className="flex items-center justify-between">
                                        <button
                                            onClick={handleBackToList}
                                            className="flex items-center gap-1 text-[11px] font-black text-cyan-400 hover:text-cyan-300 active:scale-95 transition-transform shrink-0 px-1 py-0.5"
                                        >
                                            <span>←</span> LISTA
                                        </button>

                                        {/* Titolo Centrale Cliccabile a Piena Area (Emoji + Nome + Icona insieme) */}
                                        <div
                                            onClick={() => setIsRegistryView(prev => !prev)}
                                            className="flex items-center justify-center gap-1.5 truncate px-2 py-1 rounded-xl cursor-pointer hover:bg-white/5 active:scale-95 transition-all select-none"
                                            title="Tocca per cambiare vista (Tattica / Registro)"
                                        >
                                            <span className="text-base shrink-0">{ship.emoji}</span>
                                            <h4 className="text-sm font-black uppercase text-white truncate tracking-tight">
                                                {activeTarget.name || 'Sconosciuto'}
                                            </h4>
                                            
                                            {/* Badge Icona Visivo (Interagisce con il tocco dell'intero titolo) */}
                                            <div
                                                className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                                                    isRegistryView
                                                        ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                                                        : 'bg-white/10 border-white/15 text-gray-300'
                                                }`}
                                            >
                                                {isRegistryView ? (
                                                    <Navigation2 size={12} className="rotate-45 text-cyan-300" />
                                                ) : (
                                                    <span className="text-[11px] font-serif font-black leading-none">i</span>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleCloseAll}
                                            className="text-gray-400 hover:text-white p-1 shrink-0 rounded-lg active:scale-95 transition-transform"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* Riga 2: Tipo Nave, MMSI cliccabile e Orologio Segnale con icona */}
                                    <div className="flex items-center justify-center gap-1.5 text-[9.5px] font-bold text-gray-300 uppercase tracking-tight">
                                        <span>{ship.label}</span>
                                        <span className="text-gray-600">•</span>
                                        {activeTarget.id?.includes('mmsi:') ? (
                                            <button
                                                onClick={() => handleCopyMmsi(activeTarget.id.split(':').pop())}
                                                className={`flex items-center gap-1 cursor-pointer active:scale-95 transition-all px-1.5 py-0.5 rounded-md border ${
                                                    isMmsiCopied
                                                        ? 'text-green-400 bg-green-500/15 border-green-500/30'
                                                        : 'text-cyan-400 hover:text-cyan-300 bg-white/5 border-white/10'
                                                }`}
                                                title="Tocca per copiare l'MMSI negli appunti"
                                            >
                                                {isMmsiCopied ? (
                                                    <>
                                                        <Check size={11} className="shrink-0 text-green-400" />
                                                        <span className="text-[9px]">Copiato!</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy size={9} className="shrink-0 opacity-80" />
                                                        <span>MMSI {activeTarget.id.split(':').pop()}</span>
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <span className="text-gray-400">MMSI: --</span>
                                        )}
                                        {ageTxt && (
                                            <>
                                                <span className="text-gray-600">•</span>
                                                <span className="text-gray-400 flex items-center gap-0.5">
                                                    ⏱️ {ageTxt}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* CONTENUTO VARIABILE: VISTA TATTICA (Default) oppure VISTA REGISTRO (Flip Placeholder) */}
                                {!isRegistryView ? (
                                    <>
                                        {/* Griglia Metriche Live (SOG, Distanza, CPA e TCPA) */}
                                        <div className="grid grid-cols-2 gap-1.5 text-[10px] shrink-0">
                                            <div className="bg-white/5 p-2 rounded-xl">
                                                <span className="text-[7.5px] text-gray-400 uppercase block">SOG / COG</span>
                                                <span className="font-bold text-white text-xs">{activeTarget.sog} kn @ {activeTarget.cog}°</span>
                                            </div>
                                            <div className="bg-white/5 p-2 rounded-xl">
                                                <span className="text-[7.5px] text-gray-400 uppercase block">Distanza</span>
                                                <span className="font-bold text-white text-xs truncate" title={formatNavDistance(activeTarget.dist)}>
                                                    {formatNavDistance(activeTarget.dist)}
                                                </span>
                                            </div>
                                            <div className="bg-white/5 p-2 rounded-xl">
                                                <span className="text-[7.5px] text-gray-400 uppercase block">CPA Minimo</span>
                                                <span className="font-bold text-cyan-400 text-xs truncate" title={formatNavDistance(activeTarget.cpa)}>
                                                    {formatNavDistance(activeTarget.cpa)}
                                                </span>
                                            </div>
                                            <div className="bg-white/5 p-2 rounded-xl">
                                                <span className="text-[7.5px] text-gray-400 uppercase block">Tempo a CPA</span>
                                                <span className="font-bold text-cyan-400 text-xs">
                                                    {activeTarget.tcpa !== null && activeTarget.tcpa !== undefined && activeTarget.tcpa >= 0 ? `${Math.round(activeTarget.tcpa)} min` : '--'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Box Avvistamento a Vista */}
                                        {activeTarget.sightingTxt && (
                                            <div className="bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1.5 rounded-xl text-[9px] text-cyan-200 shrink-0 flex items-center gap-1.5">
                                                <span className="text-cyan-400 font-black uppercase shrink-0">👀 Vista:</span>
                                                <span className="truncate">{activeTarget.sightingTxt}</span>
                                            </div>
                                        )}

                                        {/* Box Analisi Incrocio & Regole COLREGs */}
                                        {activeTarget.crossDir && (
                                            <div className="bg-white/5 p-2 rounded-xl text-[9px] text-gray-300 border border-white/5 overflow-y-auto leading-normal whitespace-pre-line max-h-20">
                                                <span className="text-orange-400 font-bold uppercase block mb-1">Analisi Incrocio:</span>
                                                {activeTarget.crossDir}
                                            </div>
                                        )}
                                    </>
                                ) : (() => {
                                    const flagTxt = getVesselFlag(activeTarget.id);
                                    const rawMmsi = String(activeTarget.id || '').split(':').pop();
                                    const lengthM = activeTarget.length ? Math.round(activeTarget.length) : null;
                                    const beamM = activeTarget.beam ? Math.round(activeTarget.beam) : null;
                                    const draftM = activeTarget.draft ? activeTarget.draft.toFixed(1) : null;
                                    const etaFormatted = formatEta(activeTarget.eta);

                                    return (
                                        <div className="flex flex-col gap-1.5 text-[10px] shrink-0 font-mono">
                                            {/* Riga 1: Dimensioni & Pescaggio */}
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                                                    <span className="text-[7.5px] text-gray-400 uppercase block tracking-wider">Dimensioni (L × B)</span>
                                                    <span className="font-bold text-white text-xs mt-0.5">
                                                        {lengthM ? `${lengthM}m × ${beamM ? `${beamM}m` : '--'}` : '--'}
                                                    </span>
                                                </div>
                                                <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                                                    <span className="text-[7.5px] text-gray-400 uppercase block tracking-wider">Pescaggio (Draft)</span>
                                                    <span className="font-bold text-white text-xs mt-0.5">
                                                        {draftM ? `${draftM}m` : '--'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Riga 2: Destinazione & ETA */}
                                            <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                                                <span className="text-[7.5px] text-gray-400 uppercase block tracking-wider">Destinazione & ETA</span>
                                                <span className="font-bold text-cyan-300 text-xs mt-0.5 truncate">
                                                    {activeTarget.destination ? `🎯 ${activeTarget.destination}${etaFormatted ? ` • ETA: ${etaFormatted}` : ''}` : 'NON DICHIARATA'}
                                                </span>
                                            </div>

                                            {/* Riga 3: Stato AIS (Classe A/B) & Radio VHF + Bandiera */}
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                                                    <span className="text-[7.5px] text-gray-400 uppercase block tracking-wider">Stato AIS (Classe)</span>
                                                    <span className="font-bold text-white text-[11px] mt-0.5 truncate block">
                                                        {activeTarget.isAnchored ? 'All\'Ancora' : (activeTarget.sog >= 0.5 ? 'In Navigazione' : 'Alla Deriva')}
                                                        <span className="text-gray-400 font-normal ml-1">({activeTarget.aisClass || 'B'})</span>
                                                    </span>
                                                </div>
                                                <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex flex-col justify-center">
                                                    <span className="text-[7.5px] text-gray-400 uppercase block tracking-wider">Radio & Bandiera</span>
                                                    <span className="font-bold text-white text-[11px] mt-0.5 truncate block flex items-center gap-1">
                                                        {activeTarget.callsign ? (
                                                            <span>📻 {activeTarget.callsign}</span>
                                                        ) : (
                                                            <span className="text-gray-400">📻 --</span>
                                                        )}
                                                        {flagTxt && (
                                                            <>
                                                                <span className="text-gray-500 font-normal">•</span>
                                                                <span className="text-cyan-300 font-bold">{flagTxt}</span>
                                                            </>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Riga 4: Pulsante Diretto VesselFinder per Foto e Scheda Ufficiale */}
                                            {rawMmsi && (
                                                <a
                                                    href={`https://www.vesselfinder.com/vessels/details/${rawMmsi}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-0.5 w-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs tracking-wide no-underline shadow-lg"
                                                >
                                                    <span>🌐</span> Vedi Foto su VesselFinder
                                                </a>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })() : (
                        /* SCENARIO B: LISTA SCORREVOLE DEI BERSAGLI (Mantiene h-[40vh] per lo scroll) */
                        <div className="flex flex-col h-full font-mono">
                            {/* Header Lista */}
                            <div className="h-10 px-3.5 flex items-center justify-between border-b border-white/10 shrink-0">
                                <div className="flex items-center gap-2">
                                    <Navigation2 size={14} className="text-cyan-400" />
                                    <span className="text-[11px] font-black uppercase tracking-wider text-white">
                                        Bersagli ({sortedTargets.length})
                                    </span>
                                </div>
                                <button onClick={handleCloseAll} className="text-gray-400 hover:text-white p-1">
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Righe Bersagli con Riga Fissa Barca Propria in Cima */}
                            <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                                {/* Riga Fissata: Barca Propria (ROTEVISTA) */}
                                <div
                                    onClick={() => handleSelectFromList(ownShipTarget)}
                                    className="p-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 transition-all cursor-pointer flex items-center justify-between"
                                >
                                    <div className="flex flex-col truncate pr-2">
                                        <span className="text-[11px] font-black uppercase text-cyan-400 truncate flex items-center gap-1">
                                            ⛵ ROTEVISTA (LA TUA BARCA)
                                        </span>
                                        <span className="text-[8px] text-gray-300 mt-0.5">
                                            {data?.anchor?.status !== 'MOVING' ? 'ALL\'ANCORA' : (data?.anchor?.engine_on ? 'A MOTORE' : 'A VELA')} • HDG: {Math.round(heading)}°
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end text-right shrink-0 leading-none">
                                        <span className="text-xs font-black text-cyan-400 font-mono">
                                            {ownSog.toFixed(1)} kn
                                        </span>
                                        <span className="text-[7.5px] text-gray-400 mt-1">
                                            SOG
                                        </span>
                                    </div>
                                </div>

                                {/* Lista Bersagli AIS Circostanti */}
                                {sortedTargets.map((v) => {
                                    const isRed = v.risk === 'RED';
                                    const isOrange = v.risk === 'ORANGE';
                                    const ship = getShipTypeInfo(v.type);

                                    return (
                                        <div
                                            key={v.id}
                                            onClick={() => handleSelectFromList(v)}
                                            className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                                isRed
                                                    ? 'bg-red-500/15 border-red-500/40 text-red-100'
                                                    : isOrange
                                                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-100'
                                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                                            }`}
                                        >
                                            <div className="flex flex-col truncate pr-2">
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <span style={{ color: ship.color }} className="text-xs shrink-0">
                                                        {ship.emoji}
                                                    </span>
                                                    <span className="text-[11px] font-black uppercase text-white truncate">
                                                        {v.name || 'Sconosciuto'}
                                                    </span>
                                                    {isRed && <span className="text-red-500 text-[9px] shrink-0">🚨</span>}
                                                </div>
                                                <span className="text-[9.5px] font-bold text-gray-300 mt-0.5 tracking-tight leading-tight">
                                                    {ship.label} • {v.isMoving ? `${v.sog}k • ${v.cog}°` : 'ALL\'ANCORA'}
                                                </span>
                                            </div>

                                            <div className="flex flex-col items-end text-right shrink-0 leading-none">
                                                <span className={`text-xs font-black ${isRed ? 'text-red-400' : isOrange ? 'text-orange-400' : 'text-cyan-400'}`}>
                                                    {v.cpa !== null && v.cpa !== undefined ? `CPA: ${formatNavDistanceShort(v.cpa)}` : formatNavDistanceShort(v.dist)}
                                                </span>
                                                {v.tcpa !== null && v.tcpa >= 0 && (
                                                    <span className="text-[8.5px] font-bold text-gray-300 mt-1">
                                                        in {Math.round(v.tcpa)}m
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            </div>
    );
};

export default AisView;
