/* --- File: src/App.jsx --- */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Zap, Wind, SlidersHorizontal, Moon, Sun, Loader2 } from 'lucide-react';
import { useBoatData } from './hooks/useBoatData';
import HomeView from './views/HomeView';
import EnergyView from './views/EnergyView';
import EnvironmentView from './views/EnvironmentView';
import AdvancedView from './views/AdvancedView';
import logo from './assets/AppIcon.png';

function App() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isNightMode, setIsNightMode] = useState(false);
  const manager = useBoatData();

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.error(e));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const changeTab = (newTab) => {
    if (newTab === selectedTab) return;
    setDirection(newTab > selectedTab ? 1 : -1);
    setSelectedTab(newTab);
  };

  const onDragEnd = (event, info) => {
    if (event.target.closest('.leaflet-container')) return;
    const swipeThreshold = 50;
    if (info.offset.x < -swipeThreshold && selectedTab < 3) changeTab(selectedTab + 1);
    else if (info.offset.x > swipeThreshold && selectedTab > 0) changeTab(selectedTab - 1);
  };

  const variants = {
    enter: (direction) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction) => ({ x: direction < 0 ? '100%' : '-100%', opacity: 0 }),
  };

  return (
    <div className={`min-h-screen bg-[#121212] flex flex-col font-sans overflow-hidden select-none transition-colors duration-700 ${isNightMode ? 'night-mode-active' : ''}`}>
      
      {/* HEADER FISSO: Altezza ridotta in landscape per recuperare spazio */}
      <header
        onDoubleClick={toggleFullscreen}
        className="fixed top-0 left-0 right-0 z-[1000] bg-[#121212]/80 backdrop-blur-lg border-b border-white/10 px-4 py-2 landscape:py-1.5 flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <img src={logo} alt="Logo" className="w-8 h-8 landscape:w-7 landscape:h-7 rounded-lg object-cover bg-white/10 shadow-lg" />
          <h1 className="text-xl landscape:text-lg font-black tracking-widest uppercase font-mono text-white text-shadow-sm">ROTEVISTA</h1>
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
            onClick={(e) => { e.stopPropagation(); setIsNightMode(!isNightMode); }}
            className={`p-2 rounded-xl border transition-all active:scale-90 ${isNightMode ? 'bg-red-500/20 border-red-500/50 text-red-500' : 'bg-white/5 border-white/10 text-gray-400'}`}
          >
            {isNightMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10 shadow-inner font-mono">
            <span className="text-xs font-bold text-gray-400">{manager.isDataStale ? "OFF" : `${manager.secondsSinceLastUpdate}s`}</span>
            <div className={`w-2 h-2 rounded-full ${manager.statusColor} shadow-[0_0_8px_currentColor]`}></div>
          </div>
        </div>
      </header>

      {/* MAIN: Margine mt-16 ridotto a mt-12 in landscape per non far scivolare i blocchi */}
      <main className="flex-1 relative mt-14 landscape:mt-15 pb-32 h-full w-full">
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
            {selectedTab === 3 && <AdvancedView manager={manager} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-full px-6 py-3 flex gap-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-[1001]">
        <TabItem icon={<Home />} label="Home" isActive={selectedTab === 0} onClick={() => changeTab(0)} />
        <TabItem icon={<Zap />} label="Energia" isActive={selectedTab === 1} onClick={() => changeTab(1)} />
        <TabItem icon={<Wind />} label="Ambiente" isActive={selectedTab === 2} onClick={() => changeTab(2)} />
        <TabItem icon={<SlidersHorizontal />} label="Extra" isActive={selectedTab === 3} onClick={() => changeTab(3)} />
      </nav>
    </div>
  );
}

const TabItem = ({ icon, label, isActive, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? 'text-cyan-400 scale-110' : 'text-gray-500'}`}>
    {React.cloneElement(icon, { size: 20, strokeWidth: isActive ? 2.5 : 2 })}
    <span className={`text-[9px] font-black uppercase tracking-tighter ${isActive ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
  </button>
);

export default App;
