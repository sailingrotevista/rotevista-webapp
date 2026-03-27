import { useState, useEffect } from 'react';

const getBaseUrl = () => {
    const host = window.location.hostname;
    // Se siamo su localhost, puntiamo comunque all'IP reale della barca in HTTPS
    if (host === 'localhost' || host === '127.0.0.1') {
        return 'https://192.168.111.240:1881';
    }
    // Se carichiamo la pagina da un altro dispositivo usando l'IP del Mac,
    // puntiamo comunque alla barca in HTTPS
    return 'https://192.168.111.240:1881';
};

export const useBoatData = () => {
    const [data, setData] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState(0);
    const [isDataStale, setIsDataStale] = useState(true);

    const fetchData = async () => {
        try {
            const response = await fetch(`${getBaseUrl()}/api/boat`);
            const jsonData = await response.json();
            setData(jsonData);
            setLastUpdate(new Date());
            setIsDataStale(false);
        } catch (e) {
            console.error("Errore nel recupero dati:", e);
            setIsDataStale(true);
        }
    };

    // 1. EFFETTO POLLING: Carica i dati ogni 5 secondi
    // [] significa che parte solo una volta all'avvio dell'app
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    // 2. EFFETTO WATCHDOG: Aggiorna il contatore dei secondi ogni secondo
    // Questo dipende da lastUpdate ma non lo modifica, quindi niente loop!
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

    const statusColor = secondsSinceLastUpdate < 15 ? 'bg-green-500' : (secondsSinceLastUpdate < 30 ? 'bg-orange-500' : 'bg-red-500');

    const toggleSwitch = async (device, state) => {
        try {
            await fetch(`${getBaseUrl()}/api/boat/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device, state })
            });
            setTimeout(fetchData, 500); // Aspetta mezzo secondo e aggiorna
        } catch (e) { console.error("Errore comando:", e); }
    };

    return {
        data,
        secondsSinceLastUpdate,
        isDataStale,
        statusColor,
        toggleSwitch,
        apiUrl: getBaseUrl()
    };
};
