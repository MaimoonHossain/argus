'use client';

import React, { useState } from 'react';
import { Copy, Check, Scale, Loader2 } from 'lucide-react';

interface ComparisonTableProps {
  jsonPayload: string;
  isClosed?: boolean;
}

export default function ComparisonTable({ jsonPayload, isClosed = false }: ComparisonTableProps) {
  const [copied, setCopied] = useState(false);

  try {
    const cleanedJson = jsonPayload.replace(/```json|```/g, '').trim();
    const rows = JSON.parse(cleanedJson);

    if (!Array.isArray(rows) || rows.length === 0) return null;

    const columns = Object.keys(rows[0]);

    const handleCopyMarkdown = () => {
      const header = `| ${columns.join(' | ')} |`;
      const divider = `| ${columns.map(() => '---').join(' | ')} |`;
      const body = rows
        .map((r) => `| ${columns.map((c) => r[c] || '').join(' | ')} |`)
        .join('\n');
      
      const tableMd = `${header}\n${divider}\n${body}`;
      navigator.clipboard.writeText(tableMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="my-6 space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30">
              <Scale className="w-4 h-4" />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-violet-300 uppercase tracking-wider">
              Comparative Analysis Matrix
            </span>
          </div>

          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono text-slate-300 hover:text-cyan-300 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            title="Copy as Markdown Table"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 shadow-xl">
          <table className="w-full text-left text-xs sm:text-sm text-slate-300">
            <thead className="bg-slate-900/90 text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-200 border-b border-slate-800">
              <tr>
                {columns.map((col, idx) => (
                  <th 
                    key={col} 
                    className={`px-5 py-3.5 font-bold ${
                      idx === 0 ? 'text-cyan-400 bg-cyan-950/30' : 'text-slate-200'
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((row: Record<string, any>, rIdx: number) => (
                <tr key={rIdx} className="hover:bg-slate-850/50 transition-colors duration-150">
                  {columns.map((col, cIdx) => (
                    <td 
                      key={col} 
                      className={`px-5 py-3.5 leading-relaxed ${
                        cIdx === 0 
                          ? 'font-semibold text-white bg-slate-900/40 border-r border-slate-800/40' 
                          : 'text-slate-300'
                      }`}
                    >
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (error) {
    if (isClosed) return null;

    return (
      <div className="my-5 p-4 rounded-xl border border-violet-500/30 bg-violet-500/10 flex items-center gap-2.5 text-xs sm:text-sm text-violet-300 animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
        <span>Synthesizing comparative analysis matrix...</span>
      </div>
    );
  }
}
