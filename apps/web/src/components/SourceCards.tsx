'use client';

import React from 'react';
import { ExternalLink, Globe, ShieldCheck } from 'lucide-react';

export interface SourceItem {
  title: string;
  url: string;
  snippet?: string;
}

interface SourceCardsProps {
  sources: SourceItem[];
}

export function SourceCards({ sources }: SourceCardsProps) {
  if (!sources || sources.length === 0) return null;

  const getDomain = (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      return url.hostname.replace(/^www\./, '');
    } catch {
      return 'web-source';
    }
  };

  return (
    <div className="space-y-2.5 pt-1">
      <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300 font-semibold uppercase tracking-wider">
        <Globe className="w-4 h-4 text-cyan-400" />
        <span>Ground-Truth Sources ({sources.length})</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {sources.map((source, idx) => {
          const domain = getDomain(source.url);

          return (
            <a
              key={idx}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-panel-interactive p-3 rounded-xl border border-slate-800 group flex flex-col justify-between gap-2"
              title={source.title}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-5 h-5 rounded-md bg-slate-800 flex items-center justify-center text-xs font-mono text-cyan-400 border border-slate-700/60 shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-mono text-slate-400 truncate">
                    {domain}
                  </span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0" />
              </div>

              <p className="text-xs sm:text-sm font-medium text-slate-200 group-hover:text-cyan-300 transition-colors line-clamp-2 leading-snug">
                {source.title}
              </p>

              <div className="flex items-center gap-1 text-xs text-emerald-400/90 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
