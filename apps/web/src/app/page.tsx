// apps/web/src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { MessageRenderer } from '@/components/MessageRenderer';
import { ErrorDisplay } from '@/components/ErrorDisplay';

type JobResult = {
  id: string;
  status: 'pending' | 'researching' | 'synthesizing' | 'complete' | 'failed';
  finalAnswer?: string | null;
  errorMessage?: string | null;
  sources?: { title: string; url: string }[];
};

// Initialize socket instance targeting the worker port
let socket: Socket;

export default function Home() {
  const [question, setQuestion] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      let saved = localStorage.getItem('argus_session_id');
      if (!saved) {
        saved = crypto.randomUUID();
        localStorage.setItem('argus_session_id', saved);
      }
      return saved;
    }
    return 'ssr-session';
  });

  useEffect(() => {
    socket = io(`${process.env.NEXT_PUBLIC_SOCKET_URL}`);

    socket.on('connect', () => {
      console.log('[Socket] Connected to Argus worker stream');
    });

    // Listen for state transitions (pending -> researching -> synthesizing -> complete)
    socket.on('job-update', (data: JobResult) => {
      console.log('[Socket Event Received]:', data);

      setJobId((currentJobId) => {
        if (data.id === currentJobId) {
          setJob((prev) => ({ ...prev, ...data }));
        }
        return currentJobId;
      });
    });

    // Listen for live text chunks and append them to the finalAnswer string
    socket.on('job-stream', (data: { id: string, chunk: string }) => {
      setJobId((currentJobId) => {
        if (data.id === currentJobId) {
          setJob((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              finalAnswer: (prev.finalAnswer || '') + data.chunk
            };
          });
        }
        return currentJobId;
      });
    });

    // Listen for incoming source citations
    socket.on('job-sources', (data: { id: string, sources: { title: string, url: string }[] }) => {
      setJobId((currentJobId) => {
        if (data.id === currentJobId) {
          setJob((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              sources: data.sources
            };
          });
        }
        return currentJobId;
      });
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', sessionId);

    try {
      await fetch('/api/ingest', { method: 'POST', body: formData });
      alert(`"${file.name}" sent to backend for processing! You can ask questions about it in a few seconds.`);
    } catch (err) {
      alert('Upload failed.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const submitResearch = async (targetQuestion?: string) => {
    const q = (targetQuestion || question).trim();
    if (!q) return;

    setJob(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, sessionId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        setJob({
          id: 'error-' + Date.now(),
          status: 'failed',
          errorMessage: errorData.error || 'Failed to submit the question.',
        });
        return;
      }

      const data = await res.json();

      if (data.cached && data.job) {
        // Cache Hit: Set the completed job immediately!
        setJobId(data.jobId);
        setJob(data.job);
      } else if (data.jobId) {
        // Cache Miss: Listen for incoming Socket events
        setJobId(data.jobId);
        setJob({ id: data.jobId, status: 'pending' });
      }
    } catch (error: any) {
      console.error('Submission error:', error);
      setJob({
        id: 'error-' + Date.now(),
        status: 'failed',
        errorMessage: error?.message || 'Network error: Failed to communicate with server.',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitResearch();
  };

  const handleRetry = () => {
    submitResearch();
  };

  const isProcessing = job?.status === 'pending' || job?.status === 'researching' || job?.status === 'synthesizing';

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Argus Research Agent</h1>

        {/* Upload UI */}
        <div>
          <label className="text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 cursor-pointer px-4 py-2 rounded-md transition-colors inline-block dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
            {isUploading ? 'Uploading...' : 'Upload PDF/TXT to your Local Knowledge'}
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-4 mb-8">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 p-3 border border-gray-300 rounded-lg text-black bg-white dark:bg-zinc-900 dark:border-zinc-700 dark:text-white"
          required
          minLength={10}
        />
        <button
          type="submit"
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          disabled={!question || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Research'}
        </button>
      </form>

      {job && (
        <div className="p-6 border border-gray-200 rounded-lg bg-gray-50 text-black shadow-sm dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-semibold text-gray-700 dark:text-zinc-300">Status:</span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-mono uppercase ${job.status === 'complete'
                ? 'bg-green-200 text-green-800 dark:bg-emerald-950 dark:text-emerald-300'
                : job.status === 'failed'
                  ? 'bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-blue-200 text-blue-800 dark:bg-sky-950 dark:text-sky-300 animate-pulse'
                }`}
            >
              {job.status}
            </span>
          </div>

          {job.sources && job.sources.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <span className="text-sm font-semibold text-gray-600 dark:text-zinc-400">Sources:</span>
              {job.sources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-blue-700 text-xs rounded-full transition-colors truncate max-w-[250px] dark:bg-zinc-800 dark:text-sky-400 dark:hover:bg-zinc-700"
                  title={source.title}
                >
                  {source.title}
                </a>
              ))}
            </div>
          )}

          {job.status === 'failed' && (
            <div className="mt-4">
              <ErrorDisplay
                errorMessage={job.errorMessage}
                onRetry={handleRetry}
                isRetrying={isProcessing}
              />
            </div>
          )}

          {/* Render final answer */}
          {job.finalAnswer && (
            <div className="prose max-w-none mt-4 bg-white p-6 border border-gray-100 rounded-md shadow-sm dark:bg-zinc-950 dark:border-zinc-800 dark:prose-invert">
              <MessageRenderer content={job.finalAnswer} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}