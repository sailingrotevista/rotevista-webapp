/* --- File: src/App.jsx --- */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Radar, Zap, Wind, SlidersHorizontal, Moon, Sun, Loader2 } from 'lucide-react';
import { useBoatData } from './hooks/useBoatData';
import HomeView from './views/HomeView';
import AisView from './views/AisView';
import EnergyView from './views/EnergyView';
import EnvironmentView from './views/EnvironmentView';
import AdvancedView from './views/AdvancedView';
import logo from './assets/AppIcon.png';

function App() {
  // Ripristina l'ultimo tab salvato o dà priorità al Deep Link Telegram
  const [selectedTab, setSelectedTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mmsi')) return 3; // Priorità Deep Link AIS
    const saved = localStorage.getItem('rotevista_active_tab');
    return saved !== null ? parseInt(saved, 10) : 0;
  });

  const [direction, setDirection] = useState(0);
  // Ripristina la modalità Notte salvata per non abbagliare al refresh
  const [isNightMode, setIsNightMode] = useState(() => {
    return localStorage.getItem('rotevista_night_mode') === 'true';
  });

  // Lettura sincrona immediata del parametro ?mmsi=... prima del primo render
  const [deepLinkMmsi, setDeepLinkMmsi] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mmsi') || null;
  });
  const manager = useBoatData();

  // Rileva se l'app è stata aperta da un link Telegram con parametro ?mmsi=...
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mmsi = params.get('mmsi');
    if (mmsi) {
      setDeepLinkMmsi(mmsi);
      setSelectedTab(3);
      localStorage.setItem('rotevista_active_tab', '3');
    }
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.error(e));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  // Cambio scheda con salvataggio persistente in memoria locale
  const changeTab = (newTab) => {
    if (newTab === selectedTab) return;
    setDirection(newTab > selectedTab ? 1 : -1);
    setSelectedTab(newTab);
    localStorage.setItem('rotevista_active_tab', String(newTab));
  };

  const onDragEnd = (event, info) => {
    if (event.target.closest('.leaflet-container')) return;
    const swipeThreshold = 50;
    if (info.offset.x < -swipeThreshold && selectedTab < 4) changeTab(selectedTab + 1);
    else if (info.offset.x > swipeThreshold && selectedTab > 0) changeTab(selectedTab - 1);
  };

  const variants = {
    enter: (direction) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction) => ({ x: direction < 0 ? '100%' : '-100%', opacity: 0 }),
  };

  return (
    /* h-[100dvh] adatta l'app dinamicamente sia con la barra di Safari che in Full Screen PWA */
    <div className={`h-screen h-[100dvh] bg-[#121212] flex flex-col font-sans overflow-hidden select-none transition-colors duration-700 ${isNightMode ? 'night-mode-active' : ''}`}>
      
      {/* HEADER FISSO: Altezza ridotta in landscape per recuperare spazio */}
      <header
        onClick={toggleFullscreen}
        className="fixed top-0 left-0 right-0 z-[1000] h-16 bg-[#121212]/80 backdrop-blur-lg border-b border-white/10 px-4 flex items-center justify-between cursor-pointer">
        <div className="flex items-center gap-3">
          {/* Logo e Titolo mantengono la stessa dimensione in ogni orientamento */}
          <img src={logo} alt="Logo" className="w-9 h-9 rounded-lg object-cover bg-white/10 shadow-lg" />
          <h1 className="text-xl font-black tracking-widest uppercase font-mono text-white">ROTEVISTA</h1>
        </div>
        
        <div className="flex items-center gap-3">
          {/* SPINNER DI SINCRONIZZAZIONE (GLOBALE) */}
          {manager.isUpdating && (
            <div className="flex items-center gap-1.5 text-cyan-400 animate-pulse bg-cyan-400/10 px-2.5 py-1 rounded-lg border border-cyan-400/20 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-[10px] font-black uppercase font-mono">Sync</span>
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              const nextMode = !isNightMode;
              setIsNightMode(nextMode);
              localStorage.setItem('rotevista_night_mode', String(nextMode));
            }}
            className={`p-2 rounded-xl border transition-all active:scale-95 ${isNightMode ? 'bg-red-500/20 border-red-500/50 text-red-500' : 'bg-white/5 border-white/10 text-gray-400'}`}
          >
            {isNightMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10 shadow-inner font-mono">
            <span className="text-xs font-bold text-gray-400">{manager.isDataStale ? "OFF" : `${manager.secondsSinceLastUpdate}s`}</span>
            <div className={`w-2 h-2 rounded-full ${manager.statusColor} shadow-[0_0_8px_currentColor]`}></div>
          </div>
        </div>
      </header>

      {/* MAIN: Altezza dinamica fluida */}
      <main className="flex-1 relative mt-16 landscape:mt-14 h-[calc(100%-4rem)] landscape:h-[calc(100%-3.5rem)] w-full">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={selectedTab}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: "spring", stiffness: 300, damping: 32 }, opacity: { duration: 0.2 } }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.15} onDragEnd={onDragEnd}
            onPointerDownCapture={(e) => { if (e.target.closest('.leaflet-container')) e.stopPropagation(); }}
            className="absolute inset-0 w-full h-full overflow-y-auto px-1 scroll-smooth"
          >
            {selectedTab === 0 && <HomeView manager={manager} onTabChange={changeTab} />}
            {selectedTab === 1 && <EnergyView manager={manager} />}
            {selectedTab === 2 && <EnvironmentView manager={manager} />}
            {selectedTab === 3 && <AisView manager={manager} isNightMode={isNightMode} initialMmsi={deepLinkMmsi} />}
            {selectedTab === 4 && <AdvancedView manager={manager} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-full px-4 py-2 flex items-center justify-around w-[92%] max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-[1001]">
        <TabItem icon={<Home />} label="Home" isActive={selectedTab === 0} onClick={() => changeTab(0)} />
        <TabItem icon={<Zap />} label="Energia" isActive={selectedTab === 1} onClick={() => changeTab(1)} />
        <TabItem icon={<Wind />} label="Ambiente" isActive={selectedTab === 2} onClick={() => changeTab(2)} />
        <TabItem icon={<Radar />} label="AIS" isActive={selectedTab === 3} onClick={() => changeTab(3)} />
        <TabItem icon={<SlidersHorizontal />} label="Extra" isActive={selectedTab === 4} onClick={() => changeTab(4)} />
      </nav>
    </div>
  );
}

const TabItem = ({ icon, label, isActive, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? 'text-cyan-400 scale-110' : 'text-gray-300'}`}>
    {React.cloneElement(icon, { size: 20, strokeWidth: isActive ? 2.5 : 2 })}
    <span className={`text-[9px] font-black uppercase tracking-tighter ${isActive ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
  </button>
);

export default App;
