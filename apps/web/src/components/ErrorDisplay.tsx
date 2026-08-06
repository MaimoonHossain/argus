'use client';

import { useState } from 'react';

export interface ParsedError {
  title: string;
  message: string;
  code?: number | string;
  status?: string;
  suggestion?: string;
  raw?: string;
  type: 'overloaded' | 'rate_limit' | 'auth' | 'network' | 'generic';
}

export function parseErrorMessage(errorInput: string | null | undefined): ParsedError {
  if (!errorInput) {
    return {
      title: 'Unexpected Error',
      message: 'The research process encountered an unknown issue.',
      suggestion: 'Please try submitting your question again.',
      type: 'generic',
    };
  }

  const raw = String(errorInput).trim();
  let jsonPayload: any = null;

  // Attempt to locate and parse JSON objects inside the raw error string
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      jsonPayload = JSON.parse(jsonMatch[0]);
    } catch {
      // Not a valid JSON payload, fall through
    }
  }

  const errObj = jsonPayload?.error || jsonPayload;
  const code = errObj?.code || jsonPayload?.code;
  const status = errObj?.status || jsonPayload?.status;
  const rawMsg = errObj?.message || raw;

  const lowerMsg = rawMsg.toLowerCase();

  // 1. High Demand / 503 UNAVAILABLE
  if (
    code === 503 ||
    status === 'UNAVAILABLE' ||
    lowerMsg.includes('high demand') ||
    lowerMsg.includes('temporarily unavailable') ||
    lowerMsg.includes('overloaded')
  ) {
    return {
      title: 'AI Model Temporarily Overloaded',
      message: 'Google Gemini is currently experiencing a high surge in global traffic.',
      suggestion: 'Traffic spikes usually subside within 10–20 seconds. Click "Retry Research" below to attempt again.',
      code: 503,
      status: status || 'UNAVAILABLE',
      raw,
      type: 'overloaded',
    };
  }

  // 2. Rate Limit / 429 RESOURCE_EXHAUSTED
  if (
    code === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('too many requests')
  ) {
    return {
      title: 'API Rate Limit Reached',
      message: 'Your Google Gemini or Tavily API key has exceeded its current rate limit or quota.',
      suggestion: 'Please wait a short moment or check your API quota in the provider dashboard.',
      code: 429,
      status: status || 'RESOURCE_EXHAUSTED',
      raw,
      type: 'rate_limit',
    };
  }

  // 3. Authentication / Key errors
  if (
    code === 401 ||
    code === 403 ||
    status === 'PERMISSION_DENIED' ||
    status === 'UNAUTHENTICATED' ||
    lowerMsg.includes('api_key') ||
    lowerMsg.includes('api key') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('permission denied')
  ) {
    return {
      title: 'API Authentication Failed',
      message: 'The API key provided is invalid, expired, or missing permissions.',
      suggestion: 'Please check your GEMINI_API_KEY and TAVILY_API_KEY settings in your .env file.',
      code: code || 401,
      status: status || 'UNAUTHENTICATED',
      raw,
      type: 'auth',
    };
  }

  // 4. Network / Connection errors
  if (
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('etimedout') ||
    lowerMsg.includes('network') ||
    lowerMsg.includes('connection refused')
  ) {
    return {
      title: 'Connection Failure',
      message: 'Unable to communicate with the background worker, database, or AI service.',
      suggestion: 'Ensure Redis, PostgreSQL, and the worker process are running and reachable.',
      raw,
      type: 'network',
    };
  }

  // 5. Generic Error fallback
  const cleanMessage = rawMsg.replace(/^Error:\s*/i, '');
  return {
    title: 'Research Execution Error',
    message: cleanMessage.length > 200 ? cleanMessage.slice(0, 200) + '...' : cleanMessage,
    suggestion: 'Try refining your search question or re-running the job.',
    code,
    status,
    raw,
    type: 'generic',
  };
}

