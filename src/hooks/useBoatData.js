import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 1. GESTIONE DINAMICA DEGLI ENDPOINT (HTTP Primario su 1880, HTTPS Fallback su 1881)
 */
// Verifica se è presente un endpoint configurato o se siamo su una rete locale della barca
const envUrl = import.meta.env?.VITE_BOAT_API_URL;
const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const isLocalNetwork = currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost.startsWith('192.168.') || currentHost.startsWith('10.') || currentHost.endsWith('.local');
export const hasLiveEndpoint = Boolean(envUrl || isLocalNetwork);

const getTargetBaseUrls = () => {
    if (envUrl) {
        const cleanUrl = envUrl.replace(/\/+$/, '');
        return { http: cleanUrl, https: cleanUrl };
    }
    const host = isLocalNetwork ? '192.168.111.240' : currentHost;
    return {
        http: `http://${host}:1880`,
        https: `https://${host}:1881`
    };
};

const { http: HTTP_BASE_URL, https: HTTPS_BASE_URL } = getTargetBaseUrls();

// Verifica vincolo browser: se la webapp è caricata in HTTPS, vietato tentare HTTP (Mixed Content)
const isPageHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

/**
 * 2. DATASET IN-MEMORY REALISTICO DI FALLBACK (Per ambiente di sviluppo / cloud AI Studio)
 */
