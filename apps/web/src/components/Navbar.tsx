'use client';

import React from 'react';
import { 
  Sparkles, 
  FolderArchive, 
  RefreshCw
} from 'lucide-react';

interface NavbarProps {
  isConnected: boolean;
  isProcessing: boolean;
  documentCount: number;
  sessionId: string;
  onResetSession: () => void;
  onToggleVault: () => void;
  isVaultOpen: boolean;
}

export function Navbar({
  isConnected,
  isProcessing,
  documentCount,
  onResetSession,
  onToggleVault,
  isVaultOpen,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#060913]/85 backdrop-blur-xl transition-all">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-4">
        
        {/* Brand Logo & Subtle Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-sm shadow-cyan-500/10">
            <Sparkles className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight text-white">
              Argus
            </span>
            <span className="text-slate-600 text-sm">•</span>
            <span className="text-xs sm:text-sm text-slate-400 font-medium">
              Research Agent
            </span>
          </div>
        </div>

        {/* Right Actions: Status, Vault, Session Reset */}
        <div className="flex items-center gap-2.5">
          
          {/* Connection Dot */}
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs text-slate-300 bg-slate-900/80 border border-slate-800"
            title={isConnected ? "Worker connected" : "Connecting..."}
          >
            <span className={`w-2 h-2 rounded-full ${
              isConnected 
                ? isProcessing 
                  ? 'bg-cyan-400 animate-pulse' 
                  : 'bg-emerald-400 shadow-xs shadow-emerald-400/50' 
                : 'bg-amber-400'
            }`} />
            <span className="text-xs font-mono text-slate-300">
              {isProcessing ? 'Streaming' : isConnected ? 'Online' : 'Connecting'}
            </span>
          </div>

          {/* Knowledge Vault Button */}
          <button
            onClick={onToggleVault}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              isVaultOpen
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-cyan-500/40 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <FolderArchive className="w-4 h-4 text-cyan-400" />
            <span>Vault</span>
            {documentCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {documentCount}
              </span>
            )}
          </button>

          {/* Reset Session */}
          <button
            onClick={onResetSession}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent hover:border-slate-700/60 transition-colors cursor-pointer"
            title="Reset session"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

        </div>

      </div>
    </header>
  );
}
