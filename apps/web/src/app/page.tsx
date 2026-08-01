// apps/web/src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { MessageRenderer } from '@/components/MessageRenderer';

type JobResult = {
  id: string;
  status: 'pending' | 'researching' | 'synthesizing' | 'complete' | 'failed';
  finalAnswer?: string | null;
  errorMessage?: string | null;
  sources?: { title: string; url: string }[]; // <-- Add this line
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
    formData.append('sessionId', sessionId); // Attach the current user's session

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setJob(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, sessionId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(`Error: ${errorData.error || 'Failed to submit'}`);
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
    } catch (error) {
      console.error('Submission error:', error);
      alert('Failed to submit the question.');
    }
  };

  const isProcessing = job?.status === 'pending' || job?.status === 'researching' || job?.status === 'synthesizing';

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Argus Research Agent</h1>

        {/* The Upload UI goes right here! */}
        <div>
          <label className="text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 cursor-pointer px-4 py-2 rounded-md transition-colors inline-block">
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
          className="flex-1 p-3 border border-gray-300 rounded-lg text-black bg-white"
          required
          minLength={10}
        />
        <button
          type="submit"
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          disabled={!question || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Research'}
        </button>
      </form>

      {job && (
        <div className="p-6 border border-gray-200 rounded-lg bg-gray-50 text-black shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-semibold text-gray-700">Status:</span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-mono uppercase ${job.status === 'complete'
                ? 'bg-green-200 text-green-800'
                : job.status === 'failed'
                  ? 'bg-red-200 text-red-800'
                  : 'bg-blue-200 text-blue-800 animate-pulse'
                }`}


            >
              {job.status}
            </span>
          </div>

          {job.sources && job.sources.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <span className="text-sm font-semibold text-gray-600">Sources:</span>
              {job.sources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-blue-700 text-xs rounded-full transition-colors truncate max-w-[250px]"
                  title={source.title}
                >
                  {source.title}
                </a>
              ))}
            </div>
          )}

          {job.status === 'failed' && (
            <div className="text-red-700 bg-red-100 p-4 rounded-md border border-red-200">
              <p className="font-semibold mb-1">Error Details:</p>
              {job.errorMessage || 'Unknown error occurred.'}
            </div>
          )}

          {/* Change this condition to render whenever finalAnswer has content */}
          {job.finalAnswer && (
            <div className="prose max-w-none mt-4 bg-white p-6 border border-gray-100 rounded-md shadow-sm">
              <MessageRenderer content={job.finalAnswer} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}