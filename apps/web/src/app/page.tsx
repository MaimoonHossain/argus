// apps/web/src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Navbar } from '@/components/Navbar';
import { KnowledgeVault, UploadedDoc } from '@/components/KnowledgeVault';
import { ResearchInput, ResearchMode } from '@/components/ResearchInput';
import { AgentTelemetry } from '@/components/AgentTelemetry';
import { SourceCards, SourceItem } from '@/components/SourceCards';
import { MessageRenderer } from '@/components/MessageRenderer';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { 
  Sparkles, 
  Copy, 
  Check, 
  Download, 
  History, 
  ChevronRight, 
  Trash2,
  Loader2
} from 'lucide-react';

export type JobResult = {
  id: string;
  status: 'pending' | 'researching' | 'synthesizing' | 'complete' | 'failed';
  finalAnswer?: string | null;
  errorMessage?: string | null;
  sources?: SourceItem[];
  isCacheHit?: boolean;
  question?: string;
  timestamp?: string;
};

let socket: Socket;

export default function Home() {
  const [sessionId, setSessionId] = useState<string>('ssr-session');
  const [isConnected, setIsConnected] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [history, setHistory] = useState<JobResult[]>([]);
  
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobResult | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  // Initialize Session ID & Load initial states
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let savedSession = localStorage.getItem('argus_session_id');
      if (!savedSession) {
        savedSession = crypto.randomUUID();
        localStorage.setItem('argus_session_id', savedSession);
      }
      setSessionId(savedSession);

      // Load history
      const savedHistory = localStorage.getItem(`argus_history_${savedSession}`);
      if (savedHistory) {
        try {
          setHistory(JSON.parse(savedHistory));
        } catch {
          // fallback
        }
      }

      // Initial DB sync for documents
      fetch(`/api/ingest?sessionId=${encodeURIComponent(savedSession)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.documents)) {
            setDocuments(data.documents);
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleDocumentAdded = (newDoc: UploadedDoc) => {
    setDocuments((prev) => [newDoc, ...prev.filter((d) => d.name !== newDoc.name)]);
  };

  const handleDocumentDeleted = (filename: string) => {
    setDocuments((prev) => prev.filter((d) => d.name !== filename));
  };

  const handleClearDocuments = () => {
    setDocuments([]);
  };

  const handleSyncDocuments = (docs: UploadedDoc[]) => {
    setDocuments(docs);
  };

  const handleResetSession = () => {
    if (typeof window !== 'undefined') {
      const newSession = crypto.randomUUID();
      localStorage.setItem('argus_session_id', newSession);
      setSessionId(newSession);
      setDocuments([]);
      setHistory([]);
      setActiveJob(null);
      setCurrentJobId(null);
    }
  };

  // Socket Connection Lifecycle
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[Argus Stream] Connected:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[Argus Stream] Disconnected');
      setIsConnected(false);
    });

    // Listen for state transitions
    socket.on('job-update', (data: JobResult) => {
      setCurrentJobId((latestJobId) => {
        if (data.id === latestJobId) {
          setActiveJob((prev) => {
            const updated = { ...prev, ...data };
            if (data.status === 'complete' || data.status === 'failed') {
              saveJobToHistory(updated);
            }
            return updated;
          });
        }
        return latestJobId;
      });
    });

    // Listen for live text chunks
    socket.on('job-stream', (data: { id: string; chunk: string }) => {
      setCurrentJobId((latestJobId) => {
        if (data.id === latestJobId) {
          setActiveJob((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              finalAnswer: (prev.finalAnswer || '') + data.chunk,
            };
          });
        }
        return latestJobId;
      });
    });

    // Listen for incoming source citations
    socket.on('job-sources', (data: { id: string; sources: SourceItem[] }) => {
      setCurrentJobId((latestJobId) => {
        if (data.id === latestJobId) {
          setActiveJob((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              sources: data.sources,
            };
          });
        }
        return latestJobId;
      });
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, [sessionId]);

  const saveJobToHistory = (jobToSave: JobResult) => {
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== jobToSave.id);
      const updated = [jobToSave, ...filtered].slice(0, 10);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`argus_history_${sessionId}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`argus_history_${sessionId}`);
    }
  };

  const submitResearch = async (targetQuestion: string, mode: ResearchMode = 'hybrid') => {
    const q = targetQuestion.trim();
    if (!q) return;

    const initialJob: JobResult = {
      id: 'pending-' + Date.now(),
      status: 'pending',
      question: q,
      finalAnswer: '',
      sources: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setActiveJob(initialJob);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, sessionId, mode }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        const failedJob: JobResult = {
          id: 'error-' + Date.now(),
          status: 'failed',
          question: q,
          errorMessage: errorData.error || 'Failed to submit query.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setActiveJob(failedJob);
        saveJobToHistory(failedJob);
        return;
      }

      const data = await res.json();

      if (data.cached && data.job) {
        const cachedJob: JobResult = {
          id: data.jobId,
          status: 'complete',
          question: q,
          finalAnswer: data.job.finalAnswer,
          sources: data.job.sources || [],
          isCacheHit: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setCurrentJobId(data.jobId);
        setActiveJob(cachedJob);
        saveJobToHistory(cachedJob);
      } else if (data.jobId) {
        setCurrentJobId(data.jobId);
        setActiveJob({
          id: data.jobId,
          status: 'pending',
          question: q,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch (error: any) {
      const networkErrorJob: JobResult = {
        id: 'error-' + Date.now(),
        status: 'failed',
        question: q,
        errorMessage: error?.message || 'Network communication failure.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setActiveJob(networkErrorJob);
      saveJobToHistory(networkErrorJob);
    }
  };

  const handleCopyReport = () => {
    if (!activeJob?.finalAnswer) return;
    const header = `# ${activeJob.question || 'Research Report'}\n\n`;
    const body = activeJob.finalAnswer;
    const sourcesMd = activeJob.sources && activeJob.sources.length > 0
      ? `\n\n## Sources\n` + activeJob.sources.map(s => `- [${s.title}](${s.url})`).join('\n')
      : '';

    navigator.clipboard.writeText(header + body + sourcesMd);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const handleDownloadReport = () => {
    if (!activeJob?.finalAnswer) return;
    const header = `# ${activeJob.question || 'Research Report'}\n\n*Generated by Argus Research Agent*\n\n`;
    const body = activeJob.finalAnswer;
    const sourcesMd = activeJob.sources && activeJob.sources.length > 0
      ? `\n\n## Sources\n` + activeJob.sources.map(s => `- [${s.title}](${s.url})`).join('\n')
      : '';

    const blob = new Blob([header + body + sourcesMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `argus-research-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isProcessing = activeJob?.status === 'pending' || activeJob?.status === 'researching' || activeJob?.status === 'synthesizing';
  const wordCount = activeJob?.finalAnswer ? activeJob.finalAnswer.trim().split(/\s+/).length : 0;

  return (
    <div className="min-h-screen flex flex-col justify-between">
      
      {/* Knowledge Vault Drawer */}
      <KnowledgeVault
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        sessionId={sessionId}
        documents={documents}
        onDocumentAdded={handleDocumentAdded}
        onDocumentDeleted={handleDocumentDeleted}
        onClearDocuments={handleClearDocuments}
        onSyncDocuments={handleSyncDocuments}
      />

      {/* Top Navbar */}
      <Navbar
        isConnected={isConnected}
        isProcessing={isProcessing}
        documentCount={documents.length}
        sessionId={sessionId}
        onResetSession={handleResetSession}
        onToggleVault={() => setIsVaultOpen(!isVaultOpen)}
        isVaultOpen={isVaultOpen}
      />

      {/* Main Workspace */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-7">
        
        {/* Hero Section */}
        <div className="text-center space-y-3 pt-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs sm:text-sm font-mono font-medium">
            <Sparkles className="w-4 h-4 animate-pulse text-cyan-400" />
            <span>Autonomous Multi-Agent Deep Research System</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Synthesize Complex Knowledge with Precision
          </h1>

          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Argus combines <span className="text-cyan-300 font-medium">Neon pgvector HNSW</span> hybrid retrieval, <span className="text-emerald-300 font-medium">Tavily live web search</span>, reflective context evaluation, and <span className="text-indigo-300 font-medium">Gemini streaming synthesis</span>.
          </p>
        </div>

        {/* Search Command Input */}
        <ResearchInput
          onSubmit={submitResearch}
          isProcessing={isProcessing}
          onOpenVault={() => setIsVaultOpen(true)}
          documentCount={documents.length}
        />

        {/* Live Execution & Results */}
        {activeJob && (
          <section className="space-y-5 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            
            {/* Multi-Stage Telemetry */}
            <AgentTelemetry
              status={activeJob.status}
              isCacheHit={activeJob.isCacheHit}
              sourceCount={activeJob.sources?.length || 0}
              wordCount={wordCount}
              errorMessage={activeJob.errorMessage}
            />

            {/* Error Handling */}
            {activeJob.status === 'failed' && (
              <ErrorDisplay
                errorMessage={activeJob.errorMessage}
                onRetry={() => activeJob.question && submitResearch(activeJob.question)}
                isRetrying={isProcessing}
              />
            )}

            {/* Cited Sources */}
            {activeJob.sources && activeJob.sources.length > 0 && (
              <SourceCards sources={activeJob.sources} />
            )}

            {/* Intelligence Report Card */}
            {(activeJob.finalAnswer || isProcessing) && (
              <div className="glass-panel rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6">
                
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider">
                        Intelligence Synthesis
                      </span>
                      {activeJob.isCacheHit && (
                        <span className="px-2 py-0.5 rounded text-xs font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          Cached Match
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      {activeJob.question}
                    </h2>
                  </div>

                  {/* Actions */}
                  {activeJob.finalAnswer && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyReport}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-slate-700 transition-colors cursor-pointer"
                        title="Copy Markdown"
                      >
                        {copiedReport ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleDownloadReport}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-slate-700 transition-colors cursor-pointer"
                        title="Export as Markdown file"
                      >
                        <Download className="w-4 h-4" />
                        <span>Export .md</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Body Content */}
                <div className="relative min-h-[120px]">
                  {activeJob.finalAnswer ? (
                    <MessageRenderer content={activeJob.finalAnswer} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 space-y-3">
                      <Sparkles className="w-8 h-8 text-cyan-400 animate-spin" />
                      <p className="text-sm sm:text-base font-medium text-slate-300">
                        Synthesizing verified factual insights...
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        LangGraph node: synthesize (Gemini streaming stream)
                      </p>
                    </div>
                  )}

                  {/* Streaming Indicator */}
                  {isProcessing && activeJob.finalAnswer && (
                    <div className="inline-flex items-center gap-2 mt-4 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      <span>Streaming response tokens...</span>
                    </div>
                  )}
                </div>

              </div>
            )}

          </section>
        )}

        {/* History Showcase */}
        {history.length > 0 && (
          <section className="pt-6 border-t border-slate-800/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300 font-semibold uppercase tracking-wider">
                <History className="w-4 h-4 text-slate-400" />
                <span>Recent Research Inquiries ({history.length})</span>
              </div>

              <button
                onClick={handleClearHistory}
                className="text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveJob(item);
                    setCurrentJobId(item.id);
                  }}
                  className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    activeJob?.id === item.id
                      ? 'border-cyan-500/50 bg-cyan-500/10 shadow-sm shadow-cyan-500/10'
                      : 'border-slate-800 bg-slate-900/40 hover:bg-slate-850 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs sm:text-sm font-semibold text-slate-200 truncate">{item.question}</p>
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <span>{item.timestamp || 'Recent'}</span>
                      <span>•</span>
                      <span className={item.status === 'complete' ? 'text-emerald-400' : 'text-rose-400'}>
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                </button>
              ))}
            </div>
          </section>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-slate-950/70 backdrop-blur-md py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">Argus Research Agent</span>
            <span>•</span>
            <span>Enterprise Multi-Agent Intelligence</span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span>Neon pgvector</span>
            <span>•</span>
            <span>LangGraph</span>
            <span>•</span>
            <span>Tavily</span>
            <span>•</span>
            <span>Gemini Flash</span>
          </div>
        </div>
      </footer>

    </div>
  );
}