interface ErrorDisplayProps {
  errorMessage: string | null | undefined;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorDisplay({ errorMessage, onRetry, isRetrying = false }: ErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const error = parseErrorMessage(errorMessage);

  const handleCopy = async () => {
    if (!error.raw) return;
    try {
      await navigator.clipboard.writeText(error.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard error fallback
    }
  };

  // Color theme mapping based on error category
  const themeConfig = {
    overloaded: {
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100',
      badge: 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    rate_limit: {
      bg: 'bg-orange-500/10 border-orange-500/30 text-orange-950 dark:text-orange-100',
      badge: 'bg-orange-500/20 text-orange-800 dark:text-orange-300 border border-orange-500/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      button: 'bg-orange-600 hover:bg-orange-700 text-white',
    },
    auth: {
      bg: 'bg-purple-500/10 border-purple-500/30 text-purple-950 dark:text-purple-100',
      badge: 'bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-500/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
      button: 'bg-purple-600 hover:bg-purple-700 text-white',
    },
    network: {
      bg: 'bg-sky-500/10 border-sky-500/30 text-sky-950 dark:text-sky-100',
      badge: 'bg-sky-500/20 text-sky-800 dark:text-sky-300 border border-sky-500/30',
      iconColor: 'text-sky-600 dark:text-sky-400',
      button: 'bg-sky-600 hover:bg-sky-700 text-white',
    },
    generic: {
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-100',
      badge: 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-500/30',
      iconColor: 'text-rose-600 dark:text-rose-400',
      button: 'bg-rose-600 hover:bg-rose-700 text-white',
    },
  };

  const currentTheme = themeConfig[error.type] || themeConfig.generic;

  return (
    <div
      className={`rounded-xl border p-5 transition-all shadow-sm ${currentTheme.bg} backdrop-blur-sm`}
      role="alert"
    >
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-white/60 dark:bg-black/40 shadow-xs ${currentTheme.iconColor}`}>
            {error.type === 'overloaded' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : error.type === 'rate_limit' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ) : error.type === 'auth' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            ) : error.type === 'network' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-base tracking-tight">{error.title}</h3>
          </div>
        </div>

        {(error.code || error.status) && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-medium ${currentTheme.badge}`}>
              {error.code ? `HTTP ${error.code}` : ''} {error.status ? `· ${error.status}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Main explanation & suggestion */}
      <div className="space-y-2 text-sm ml-0 sm:ml-11">
        <p className="font-medium opacity-90">{error.message}</p>
        {error.suggestion && (
          <p className="text-xs opacity-75 leading-relaxed bg-white/40 dark:bg-black/20 p-2.5 rounded-lg border border-black/5 dark:border-white/5">
            💡 <strong className="font-medium">Recommendation:</strong> {error.suggestion}
          </p>
        )}
      </div>

      {/* Action bar */}
      <div className="mt-4 pt-3 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 ml-0 sm:ml-11">
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shadow-xs disabled:opacity-50 cursor-pointer ${currentTheme.button}`}
            >
              {isRetrying ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Retrying...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Retry Research</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs opacity-75 hover:opacity-100 font-medium px-2.5 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {showDetails ? 'Hide Details' : 'View Technical Details'}
          </button>
        </div>

        {error.raw && showDetails && (
          <button
            onClick={handleCopy}
            className="text-xs opacity-75 hover:opacity-100 font-medium px-2.5 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1 cursor-pointer"
          >
            {copied ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Copied</span>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Raw Error</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Expandable technical details */}
      {showDetails && error.raw && (
        <div className="mt-3 ml-0 sm:ml-11">
          <pre className="text-xs font-mono p-3 rounded-lg bg-black/80 text-emerald-300 dark:bg-black/60 dark:text-emerald-400 overflow-x-auto max-h-48 border border-white/10 whitespace-pre-wrap break-all shadow-inner">
            {error.raw}
          </pre>
        </div>
      )}
    </div>
  );
}
