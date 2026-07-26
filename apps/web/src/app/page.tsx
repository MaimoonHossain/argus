// apps/web/src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

type JobResult = {
  id: string;
  status: 'pending' | 'researching' | 'synthesizing' | 'complete' | 'failed';
  finalAnswer?: string | null;
  errorMessage?: string | null;
};

// Initialize socket instance targeting the worker port
let socket: Socket;

export default function Home() {
  const [question, setQuestion] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobResult | null>(null);

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

    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setJob(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
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
      <h1 className="text-3xl font-bold mb-8">Argus Research Agent</h1>

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

          {job.status === 'failed' && (
            <div className="text-red-700 bg-red-100 p-4 rounded-md border border-red-200">
              <p className="font-semibold mb-1">Error Details:</p>
              {job.errorMessage || 'Unknown error occurred.'}
            </div>
          )}

          {/* Change this condition to render whenever finalAnswer has content */}
          {job.finalAnswer && (
            <div className="prose max-w-none whitespace-pre-wrap mt-4 bg-white p-6 border border-gray-100 rounded-md shadow-sm">
              {job.finalAnswer}
            </div>
          )}
        </div>
      )}
    </main>
  );
}