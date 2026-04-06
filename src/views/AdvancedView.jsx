import React from 'react';
import {
  Activity,
  ShieldCheck,
  Settings2,
  Loader2,
  PlugZap
} from 'lucide-react';

const AdvancedView = ({ manager }) => {
    const { data, toggleSwitch, setShoreLimit, isUpdating } = manager;

    // Amperaggi preimpostati per la banchina
    const limitPresets = [4, 6, 10, 16];
    
    // Lettura stati dal JSON
    const multiplusOn = data?.switches?.multiplus_on || false;
    const currentLimit = data?.switches?.shore_limit || 0;

    return (
        <div className="p-4 space-y-6 pb-32">
            
            {/* ============================================================
                INTESTAZIONE E SPINNER DI CARICAMENTO
                ============================================================ */}
            <header className="px-2 pt-4 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Settings2 className="text-gray-500" size={20} />
                        CONTROLLI AVANZATI
                    </h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                        Gestione Sistemi di Bordo
                    </p>
                </div>

                {/* Spinner: appare in alto a destra durante l'invio dei comandi */}
                {isUpdating && (
                    <div className="bg-cyan-500/20 text-cyan-400 p-2.5 rounded-2xl flex items-center gap-2 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)] animate-pulse">
                        <Loader2 size={18} className="animate-spin" />
                        <span className="text-[10px] font-black uppercase">Sync...</span>
                    </div>
                )}
            </header>

            {/* ============================================================
                SEZIONE MULTIPLUS E SHORE LIMIT
                ============================================================ */}
            <div className="space-y-3">
                <h3 className="text-[10px] font-black text-gray-500 tracking-[0.2em] uppercase px-2">
                    Inverter / Caricabatterie
                </h3>
                
                <div className="bg-white/5 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl divide-y divide-white/5">
                    
                    {/* 1. SWITCH MODALITÀ (ON / SOLO INVERTER) */}
                    <div className="flex items-center justify-between p-6 bg-white/[0.02]">
                        <div className="flex items-center gap-4">
                            {/* Icona dinamica: gialla se ON, grigia se Solo Inverter */}
                            <div className={`p-3 rounded-2xl transition-all duration-500 ${multiplusOn ? 'bg-yellow-500/20 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'bg-white/5 grayscale opacity-30'}`}>
                                <Activity className={multiplusOn ? "text-yellow-500" : "text-white"} size={28} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[15px] font-black text-white tracking-tight uppercase">Banchina</span>
                                <span className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${multiplusOn ? 'text-yellow-500' : 'text-gray-500'}`}>
                                    {multiplusOn ? "Stato: ACCESO (Pass-through)" : "Stato: SOLO INVERTER"}
                                </span>
                            </div>
                        </div>

                        {/* Switch interattivo */}
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={multiplusOn}
                                onChange={(e) => toggleSwitch('multiplus', e.target.checked)}
                                disabled={isUpdating}
                            />
                            <div className={`w-14 h-8 rounded-full peer transition-all shadow-inner relative after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:translate-x-6 ${multiplusOn ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)]' : 'bg-gray-800'} ${isUpdating ? 'opacity-50' : ''}`}></div>
                        </label>
                    </div>

                    {/* 2. CONTROLLO LIMITE CORRENTE BANCHINA */}
                    {/* Questa sezione si opacizza se il Multiplus non è ON (banchina ignorata) */}
                    <div className={`p-6 transition-all duration-700 ${multiplusOn ? 'opacity-100' : 'opacity-20 grayscale pointer-events-none'}`}>
                        <div className="flex justify-between items-end mb-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-cyan-500/10 rounded-xl">
                                    <PlugZap size={20} className="text-cyan-400" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-black uppercase text-white tracking-tight">Limite Banchina</span>
                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Seleziona Ampere AC</span>
                                </div>
                            </div>
                            {/* Display Valore Attuale */}
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black font-mono text-cyan-400">{currentLimit.toFixed(0)}</span>
                                <span className="text-sm font-bold text-gray-600">A</span>
                            </div>
                        </div>

                        {/* Tasti Selezione Rapida (4, 6, 10, 16A) */}
                        <div className="flex gap-2.5 w-full mt-2">
                            {limitPresets.map((amps) => (
                                <button
                                    key={amps}
                                    onClick={() => setShoreLimit(amps)}
                                    disabled={isUpdating || !multiplusOn}
                                    className={`flex-1 py-4 rounded-2xl font-black font-mono transition-all active:scale-90 border ${
                                        currentLimit === amps
                                            ? 'bg-cyan-500 border-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                                            : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'
                                    }`}
                                >
                                    {amps}A
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 3. PROSSIMAMENTE / ALTRO */}
                    <div className="p-6 flex items-center justify-between opacity-10 grayscale">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/5 rounded-2xl text-gray-400">
                                <ShieldCheck size={26} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-black text-white uppercase tracking-tight">Safe Power Mode</span>
                                <span className="text-[9px] font-bold text-gray-500 uppercase">Configurazione automatica carichi</span>
                            </div>
                        </div>
                        <div className="w-10 h-5 bg-gray-900 rounded-full border border-white/5"></div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default AdvancedView;
