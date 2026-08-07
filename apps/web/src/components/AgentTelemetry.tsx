'use client';

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Loader2, 
  Sparkles, 
  Zap,
  Layers,
  Globe,
  ShieldCheck,
  Timer
} from 'lucide-react';

export type PipelineStage = 'pending' | 'researching' | 'synthesizing' | 'complete' | 'failed';

interface AgentTelemetryProps {
  status: PipelineStage;
  isCacheHit?: boolean;
  sourceCount?: number;
  wordCount?: number;
  errorMessage?: string | null;
}

const STAGES = [
  { id: 'cache', label: 'Vector Cache', subtext: 'HNSW Check', icon: Zap },
  { id: 'router', label: 'Query Router', subtext: 'Intent Split', icon: Layers },
  { id: 'retrieval', label: 'Hybrid Search', subtext: 'pgvector + Web', icon: Globe },
  { id: 'evaluation', label: 'Reflection', subtext: 'Fact Verifier', icon: ShieldCheck },
  { id: 'synthesis', label: 'Synthesis', subtext: 'Gemini Stream', icon: Sparkles },
];

export function AgentTelemetry({
  status,
  isCacheHit = false,
  sourceCount = 0,
  wordCount = 0,
}: AgentTelemetryProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'pending' || status === 'researching' || status === 'synthesizing') {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => +(prev + 0.1).toFixed(1));
      }, 100);
    }
    return () => clearInterval(timer);
  }, [status]);

  const getStageState = (stageId: string) => {
    if (status === 'complete') return 'completed';
    if (status === 'failed') return 'failed';
    if (isCacheHit && stageId === 'cache') return 'completed';

    if (status === 'pending') {
      return stageId === 'cache' ? 'active' : 'upcoming';
    }

    if (status === 'researching') {
      if (stageId === 'cache') return 'completed';
      if (stageId === 'router' || stageId === 'retrieval' || stageId === 'evaluation') return 'active';
      return 'upcoming';
    }

    if (status === 'synthesizing') {
      if (stageId === 'synthesis') return 'active';
      return 'completed';
    }

    return 'upcoming';
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'complete':
        return {
          bg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
          label: isCacheHit ? 'COMPLETED (CACHE HIT)' : 'SYNTHESIS COMPLETE',
        };
      case 'failed':
        return {
          bg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
          label: 'PIPELINE HALTED',
        };
      case 'synthesizing':
        return {
          bg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 animate-pulse',
          label: 'STREAMING REASONING',
        };
      case 'researching':
        return {
          bg: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 animate-pulse',
          label: 'PARALLEL RETRIEVAL ACTIVE',
        };
      default:
        return {
          bg: 'bg-slate-800 text-slate-300 border-slate-700',
          label: 'INITIALIZING PIPELINE',
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-slate-800 space-y-3.5">
      
      {/* Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border ${badge.bg}`}>
            {badge.label}
          </span>

          {isCacheHit && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              ⚡ HNSW Sub-10ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs sm:text-sm font-mono text-slate-400">
          {(status === 'pending' || status === 'researching' || status === 'synthesizing') && (
            <div className="flex items-center gap-1.5 text-cyan-400">
              <Timer className="w-4 h-4" />
              <span>{elapsedSeconds}s</span>
            </div>
          )}
          {sourceCount > 0 && <span className="text-emerald-400">{sourceCount} Sources Cited</span>}
          {wordCount > 0 && <span className="hidden sm:inline text-indigo-300">{wordCount} Words</span>}
        </div>
      </div>

      {/* Stepper Pipeline */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
        {STAGES.map((stage) => {
          const state = getStageState(stage.id);
          const Icon = stage.icon;

          let cardStyle = 'border-slate-800/80 bg-slate-950/40 text-slate-500';
          let iconStyle = 'text-slate-600 bg-slate-900 border-slate-800';

          if (state === 'active') {
            cardStyle = 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200 shadow-sm shadow-cyan-500/10';
            iconStyle = 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40 animate-pulse';
          } else if (state === 'completed') {
            cardStyle = 'border-emerald-500/30 bg-emerald-500/5 text-slate-300';
            iconStyle = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
          }

          return (
            <div
              key={stage.id}
              className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-1.5 ${cardStyle}`}
            >
              <div className="flex items-center justify-between">
                <div className={`p-1.5 rounded-lg border ${iconStyle}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {state === 'completed' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                {state === 'active' && (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                )}
              </div>

              <div>
                <p className="text-xs sm:text-sm font-semibold leading-tight line-clamp-1">
                  {stage.label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 font-mono">
                  {stage.subtext}
                </p>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
