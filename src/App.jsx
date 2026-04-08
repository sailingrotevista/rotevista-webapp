import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Zap, Wind, SlidersHorizontal,
  Moon, Sun, Loader2
} from 'lucide-react';

// Hook personalizzato per i dati della barca
import { useBoatData } from './hooks/useBoatData';

// Viste dei Tab
import HomeView from './views/HomeView';
import EnergyView from './views/EnergyView';
import EnvironmentView from './views/EnvironmentView';
import AdvancedView from './views/AdvancedView';

// Asset Logo
import logo from './assets/AppIcon.png';

/**
 * COMPONENTE PRINCIPALE: App
 * Gestisce il layout globale, la navigazione (Swipe/Tab) e le modalità di visualizzazione (Night/Fullscreen)
 */
function App() {
  // --- STATI DI NAVIGAZIONE ---
  const [selectedTab, setSelectedTab] = useState(0);
  const [direction, setDirection] = useState(0); // 1 per scivolamento a dx, -1 a sx
  
  // --- STATI INTERFACCIA ---
  const [isNightMode, setIsNightMode] = useState(false);
  
  // Recupero dati e funzioni dal manager centrale
  const manager = useBoatData();

  // ============================================================
  // 1. LOGICA FULLSCREEN (Doppio click sull'Header)
  // ============================================================
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Errore Fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  // ============================================================
  // 2. LOGICHE DI NAVIGAZIONE (Tab e Swipe)
  // ============================================================
  const changeTab = (newTab) => {
    if (newTab === selectedTab) return;
    setDirection(newTab > selectedTab ? 1 : -1);
    setSelectedTab(newTab);
  };

  const onDragEnd = (event, info) => {
    // Se stiamo toccando la mappa, non facciamo lo swipe di pagina
    if (event.target.closest('.leaflet-container')) return;

    const swipeThreshold = 50; // Sensibilità dello swipe
    if (info.offset.x < -swipeThreshold && selectedTab < 3) {
      changeTab(selectedTab + 1);
    } else if (info.offset.x > swipeThreshold && selectedTab > 0) {
      changeTab(selectedTab - 1);
    }
  };

  // Configurazioni per l'animazione di scivolamento
  const variants = {
    enter: (direction) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction) => ({ x: direction < 0 ? '100%' : '-100%', opacity: 0 }),
  };

  // ============================================================
  // 3. RENDERING INTERFACCIA
  // ============================================================
  return (
    <div className={`min-h-screen bg-[#121212] flex flex-col font-sans overflow-hidden select-none transition-colors duration-700 ${isNightMode ? 'night-mode-active' : ''}`}>
      
      {/* HEADER FISSO: Contiene Logo, Titolo, Night Mode e Status Connessione */}
      <header
        onDoubleClick={toggleFullscreen}
        className="fixed top-0 left-0 right-0 z-[1000] bg-[#121212]/80 backdrop-blur-lg border-b border-white/10 px-4 py-3 flex items-center justify-between cursor-pointer"
      >
        {/* Lato Sinistro: Branding */}
        <div className="flex items-center gap-3">
          <img src={logo} alt="Logo" className="w-9 h-9 rounded-lg object-cover bg-white/10 shadow-lg" />
          <h1 className="text-xl font-black tracking-widest uppercase font-mono text-white">ROTEVISTA</h1>
        </div>
        
        {/* Lato Destro: Controlli e Stato */}
        <div className="flex items-center gap-3">
          {/* Tasto Modalità Notte */}
          <button
            onClick={(e) => { e.stopPropagation(); setIsNightMode(!isNightMode); }}
            className={`p-2.5 rounded-xl border transition-all active:scale-90 ${
              isNightMode
                ? 'bg-red-500/20 border-red-500/50 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
            }`}
          >
            {isNightMode ? <Sun size={18} strokeWidth={2.5} /> : <Moon size={18} strokeWidth={2.5} />}
          </button>

          {/* Monitor Connessione (Watchdog) */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10 shadow-inner font-mono">
            <span className="text-xs font-bold text-gray-400">
              {manager.isDataStale ? "OFF" : `${manager.secondsSinceLastUpdate}s`}
            </span>
            <div className={`w-2 h-2 rounded-full ${manager.statusColor} shadow-[0_0_10px_currentColor]`}></div>
          </div>
        </div>
      </header>

      {/* CONTENUTO PRINCIPALE: Gestione Tab con animazioni e Swipe */}
      <main className="flex-1 relative mt-16 pb-32 h-full w-full">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={selectedTab}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: "spring", stiffness: 300, damping: 32 }, opacity: { duration: 0.2 } }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={onDragEnd}
            
            // Intercetta il tocco della mappa per impedire lo scorrimento del tab
            onPointerDownCapture={(e) => {
              if (e.target.closest('.leaflet-container')) e.stopPropagation();
            }}
            
            className="absolute inset-0 w-full h-full overflow-y-auto px-1 scroll-smooth"
          >
            {/* Router delle Viste */}
            {selectedTab === 0 && <HomeView manager={manager} onTabChange={changeTab} />}
            {selectedTab === 1 && <EnergyView manager={manager} />}
            {selectedTab === 2 && <EnvironmentView manager={manager} />}
            {selectedTab === 3 && <AdvancedView manager={manager} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* BARRA DI NAVIGAZIONE: Floating TabBar in stile iOS */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-full px-6 py-3 flex gap-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-[1001] transition-all duration-700">
        <TabItem icon={<Home />} label="Home" isActive={selectedTab === 0} onClick={() => changeTab(0)} />
        <TabItem icon={<Zap />} label="Energia" isActive={selectedTab === 1} onClick={() => changeTab(1)} />
        <TabItem icon={<Wind />} label="Ambiente" isActive={selectedTab === 2} onClick={() => changeTab(2)} />
        <TabItem icon={<SlidersHorizontal />} label="Extra" isActive={selectedTab === 3} onClick={() => changeTab(3)} />
      </nav>

    </div>
  );
}

/**
 * SOTTO-COMPONENTE: TabItem
 * Singolo elemento della barra di navigazione
 */
const TabItem = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 transition-all duration-300 ${
      isActive ? 'text-cyan-400 scale-110 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'text-gray-500 hover:text-gray-300'
    }`}
  >
    {React.cloneElement(icon, { size: 20, strokeWidth: isActive ? 2.5 : 2 })}
    <span className={`text-[9px] font-black uppercase tracking-tighter transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'}`}>
      {label}
    </span>
  </button>
);

export default App;
