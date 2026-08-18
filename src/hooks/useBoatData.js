import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 1. GESTIONE DINAMICA DELL'INDIRIZZO IP
 * Determina se puntare all'IP fisso della barca o all'host attuale.
 */
const getBaseUrl = () => {
    const host = window.location.hostname;
    
    // Se siamo in sviluppo locale (localhost) o se accediamo tramite l'IP del Mac (192.168.x.x)
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) {
        // Forza l'indirizzo IP del Cerbo GX / Node-RED in HTTPS
        return 'https://192.168.111.240:1881';
    }
    
    // Se l'app è installata direttamente su SignalK, usa l'host corrente
    return `https://${host}:1881`;
};

export const useBoatData = () => {
    // --- STATI DATI ---
    const [data, setData] = useState(null);               // Contenuto del JSON ricevuto
    const [lastUpdate, setLastUpdate] = useState(null);   // Timestamp dell'ultimo pacchetto ricevuto
    const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState(0);
    const [isDataStale, setIsDataStale] = useState(true); // Indica se i dati sono troppo vecchi (>30s)
    
    // --- STATI DIAGNOSTICA E FEEDBACK ---
    const [error, setError] = useState(null);             // Cattura errori SSL o di rete per la modale
    const [isUpdating, setIsUpdating] = useState(false);  // True mentre un comando POST è in corso

    // Costruzione degli endpoint
    const baseUrl = getBaseUrl();
    const apiUrl = `${baseUrl}/api/boat`;
    const controlUrl = `${baseUrl}/api/boat/control`;

    // Lock di rete per evitare richieste sovrapposte
    const isFetchingRef = useRef(false);

    /**
     * 2. RECUPERO DATI (GET CON TIMEOUT E SEMAFORO ANTI-SOVRAPPOSIZIONE)
     */
    const fetchData = useCallback(async () => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // Timeout a 4 secondi

        try {
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Errore Server: ${response.status}`);
            }

            const jsonData = await response.json();
            
            setData(jsonData);
            setLastUpdate(new Date());
            setIsDataStale(false);
            setError(null);       // Reset errore: connessione OK
            setIsUpdating(false);
            
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name !== 'AbortError') {
                console.error("Fetch Error:", e);
                setError(e.message);
            }
            setIsDataStale(true);
            setIsUpdating(false);
        } finally {
            isFetchingRef.current = false;
        }
    }, [apiUrl]);

    /**
     * 3. INVIO COMANDI (POST)
     * Invia ordini agli Shelly o al Multiplus
     */
    const sendCommand = async (device, state) => {
        setIsUpdating(true); // Attiva lo spinner di caricamento nella UI
        
        try {
            const response = await fetch(controlUrl, {
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
        apiUrl: baseUrl,         // URL base per sblocco manuale
        
        // Metodi per la UI
        toggleSwitch: (device, state) => sendCommand(device, state),
        setShoreLimit: (amps) => sendCommand('shore_limit', amps)
    };
};
