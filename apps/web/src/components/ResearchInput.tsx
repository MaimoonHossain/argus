'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  FolderArchive, 
  ArrowUp,
  Layers, 
  Globe, 
  FileText, 
  Scale,
  CornerDownLeft
} from 'lucide-react';

export type ResearchMode = 'hybrid' | 'web' | 'documents' | 'comparison';

interface ResearchInputProps {
  onSubmit: (question: string, mode?: ResearchMode) => void;
  isProcessing: boolean;
  onOpenVault: () => void;
  documentCount: number;
}

const STARTER_PROMPTS = [
  {
    title: 'Architecture Comparison',
    question: 'Compare Next.js App Router vs Pages Router across server components, performance, and ergonomics.',
    badge: 'Comparison',
    mode: 'comparison' as ResearchMode,
  },
  {
    title: 'Autonomous Multi-Agent Graphs',
    question: 'How do LangGraph state machines compare to CrewAI for cyclic agent execution and resilience?',
    badge: 'Hybrid RAG',
    mode: 'hybrid' as ResearchMode,
  },
  {
    title: 'Reciprocal Rank Fusion',
    question: 'Explain how RRF (k=60) merges sparse BM25 / Postgres FTS with dense HNSW vector embeddings.',
    badge: 'Vector Search',
    mode: 'documents' as ResearchMode,
  }
];

export function ResearchInput({
  onSubmit,
  isProcessing,
  onOpenVault,
  documentCount,
}: ResearchInputProps) {
  const [query, setQuery] = useState('');
  const [activeMode, setActiveMode] = useState<ResearchMode>('hybrid');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleFormSubmit();
    }
  };

  const handleFormSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery || cleanQuery.length < 10 || isProcessing) return;
    onSubmit(cleanQuery, activeMode);
  };

  const handleSelectStarter = (starterQuestion: string, starterMode: ResearchMode) => {
    setQuery(starterQuestion);
    setActiveMode(starterMode);
    onSubmit(starterQuestion, starterMode);
  };

  const isValidLength = query.trim().length >= 10;

  return (
    <div className="w-full space-y-3.5">
      
      {/* Main Terminal Box */}
      <form
        onSubmit={handleFormSubmit}
        className="glass-panel rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl transition-all focus-within:border-cyan-500/50 focus-within:shadow-cyan-500/10 focus-within:shadow-2xl"
      >
        {/* Research Modes Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 mb-2.5 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">
              Mode:
            </span>

            <button
              type="button"
              onClick={() => setActiveMode('hybrid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeMode === 'hybrid'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Hybrid Intelligence</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('web')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeMode === 'web'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Live Web</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('documents')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeMode === 'documents'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Document Vault</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('comparison')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeMode === 'comparison'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Compare Matrix</span>
            </button>
          </div>

          {/* Quick attach shortcut button */}
          <button
            type="button"
            onClick={onOpenVault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-cyan-300 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/30 transition-all cursor-pointer"
          >
            <FolderArchive className="w-4 h-4 text-cyan-400" />
            <span>Vault ({documentCount})</span>
          </button>
        </div>

        {/* Textarea Input */}
        <div className="relative flex items-start gap-3 pt-1">
          <textarea
            ref={textareaRef}
            rows={2}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Argus to research any topic, compare technologies, or synthesize uploaded documents..."
            className="w-full bg-transparent text-white placeholder-slate-500 text-sm sm:text-base resize-none focus:outline-none leading-relaxed min-h-[56px]"
            disabled={isProcessing}
          />
        </div>

        {/* Bottom Bar: Status & Launch */}
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>{query.trim().length} chars</span>
            {!isValidLength && query.trim().length > 0 && (
              <span className="text-amber-400 font-sans text-xs">
                (Min 10 characters)
              </span>
            )}
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="hidden sm:inline text-slate-500 font-sans text-xs">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono">Ctrl+Enter</kbd> to run
            </span>
          </div>

          <button
            type="submit"
            disabled={!isValidLength || isProcessing}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold tracking-wide transition-all cursor-pointer ${
              isValidLength && !isProcessing
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
            }`}
          >
            {isProcessing ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin text-slate-950" />
                <span>Researching...</span>
              </>
            ) : (
              <>
                <span>Launch Agent</span>
                <CornerDownLeft className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Starter Prompts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        {STARTER_PROMPTS.map((starter, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSelectStarter(starter.question, starter.mode)}
            disabled={isProcessing}
            className="text-left p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-850 hover:border-slate-700/80 group transition-all cursor-pointer flex flex-col justify-between gap-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                {starter.title}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-400 border border-slate-700/50 group-hover:border-cyan-500/30 group-hover:text-cyan-300">
                {starter.badge}
              </span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
              {starter.question}
            </p>
          </button>
        ))}
      </div>

    </div>
  );
}
