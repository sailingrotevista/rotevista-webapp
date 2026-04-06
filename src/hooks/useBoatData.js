import { useState, useEffect } from 'react';

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

    /**
     * 2. RECUPERO DATI (GET)
     * Interroga periodicamente l'API di Node-RED
     */
    const fetchData = async () => {
        try {
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`Errore Server: ${response.status}`);
            }

            const jsonData = await response.json();
            
            setData(jsonData);
            setLastUpdate(new Date());
            setIsDataStale(false);
            setError(null);      // Reset errore: la connessione funziona
            setIsUpdating(false); // Spegne lo spinner se era attivo
            
        } catch (e) {
            console.error("Fetch Error:", e);
            setError(e.message);  // Questo triggera la modale SSL in HomeView
            setIsDataStale(true);
            setIsUpdating(false);
        }
    };

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
     * 4. CICLI DI AGGIORNAMENTO (Lifecycle)
     */

    // Effetto Polling: Scarica i dati ogni 5 secondi
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    // Effetto Watchdog: Aggiorna il contatore dei secondi "Dati ricevuti da X secondi"
    useEffect(() => {
        const interval = setInterval(() => {
            if (lastUpdate) {
                const diff = Math.floor((new Date() - lastUpdate) / 1000);
                setSecondsSinceLastUpdate(diff);
                setIsDataStale(diff > 30);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [lastUpdate]);

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
