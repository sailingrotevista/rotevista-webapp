import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Plus, Minus, Target, Navigation2, ChevronDown, AlertTriangle, X, Copy, Check } from 'lucide-react';

// ============================================================
// 1. CONFIGURAZIONE ICONE AIS & BARCA
// ============================================================

const ownBoatAisIcon = (heading) => new L.DivIcon({
    html: `
        <div style="transform: rotate(${heading || 0}deg); font-size: 22px; color: #38bdf8; filter: drop-shadow(0 0 5px rgba(0,0,0,0.9)); display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
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

/** Etichetta tattica fluttuante sulla mappa (solo per bersagli in ALLARME ROSSO o WARNING ARANCIONE) */
const threatVesselLabelIcon = (vessel) => {
    const isRed = vessel.risk === 'RED';
    const color = isRed ? '#ef4444' : '#f97316';
    const ship = getShipTypeInfo(vessel.type);

    const isMoving = vessel.isMoving !== undefined ? vessel.isMoving : (!vessel.isAnchored && vessel.sog >= 0.3);
    const speedLine = isMoving ? `${vessel.sog} kn • ${vessel.cog}°` : `ALL'ANCORA (${vessel.dist}m)`;

    let alertLine = '';
    if (isRed) {
        const title = vessel.riskMsg || 'COLLISIONE!';
        const timeTxt = (vessel.tcpa !== null && vessel.tcpa !== undefined && vessel.tcpa >= 0) ? ` in ${Math.round(vessel.tcpa)}m` : '';
        const cpaTxt = vessel.cpa !== null && vessel.cpa !== undefined ? ` • CPA: ${vessel.cpa}m` : '';
        alertLine = `🚨 ${title}${cpaTxt}${timeTxt}`;
    } else {
        const timeTxt = (vessel.tcpa !== null && vessel.tcpa !== undefined && vessel.tcpa >= 0) ? ` in ${Math.round(vessel.tcpa)}m` : '';
        const cpaTxt = vessel.cpa !== null && vessel.cpa !== undefined ? `CPA: ${vessel.cpa}m` : `Dist: ${vessel.dist}m`;
        alertLine = `⚠️ ${cpaTxt}${timeTxt}`;
    }

    const textShadow = '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 0 5px #000';

    return new L.DivIcon({
        html: `
            <div style="display: flex; flex-direction: row; align-items: flex-start; gap: 4px; white-space: nowrap; font-family: monospace; line-height: 1.15; pointer-events: none;">
                <span style="font-size: 16px; line-height: 1; filter: drop-shadow(0 0 3px black);">${ship.emoji}</span>
                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                    <span style="font-size: 12px; font-weight: 900; color: ${color}; text-shadow: ${textShadow}; text-transform: uppercase;">${vessel.name || 'Sconosciuto'}</span>
                    <span style="font-size: 9px; font-weight: 800; color: #ffffff; text-shadow: ${textShadow}; margin-top: 1px;">${speedLine}</span>
                    <span style="font-size: 10px; font-weight: 900; color: ${color}; text-shadow: ${textShadow}; margin-top: 1.5px;">${alertLine}</span>
                </div>
            </div>
        `,
        className: 'ais-threat-floating-label',
        iconSize: [280, 48],
        iconAnchor: [-12, 24] // Spostata leggermente a lato per non coprire il marker
    });
};

// ============================================================
// 2. CONTROLLI MAPPA TATTICA, SMART ZOOM E TELECAMERA
// ============================================================
const AisMapController = ({
    centerCoords,
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

    // Aggiorna confini visibili e livello di zoom per ottimizzazione GPU
    const updateViewport = useCallback(() => {
        if (onZoomChange) onZoomChange(map.getZoom());
        if (onBoundsChange) onBoundsChange(map.getBounds().pad(0.15)); // +15% di margine per scorrimento fluido
    }, [map, onZoomChange, onBoundsChange]);

    useMapEvents({
        dragstart: () => setAutoCenter(false),
        zoomstart: (e) => {
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

    // Inseguimento continuo della barca propria e applicazione dello Smart Zoom automatico
    useEffect(() => {
        if (!autoCenter || centerCoords[0] === 0 || isTargetSelected) return;

        const currentZoom = map.getZoom();

        if (!isManualZoomOverrideRef.current && currentZoom !== smartZoom) {
            // Applica lo Smart Zoom dinamico calcolato dalla velocità
            map.flyTo(centerCoords, smartZoom, { duration: 0.8 });
        } else {
            // Scorrimento fluido sulla posizione GPS
            map.panTo(centerCoords, { animate: true, duration: 0.5 });
        }
    }, [autoCenter, centerCoords, smartZoom, isTargetSelected, map]);

    // Spostamento animato con offset ottico per centrare la nave nello spazio libero tra scheda e navbar
    useEffect(() => {
        if (flyTarget && flyTarget.lat && flyTarget.lon) {
            const targetZ = Math.max(map.getZoom(), 15);
            
            // Calcolo offset in pixel: sposta la telecamera per far atterrare la nave nell'area libera
            const isPortrait = window.innerHeight > window.innerWidth;
            const offsetY = isPortrait ? 50 : 20; // 50px su smartphone verticale, 20px in orizzontale
            
            const targetPoint = map.project([flyTarget.lat, flyTarget.lon], targetZ);
            const offsetPoint = L.point(targetPoint.x, targetPoint.y - offsetY);
            const offsetLatLng = map.unproject(offsetPoint, targetZ);

            map.flyTo(offsetLatLng, targetZ, { duration: 0.8 });
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
        /* Pulsanti Zoom e Centra rialzati per evitare overlap con Navbar App e Safari bar */
        <div className="absolute right-3 bottom-[175px] flex flex-col gap-2.5 z-[1000]">
            <button
                onClick={() => handleManualZoom('in')}
                className="w-12 h-12 rounded-2xl bg-[#161b22]/90 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white active:scale-95 shadow-2xl"
            >
                <Plus size={22} />
            </button>
            <button
                onClick={() => handleManualZoom('out')}
                className="w-12 h-12 rounded-2xl bg-[#161b22]/90 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white active:scale-95 shadow-2xl"
            >
                <Minus size={22} />
            </button>
            <button
                onClick={() => {
                    // Il tasto Centra riattiva sia l'inseguimento sia lo Smart Zoom automatico
                    isManualZoomOverrideRef.current = false;
                    setAutoCenter(true);
                    map.flyTo(centerCoords, smartZoom, { duration: 0.6 });
                }}
                className={`w-12 h-12 rounded-2xl border transition-all flex items-center justify-center shadow-2xl active:scale-95 ${
                    autoCenter ? 'bg-cyan-500/40 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-[#161b22]/90 border-white/20 text-gray-400'
                }`}
            >
                <Target size={22} />
            </button>
        </div>
    );
};
// ============================================================
// 3. VISTA AIS PRINCIPALE
// ============================================================
const AisView = ({ manager, isNightMode = false, initialMmsi = null }) => {
    const { data } = manager;
    const [autoCenter, setAutoCenter] = useState(true);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [isListOpen, setIsListOpen] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(14);
    const [mapBounds, setMapBounds] = useState(null); // Confini visibili dello schermo
    const [isMmsiCopied, setIsMmsiCopied] = useState(false); // Feedback copia MMSI

    /** Copia sicura dell'MMSI negli appunti (compatibile con iOS/Android/Desktop) */
    const handleCopyMmsi = (mmsiNumber) => {
        if (!mmsiNumber) return;

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(mmsiNumber).then(() => {
                setIsMmsiCopied(true);
                setTimeout(() => setIsMmsiCopied(false), 2000);
            });
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = mmsiNumber;
            textArea.style.position = "fixed";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            setIsMmsiCopied(true);
            setTimeout(() => setIsMmsiCopied(false), 2000);
            document.body.removeChild(textArea);
        }
    };

    // Memoria sincrona dello stato della mappa precedente all'ispezione
    const cameraSnapshotRef = useRef(null);
    const hasHandledDeepLinkRef = useRef(false);
    const [restoreSignal, setRestoreSignal] = useState(0);
    const [flyTarget, setFlyTarget] = useState(null); // Bersaglio da inquadrare con animazione

    const lat = parseFloat(data?.gps?.lat) || 37.90;
    const lon = parseFloat(data?.gps?.lon) || 23.40;
    const ownCoords = useMemo(() => [lat, lon], [lat, lon]);
    const heading = data?.environment?.heading || data?.gps?.cog || 0;
    const ownSog = data?.anchor?.sog !== undefined ? data.anchor.sog : (data?.gps?.sog || 0);

    // Smart Zoom tattico ricalcolato sulla velocità propria
    const smartZoom = useMemo(() => getAisSmartZoom(ownSog), [ownSog]);

    /** Centro degli anelli: Bersaglio AIS selezionato oppure la propria Barca */
    const rangeRingsCenter = useMemo(() => {
        if (selectedTarget && selectedTarget.lat && selectedTarget.lon) {
            return { lat: selectedTarget.lat, lon: selectedTarget.lon };
        }
        return { lat: ownCoords[0], lon: ownCoords[1] };
    }, [selectedTarget, ownCoords]);

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
                segments.push({ positions: curPositions, color, weight: 3, opacity: 0.85 });
                curPositions = [[ptLat, ptLon]];
                curMode = mode;
            }
        }

        if (curPositions.length >= 2) {
            const color = curMode === "engine" ? "#f97316" : (isNightMode ? "#38bdf8" : "#0284c7");
            segments.push({ positions: curPositions, color, weight: 3, opacity: 0.85 });
        }

        return segments;
    }, [data?.environment?.gps_history, data?.anchor?.engine_on, data?.anchor?.status, ownCoords, isNightMode]);

    /** 1. Selezione da LISTA: sposta la telecamera e memorizza il punto di ritorno */
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

    /** 2. Selezione diretta da MAPPA: apre solo i dati, MAPPA FERMA al 100% */
    const handleSelectFromMap = (vessel) => {
        setSelectedTarget(vessel);
        setFlyTarget(null); // Nessuna animazione telecamera
    };

    /** Ritorno alla lista con ripristino telecamera */
    const handleBackToList = () => {
        setSelectedTarget(null);
        setFlyTarget(null);
        if (cameraSnapshotRef.current) {
            setRestoreSignal(prev => prev + 1);
        }
    };

    /** Chiusura totale (Tasto X): chiude tutto e ripristina la mappa al punto di partenza */
    const handleCloseAll = () => {
        setSelectedTarget(null);
        setFlyTarget(null);
        setIsListOpen(false);
        if (cameraSnapshotRef.current) {
            setRestoreSignal(prev => prev + 1);
        }
    };

    // --- ORDINAMENTO BERSAGLI PER PERICOLOSITÀ (Lista completa per il menu) ---
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

    // Viewport Culling: filtra solo i bersagli effettivamente visibili a schermo per alleggerire il DOM
    const visibleMapTargets = useMemo(() => {
        if (!mapBounds) return sortedTargets;
        return sortedTargets.filter(v => {
            // I bersagli in allarme rosso o selezionati vengono renderizzati sempre
            if (v.risk === 'RED' || selectedTarget?.id === v.id) return true;
            return mapBounds.contains([v.lat, v.lon]);
        });
    }, [sortedTargets, mapBounds, selectedTarget]);

    // Gestione Deep Link Telegram: aggancia e inquadra la nave all'arrivo dei dati
    useEffect(() => {
        if (!initialMmsi || hasHandledDeepLinkRef.current || sortedTargets.length === 0) return;

        const target = sortedTargets.find(t => {
            const mmsi = t.id?.split(':').pop();
            return mmsi === initialMmsi || t.id === initialMmsi;
        });

        if (target) {
            hasHandledDeepLinkRef.current = true;
            handleSelectFromList(target);

            // Pulisce l'URL senza ricaricare la pagina per evitare ri-centramenti al refresh
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('mmsi');
            window.history.replaceState({}, '', cleanUrl.toString());
        }
    }, [initialMmsi, sortedTargets]);

    return (
        <div className="relative w-full h-[calc(100vh-4rem)] landscape:h-[calc(100vh-3.5rem)] overflow-hidden bg-[#0d1117] text-white">
            
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

                    {/* BERSAGLI AIS CON OTTIMIZZAZIONE LOD E VIEWPORT CULLING */}
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

                        return (
                            <React.Fragment key={v.id}>
                                {/* Scia Storica (solo se tatticamente rilevante) */}
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

                                {/* Vettore di prua a 15 min (solo per target tattici o in allarme) */}
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

                                {/* 🔴 CERCHIO DI ALLARME ROSSO PERICOLO (Pulsante e spesso) */}
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

                                {/* 🟠 CERCHIO DI WARNING ARANCIONE */}
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

                                {/* 🩵 CERCHIO DI FOCUS/SELEZIONE CIANO */}
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

                                {/* Marker Bersaglio con scala dinamica da zoom e priorità Z-Index */}
                                <Marker
                                    position={[v.lat, v.lon]}
                                    icon={targetMarkerIcon(v, isSelected, currentZoom)}
                                    zIndexOffset={isRedAlert ? 700 : isOrangeWarn ? 500 : isSelected ? 600 : 100}
                                    eventHandlers={{
                                        click: () => handleSelectFromMap(v)
                                    }}
                                />

                                {/* Etichetta Tattica Fluttuante (visibile solo se in Allarme Rosso o Warning Arancione) */}
                                {(isRedAlert || isOrangeWarn) && (
                                    <Marker
                                        position={[v.lat, v.lon]}
                                        icon={threatVesselLabelIcon(v)}
                                        zIndexOffset={isRedAlert ? 800 : 650}
                                        interactive={false}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}

                    {/* PROPRIA BARCA */}
                    <Marker position={ownCoords} icon={ownBoatAisIcon(heading)} zIndexOffset={1000} />
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

            {/* 2. PANNELLO SUPERIORE COMPATTO (Altezza auto-adattante, zero spazio sprecato) */}
            {(isListOpen || selectedTarget) && (
                <div
                    /* Blocca la propagazione di gesture touch e swipe al contenitore tab principale */
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onTouchStartCapture={(e) => e.stopPropagation()}
                    className={`absolute top-3 right-3 w-[320px] max-w-[88vw] z-[1001] bg-[#161b22]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden isolate ${
                        selectedTarget ? 'h-auto max-h-[48vh]' : 'h-[40vh] max-h-[40vh]'
                    }`}
                >
                    
                    {/* SCENARIO A: SCHEDA DETTAGLIO BERSAGLIO ARRICCHITA E COMPATTA */}
                    {selectedTarget ? (() => {
                        const ship = getShipTypeInfo(selectedTarget.type);
                        const ageTxt = selectedTarget.age !== undefined
                            ? (selectedTarget.age < 60 ? `${selectedTarget.age}s fa` : `${Math.round(selectedTarget.age / 60)}m fa`)
                            : '';

                        return (
                            <div className="flex flex-col p-3 font-mono gap-2 overflow-y-auto">
                                {/* Header: Tasto Indietro, Nome, Tipo Nave, MMSI, Freschezza e Tasto Chiudi */}
                                <div className="flex items-center justify-between border-b border-white/10 pb-2 shrink-0">
                                    <button
                                        onClick={handleBackToList}
                                        className="flex items-center gap-1 text-[11px] font-black text-cyan-400 hover:text-cyan-300 active:scale-95 transition-transform shrink-0"
                                    >
                                        <span>←</span> LISTA
                                    </button>
                                    <div className="text-center truncate px-1 flex-1">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="text-base">{ship.emoji}</span>
                                        <h4 className="text-sm font-black uppercase text-white truncate">{selectedTarget.name || 'Sconosciuto'}</h4>
                                    </div>
                                    {/* Tasto Copia Rapida MMSI negli Appunti */}
                                    <div className="flex items-center justify-center gap-1 mt-0.5">
                                        <span className="text-[9.5px] font-bold text-gray-300 uppercase tracking-tight">
                                            {ship.label} •
                                        </span>
                                        {selectedTarget.id?.includes('mmsi:') ? (
                                            <button
                                                onClick={() => handleCopyMmsi(selectedTarget.id.split(':').pop())}
                                                className={`text-[9.5px] font-bold uppercase flex items-center gap-1 cursor-pointer active:scale-95 transition-all px-1 py-0.5 rounded-md ${
                                                    isMmsiCopied ? 'text-green-400 bg-green-500/10' : 'text-cyan-400 hover:text-cyan-300 bg-white/5'
                                                }`}
                                                title="Tocca per copiare l'MMSI negli appunti"
                                            >
                                                {isMmsiCopied ? (
                                                    <>
                                                        <Check size={11} className="shrink-0 text-green-400" />
                                                        <span>Copiato!</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy size={10} className="shrink-0 opacity-80" />
                                                        <span>MMSI {selectedTarget.id.split(':').pop()}</span>
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <span className="text-[9.5px] font-bold text-gray-300 uppercase">
                                                MMSI: --
                                            </span>
                                        )}
                                        {ageTxt && (
                                            <span className="text-[9.5px] font-bold text-gray-400">
                                                • {ageTxt}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                    <button onClick={handleCloseAll} className="text-gray-400 hover:text-white p-1 shrink-0">
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Griglia Metriche Principali con Distanze Duali Intelligenti */}
                                <div className="grid grid-cols-2 gap-1.5 text-[10px] shrink-0">
                                    <div className="bg-white/5 p-2 rounded-xl">
                                        <span className="text-[7.5px] text-gray-400 uppercase block">SOG / COG</span>
                                        <span className="font-bold text-white text-xs">{selectedTarget.sog} kn @ {selectedTarget.cog}°</span>
                                    </div>
                                    <div className="bg-white/5 p-2 rounded-xl">
                                        <span className="text-[7.5px] text-gray-400 uppercase block">Distanza</span>
                                        <span className="font-bold text-white text-xs truncate" title={formatNavDistance(selectedTarget.dist)}>
                                            {formatNavDistance(selectedTarget.dist)}
                                        </span>
                                    </div>
                                    <div className="bg-white/5 p-2 rounded-xl">
                                        <span className="text-[7.5px] text-gray-400 uppercase block">CPA Minimo</span>
                                        <span className="font-bold text-cyan-400 text-xs truncate" title={formatNavDistance(selectedTarget.cpa)}>
                                            {formatNavDistance(selectedTarget.cpa)}
                                        </span>
                                    </div>
                                    <div className="bg-white/5 p-2 rounded-xl">
                                        <span className="text-[7.5px] text-gray-400 uppercase block">Tempo a CPA</span>
                                        <span className="font-bold text-cyan-400 text-xs">
                                            {selectedTarget.tcpa !== null && selectedTarget.tcpa !== undefined && selectedTarget.tcpa >= 0 ? `${Math.round(selectedTarget.tcpa)} min` : '--'}
                                        </span>
                                    </div>
                                </div>

                                {/* Box Avvistamento a Vista (Dove guardare a occhio nudo) */}
                                {selectedTarget.sightingTxt && (
                                    <div className="bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1.5 rounded-xl text-[9px] text-cyan-200 shrink-0 flex items-center gap-1.5">
                                        <span className="text-cyan-400 font-black uppercase shrink-0">👀 Vista:</span>
                                        <span className="truncate">{selectedTarget.sightingTxt}</span>
                                    </div>
                                )}

                                {/* Box Analisi Incrocio & Regole COLREGs */}
                                {selectedTarget.crossDir && (
                                    <div className="bg-white/5 p-2 rounded-xl text-[9px] text-gray-300 border border-white/5 overflow-y-auto leading-tight max-h-16">
                                        <span className="text-orange-400 font-bold uppercase block mb-0.5">Analisi Incrocio:</span>
                                        {selectedTarget.crossDir}
                                    </div>
                                )}
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

                            {/* Righe Bersagli */}
                            <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
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
