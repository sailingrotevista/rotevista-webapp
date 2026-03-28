import { useState, useEffect } from 'react';

// ============================================================
// 1. GESTIONE DINAMICA DELL'INDIRIZZO IP
// ============================================================
const getBaseUrl = () => {
    const host = window.location.hostname;
    
    // Se siamo in sviluppo locale (Mac) o chiamiamo l'IP del Mac da un tablet
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) {
        // Forza l'indirizzo della barca
        return 'https://192.168.111.240:1881';
    }
    
    // Se l'app è installata sul server della barca (es. SignalK), usa l'host attuale
    return `https://${host}:1881`;
};

export const useBoatData = () => {
    // Stati Dati
    const [data, setData] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState(0);
    const [isDataStale, setIsDataStale] = useState(true);
    
    // Stato Errore (Fondamentale per far apparire la modale SSL)
    const [error, setError] = useState(null);

    // Costruiamo gli URL una volta sola
    const baseUrl = getBaseUrl();
    const apiUrl = `${baseUrl}/api/boat`;
    const controlUrl = `${baseUrl}/api/boat/control`;

    // ============================================================
    // 2. FUNZIONE DI RECUPERO DATI (FETCH)
    // ============================================================
    const fetchData = async () => {
        try {
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const jsonData = await response.json();
            setData(jsonData);
            setLastUpdate(new Date());
            setIsDataStale(false);
            setError(null); // Reset errore: la connessione funziona!
            
        } catch (e) {
            console.error("Fetch Error:", e);
            // Cattura l'errore SSL (Load failed) o Network
            setError(e.message);
            setIsDataStale(true);
        }
    };

    // ============================================================
    // 3. EFFETTI (POLLING E WATCHDOG)
    // ============================================================

    // Effetto Polling: Carica i dati ogni 5 secondi
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    // Effetto Watchdog: Contatore secondi dall'ultimo dato
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

    // Colore dinamico dello stato connessione
    const statusColor = secondsSinceLastUpdate < 15 ? 'bg-green-500'
                      : secondsSinceLastUpdate < 30 ? 'bg-orange-500'
                      : 'bg-red-500';

    // ============================================================
    // 4. COMANDI (INTERRUTTORI)
    // ============================================================
    const toggleSwitch = async (device, state) => {
        try {
            await fetch(controlUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device, state })
            });
            // Aspetta un attimo che Node-RED elabori e ricarica i dati
            setTimeout(fetchData, 500);
        } catch (e) {
            console.error("Errore comando:", e);
        }
    };

    // Esportiamo tutto ciò che serve ai componenti UI
    return {
        data,
        secondsSinceLastUpdate,
        isDataStale,
        statusColor,
        toggleSwitch,
        apiUrl: baseUrl, // URL base per il tasto sblocco modale
        error           // Stato errore per triggerare la modale
    };
};
