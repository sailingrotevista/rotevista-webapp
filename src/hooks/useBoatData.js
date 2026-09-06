import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 1. GESTIONE DINAMICA DEGLI ENDPOINT (HTTP Primario su 1880, HTTPS Fallback su 1881)
 */
const getTargetHost = () => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) {
        return '192.168.111.240';
    }
    return host;
};

const targetHost = getTargetHost();
const HTTP_BASE_URL = `http://${targetHost}:1880`;
const HTTPS_BASE_URL = `https://${targetHost}:1881`;

// Verifica vincolo browser: se la webapp è caricata in HTTPS, vietato tentare HTTP (Mixed Content)
const isPageHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

export const useBoatData = () => {
    // --- STATI DATI ---
    const [data, setData] = useState(null);               // Contenuto del JSON ricevuto
    const [lastUpdate, setLastUpdate] = useState(null);   // Timestamp dell'ultimo pacchetto ricevuto
    const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState(0);
    const [isDataStale, setIsDataStale] = useState(true); // Indica se i dati sono troppo vecchi (>30s)
    
    // --- STATI DIAGNOSTICA E FEEDBACK ---
    const [error, setError] = useState(null);             // Cattura errori SSL o di rete per la modale
    const [isUpdating, setIsUpdating] = useState(false);  // True mentre un comando POST è in corso

    // Riferimento dinamico all'endpoint attivo: HTTP 1880 primario, HTTPS 1881 fallback
    const activeBaseUrlRef = useRef(isPageHttps ? HTTPS_BASE_URL : HTTP_BASE_URL);

    // Lock di rete per evitare richieste sovrapposte
    const isFetchingRef = useRef(false);

    /**
         * 2. RECUPERO DATI CON FALLBACK DINAMICO (HTTP 1880 -> HTTPS 1881)
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

            try {
                let jsonData;
                try {
                    // Tentativo primario sull'endpoint attivo (HTTP 1880)
                    jsonData = await executeFetch(activeBaseUrlRef.current);
                } catch (primaryErr) {
                    // Fallback automatico su HTTPS 1881 se il tentativo HTTP fallisce
                    if (!isPageHttps && activeBaseUrlRef.current === HTTP_BASE_URL) {
                        console.warn("HTTP 1880 non raggiungibile, fallback su HTTPS 1881...");
                        jsonData = await executeFetch(HTTPS_BASE_URL);
                        activeBaseUrlRef.current = HTTPS_BASE_URL; // Salva HTTPS come attivo
                    } else {
                        throw primaryErr;
                    }
                }

                setData(jsonData);
                setLastUpdate(new Date());
                setIsDataStale(false);
                setError(null);       // Connessione riuscita: nessun errore
                setIsUpdating(false);

            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.error("Fetch Error:", e);
                    setError(e.message);
                }
                setIsDataStale(true);
                setIsUpdating(false);
            } finally {
                isFetchingRef.current = false;
            }
        }, []);

        /**
         * 3. INVIO COMANDI (POST)
         * Invia ordini agli Shelly o al Multiplus sull'endpoint attivo
         */
        const sendCommand = async (device, state) => {
            setIsUpdating(true); // Attiva lo spinner di caricamento nella UI
            
            try {
                const response = await fetch(`${activeBaseUrlRef.current}/api/boat/control`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device, state })
                });

            if (!response.ok) throw new Error("Comando fallito");

            // Dopo l'invio, attendiamo 1 secondo e forziamo un refresh dei dati
            // per confermare che il Multiplus abbia cambiato stato.
            setTimeout(fetchData, 1000);

        } catch (e) {
            console.error("Errore invio comando:", e);
            setIsUpdating(false);
        }
    };

    /**
     * 4. CICLI DI AGGIORNAMENTO (Lifecycle a prova di ibernazione Android/Chrome)
     */

    // Effetto Polling con Risveglio Multi-Evento (Visibility, Pageshow, Focus, Online)
    useEffect(() => {
        let intervalId = null;

        const restartSync = () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }

            if (!document.hidden) {
                // Scarica subito i dati e avvia il polling continuo
                fetchData();
                intervalId = setInterval(fetchData, 5000);
            }
        };

        // Primo avvio
        restartSync();

        // Ascolto combinato di tutti gli eventi di riattivazione su Android/iOS
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
    }, []);

    // Effetto Watchdog: Calcola secondi e auto-rigenera la connessione in sicurezza
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.hidden) return;

            if (lastUpdate) {
                const diff = Math.floor((new Date() - lastUpdate) / 1000);
                setSecondsSinceLastUpdate(diff);
                setIsDataStale(diff > 30);

                // Auto-guarigione protetta da semaforo se non si ricevono dati da oltre 8 secondi
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

// --- OGGETTO ESPORTO ---
    return {
        data,                    // I dati della barca
        secondsSinceLastUpdate,  // Secondi dall'ultimo aggiornamento
        isDataStale,             // Boolean: dati scaduti?
        statusColor,             // Classe CSS per il pallino in alto a destra
        isUpdating,              // Boolean: comando in corso? (per spinner)
        error,                   // Stringa errore per modale SSL
        apiUrl: HTTPS_BASE_URL,  // Garantisce che il tasto "Autorizza SSL" apra sempre l'HTTPS se necessario
        
        // Metodi per la UI
        toggleSwitch: (device, state) => sendCommand(device, state),
        setShoreLimit: (amps) => sendCommand('shore_limit', amps)
    };
};