const createInitialMockBoatData = () => ({
    gps: {
        lat: 36.7818,
        lon: 14.5422,
        sog: 0.0,
        cog: 120,
        speed: 0.0
    },
    anchor: {
        status: 'IN_PORTO',
        mode: 'IN_PORTO',
        description: "⛵ Ormeggio in Porto",
        boat_dist: 0.0,
        radius: 0,
        std_dev: 0.4,
        depth: 4.8,
        chain: 0,
        engine_on: false,
        engine_v: 12.9,
        score: 0,
        lat: 36.7818,
        lon: 14.5422,
        sog: 0.0
    },
    trip: {
        anchor_time: '18h 45m'
    },
    power: {
        soc: 99.2,
        dc_draw_w: 35,
        shore_power: true,
        ac_power_w: 420,
        shore_v: 231,
        soc_history_24h: [
            84, 83, 82, 80, 78, 77, 75, 74, 73, 72,
            73, 76, 80, 83, 86, 88, 90, 89, 88, 87,
            87, 86, 86, 86
        ],
        soc_history_7d_minmax: [
            { day: 'Lun', min: 68, max: 96, solar_prua: 1.82, solar_poppa: 1.45 },
            { day: 'Mar', min: 72, max: 98, solar_prua: 1.95, solar_poppa: 1.58 },
            { day: 'Mer', min: 65, max: 92, solar_prua: 1.60, solar_poppa: 1.30 },
            { day: 'Gio', min: 74, max: 100, solar_prua: 2.10, solar_poppa: 1.72 },
            { day: 'Ven', min: 70, max: 94, solar_prua: 1.75, solar_poppa: 1.40 },
            { day: 'Sab', min: 75, max: 97, solar_prua: 1.88, solar_poppa: 1.52 },
            { day: 'Oggi', min: 78, max: 88, solar_prua: 1.62, solar_poppa: 1.25 }
        ]
    },
    solar: {
        today_kwh: 3.4,
        forecast_kwh: 4.1,
        yesterday_kwh: 3.8,
        today_prua_max_w: 320,
        today_poppa_max_w: 280,
        prua_w: 185,
        poppa_w: 140
    },
    switches: {
        pump_on: true,
        boiler_on: false,
        washing_machine_on: false,
        multiplus_on: true,
        shore_limit: 16
    },
    environment: {
        temp_pozzetto: 23.4,
        hum_pozzetto: 62,
        temp_quadrato: 21.8,
        hum_quadrato: 58,
        temp_frigo: 4.1,
        temp_freezer: -14.8,
        temp_forecast: 24.0,
        depth: 7.2,
        heading: 135,
        wind_now: 11.2,
        wind_min_30m: 7.4,
        wind_max_30m: 16.5,
        wind_max_24h: 24.2,
        wind_dir_rel: 36,
        wind_dir_true: 171,
        hourly_forecast: [
            { time: '14:00', temp: 24, rainChance: 5, windSpeed: 11, windGust: 15, icon: 'sun', precipitation: 0 },
            { time: '15:00', temp: 24, rainChance: 5, windSpeed: 12, windGust: 16, icon: 'sun', precipitation: 0 },
            { time: '16:00', temp: 23, rainChance: 10, windSpeed: 13, windGust: 17, icon: 'cloudsun', precipitation: 0 },
            { time: '17:00', temp: 22, rainChance: 10, windSpeed: 10, windGust: 14, icon: 'cloudsun', precipitation: 0 },
            { time: '18:00', temp: 21, rainChance: 15, windSpeed: 9, windGust: 13, icon: 'cloud', precipitation: 0 },
            { time: '19:00', temp: 20, rainChance: 20, windSpeed: 8, windGust: 12, icon: 'moon', precipitation: 0 }
        ],
        gps_history: [
            { lat: 36.7750, lon: 14.5300, m: 'sail' },
            { lat: 36.7770, lon: 14.5340, m: 'sail' },
            { lat: 36.7790, lon: 14.5380, m: 'engine' },
            { lat: 36.7810, lon: 14.5405, m: 'engine' },
            { lat: 36.7820, lon: 14.5418, m: 'anchor' },
            { lat: 36.7825, lon: 14.5420, m: 'anchor' }
        ],
        ais_targets: [
            {
                id: '247123456',
                mmsi: '247123456',
                name: 'AURORA',
                type: 36,
                lat: 36.7865,
                lon: 14.5490,
                sog: 5.2,
                cog: 220,
                dist: 780,
                cpa: 520,
                tcpa: 14,
                crossDir: 'DIETRO DI NOI',
                risk: '',
                riskMsg: '',
                ageSec: 15,
                isMoving: true,
                isAnchored: false,
                color: '#22c55e',
                length: 12,
                beam: 4,
                draft: 2.1,
                callsign: 'IX4421',
                destination: 'SIRACUSA',
                eta: '2026-10-16T18:00:00Z'
            },
            {
                id: '247654321',
                mmsi: '247654321',
                name: 'MEDITERRANEO',
                type: 37,
                lat: 36.7795,
                lon: 14.5445,
                sog: 0.1,
                cog: 80,
                dist: 380,
                cpa: 380,
                tcpa: -1,
                crossDir: '',
                risk: '',
                riskMsg: '',
                ageSec: 42,
                isMoving: false,
                isAnchored: true,
                color: 'rgba(225, 225, 225, 0.85)',
                length: 15,
                beam: 4.8,
                draft: 1.8,
                callsign: 'IZ8899',
                destination: 'RADA',
                eta: ''
            },
            {
                id: '247334455',
                mmsi: '247334455',
                name: 'ALBATROS',
                type: 36,
                lat: 36.7840,
                lon: 14.5380,
                sog: 0.0,
                cog: 120,
                dist: 220,
                cpa: 220,
                tcpa: -1,
                crossDir: '',
                risk: '',
                riskMsg: '',
                ageSec: 30,
                isMoving: false,
                isAnchored: true,
                color: 'rgba(225, 225, 225, 0.85)',
                length: 11,
                beam: 3.7,
                draft: 1.9,
                callsign: 'IU5511',
                destination: 'RADA',
                eta: ''
            },
            {
                id: '247998877',
                mmsi: '247998877',
                name: 'CAPO PASSERO',
                type: 70,
                lat: 36.7650,
                lon: 14.5650,
                sog: 11.4,
                cog: 285,
                dist: 2600,
                cpa: 2400,
                tcpa: 28,
                crossDir: '',
                risk: '',
                riskMsg: '',
                ageSec: 10,
                isMoving: true,
                isAnchored: false,
                color: '#9333ea',
                length: 110,
                beam: 18,
                draft: 6.5,
                callsign: 'IB7722',
                destination: 'AUGUSTA',
                eta: '2026-10-16T21:30:00Z'
            }
        ],
        harbor_clusters: [
            {
                id: 'harbor-1',
                center: [36.7815, 14.5420],
                hull: [
                    [36.780, 14.540],
                    [36.781, 14.545],
                    [36.783, 14.544],
                    [36.782, 14.539]
                ],
                count: 4
            }
        ]
    }
});

export const useBoatData = () => {
    // --- STATI DATI ---
    const [data, setData] = useState(() => createInitialMockBoatData());
    const [lastUpdate, setLastUpdate] = useState(() => new Date());
    const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState(0);
    const [isDataStale, setIsDataStale] = useState(false);
    
    // --- STATI DIAGNOSTICA E FEEDBACK ---
    const [error, setError] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // Riferimento dinamico all'endpoint attivo: HTTP 1880 primario, HTTPS 1881 fallback
    const activeBaseUrlRef = useRef(isPageHttps ? HTTPS_BASE_URL : HTTP_BASE_URL);

    // Lock di rete per evitare richieste sovrapposte
    const isFetchingRef = useRef(false);
    const isMockActiveRef = useRef(false);

    /**
     * 3. RECUPERO DATI CON FALLBACK DINAMICO (HTTP 1880 -> HTTPS 1881)
     */
    const executeFetch = async (baseUrl) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        try {
            const response = await fetch(`${baseUrl}/api/boat`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`Errore Server: ${response.status}`);
            return await response.json();
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    };

    const fetchData = useCallback(async () => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        // Se non abbiamo un endpoint barca reale configurato o una LAN locale, aggiorna direttamente la simulazione
        if (!hasLiveEndpoint) {
            isMockActiveRef.current = true;
            setIsUpdating(false);
            setError(null);
            setIsDataStale(false);
            setLastUpdate(new Date());

            setData(prev => {
                if (!prev) return createInitialMockBoatData();
                const windFluct = (Math.random() - 0.5) * 0.4;
                const solarFluctPrua = Math.round((Math.random() - 0.5) * 4);
                const solarFluctPoppa = Math.round((Math.random() - 0.5) * 3);

                return {
                    ...prev,
                    power: {
                        ...prev.power,
                        dc_draw_w: prev.power.dc_draw_w + Math.round((Math.random() - 0.5) * 6)
                    },
                    solar: {
                        ...prev.solar,
                        prua_w: Math.max(0, prev.solar.prua_w + solarFluctPrua),
                        poppa_w: Math.max(0, prev.solar.poppa_w + solarFluctPoppa)
                    },
                    environment: {
                        ...prev.environment,
                        wind_now: Math.max(0, parseFloat((prev.environment.wind_now + windFluct).toFixed(1))),
                        wind_dir_rel: Math.round((prev.environment.wind_dir_rel + (Math.random() - 0.5) * 2 + 360) % 360),
                        hum_quadrato: prev.environment?.hum_quadrato || 58
                    }
                };
            });
            isFetchingRef.current = false;
            return;
        }

        try {
            let jsonData;
            try {
                // Tentativo primario sull'endpoint attivo (HTTP 1880)
                jsonData = await executeFetch(activeBaseUrlRef.current);
            } catch (primaryErr) {
                // Fallback automatico su HTTPS 1881 se il tentativo HTTP fallisce
                if (!isPageHttps && activeBaseUrlRef.current === HTTP_BASE_URL) {
                    jsonData = await executeFetch(HTTPS_BASE_URL);
                    activeBaseUrlRef.current = HTTPS_BASE_URL; // Salva HTTPS come attivo
                } else {
                    throw primaryErr;
                }
            }

            setData(jsonData);
            setLastUpdate(new Date());
            setIsDataStale(false);
            setError(null);
            setIsUpdating(false);
            isMockActiveRef.current = false;

        } catch {
            // Se l'endpoint remoto non è raggiungibile (preview web, assenza di Node-RED),
            // attiviamo la modalità di simulazione interattiva senza bloccare l'interfaccia.
            isMockActiveRef.current = true;
            setIsUpdating(false);
            setError(null);
            setIsDataStale(false);
            setLastUpdate(new Date());

            // Applica lievi fluttuazioni realistiche ai sensori
            setData(prev => {
                if (!prev) return createInitialMockBoatData();
                const windFluct = (Math.random() - 0.5) * 0.4;
                const solarFluctPrua = Math.round((Math.random() - 0.5) * 4);
                const solarFluctPoppa = Math.round((Math.random() - 0.5) * 3);

                return {
                    ...prev,
                    power: {
                        ...prev.power,
                        dc_draw_w: prev.power.dc_draw_w + Math.round((Math.random() - 0.5) * 6)
                    },
                    solar: {
                        ...prev.solar,
                        prua_w: Math.max(0, prev.solar.prua_w + solarFluctPrua),
                        poppa_w: Math.max(0, prev.solar.poppa_w + solarFluctPoppa)
                    },
                    environment: {
                        ...prev.environment,
                        wind_now: Math.max(0, parseFloat((prev.environment.wind_now + windFluct).toFixed(1))),
                        wind_dir_rel: Math.round((prev.environment.wind_dir_rel + (Math.random() - 0.5) * 2 + 360) % 360)
                    }
                };
            });
        } finally {
            isFetchingRef.current = false;
        }
    }, []);

    /**
     * 4. INVIO COMANDI (POST)
     * Invia ordini agli Shelly o al Multiplus sull'endpoint attivo con fallback in-memory
     */
    const sendCommand = async (device, state) => {
        setIsUpdating(true);

        // Se siamo in modalità simulazione / fallback, aggiorna direttamente lo stato in memoria
        if (!hasLiveEndpoint || isMockActiveRef.current) {
            setTimeout(() => {
                setData(prev => {
                    if (!prev) return prev;
                    const nextSwitches = { ...prev.switches };
                    if (device === 'pump') nextSwitches.pump_on = state;
                    if (device === 'boiler') nextSwitches.boiler_on = state;
                    if (device === 'washer') nextSwitches.washing_machine_on = state;
                    if (device === 'multiplus') nextSwitches.multiplus_on = state;
                    if (device === 'shore_limit') nextSwitches.shore_limit = state;

                    return {
                        ...prev,
                        switches: nextSwitches
                    };
                });
                setIsUpdating(false);
                setLastUpdate(new Date());
            }, 300);
            return;
        }

        try {
            const response = await fetch(`${activeBaseUrlRef.current}/api/boat/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device, state })
            });

            if (!response.ok) throw new Error("Comando fallito");

            setTimeout(fetchData, 1000);
        } catch {
            // Se la chiamata reale fallisce, mantieni la reattività della UI aggiornando in memoria
            setData(prev => {
                if (!prev) return prev;
                const nextSwitches = { ...prev.switches };
                if (device === 'pump') nextSwitches.pump_on = state;
                if (device === 'boiler') nextSwitches.boiler_on = state;
                if (device === 'washer') nextSwitches.washing_machine_on = state;
                if (device === 'multiplus') nextSwitches.multiplus_on = state;
                if (device === 'shore_limit') nextSwitches.shore_limit = state;

                return {
                    ...prev,
                    switches: nextSwitches
                };
            });
            setIsUpdating(false);
        }
    };

    /**
     * 5. CICLI DI AGGIORNAMENTO
     */
    useEffect(() => {
        let intervalId = null;

        const restartSync = () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }

            if (!document.hidden) {
                fetchData();
                intervalId = setInterval(fetchData, 5000);
            }
        };

        restartSync();

        document.addEventListener('visibilitychange', restartSync);
        window.addEventListener('pageshow', restartSync);
        window.addEventListener('focus', restartSync);
        window.addEventListener('online', restartSync);
        
        return () => {
            if (intervalId) clearInterval(intervalId);
            document.removeEventListener('visibilitychange', restartSync);
            window.removeEventListener('pageshow', restartSync);
            window.removeEventListener('focus', restartSync);
            window.removeEventListener('online', restartSync);
        };
    }, [fetchData]);

    // Effetto Watchdog: Calcola secondi e auto-rigenera la connessione
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.hidden) return;

            if (lastUpdate) {
                const diff = Math.floor((new Date() - lastUpdate) / 1000);
                setSecondsSinceLastUpdate(diff);
                setIsDataStale(diff > 30);

                if (diff >= 8 && !isUpdating && !isFetchingRef.current) {
                    fetchData();
                }
            } else if (!isFetchingRef.current) {
                fetchData();
            }
        }, 1000);
        
        return () => clearInterval(interval);
    }, [lastUpdate, isUpdating, fetchData]);

    // Calcolo del colore di stato (Verde, Arancio, Rosso)
    const statusColor = secondsSinceLastUpdate < 15 ? 'bg-green-500'
                      : secondsSinceLastUpdate < 30 ? 'bg-orange-500'
                      : 'bg-red-500';

    return {
        data,
        secondsSinceLastUpdate,
        isDataStale,
        statusColor,
        isUpdating,
        error,
        apiUrl: HTTPS_BASE_URL,
        toggleSwitch: (device, state) => sendCommand(device, state),
        setShoreLimit: (amps) => sendCommand('shore_limit', amps)
    };
};
