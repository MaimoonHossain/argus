'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  FolderArchive, 
  Upload, 
  FileText, 
  File, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Trash2, 
  Info,
  Loader2,
  RefreshCw
} from 'lucide-react';

export interface UploadedDoc {
  name: string;
  size?: number;
  type: string;
  uploadedAt: string;
  chunkCount?: number;
}

interface KnowledgeVaultProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  documents: UploadedDoc[];
  onDocumentAdded: (doc: UploadedDoc) => void;
  onDocumentDeleted: (filename: string) => void;
  onClearDocuments: () => void;
  onSyncDocuments: (docs: UploadedDoc[]) => void;
}

export function KnowledgeVault({
  isOpen,
  onClose,
  sessionId,
  documents,
  onDocumentAdded,
  onDocumentDeleted,
  onClearDocuments,
  onSyncDocuments,
}: KnowledgeVaultProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && sessionId && sessionId !== 'ssr-session') {
      fetchDocumentsFromDb();
    }
  }, [isOpen, sessionId]);

  const fetchDocumentsFromDb = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch(`/api/ingest?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.documents)) {
          onSyncDocuments(data.documents);
        }
      }
    } catch (err) {
      console.error('Failed to sync documents from DB:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  if (!isOpen) return null;

  const handleUploadFile = async (file: File) => {
    if (!file) return;

    if (!file.name.endsWith('.pdf') && !file.name.endsWith('.txt')) {
      setNotification({
        type: 'error',
        message: 'Unsupported file format. Please upload a .pdf or .txt file.',
      });
      return;
    }

    setIsUploading(true);
    setNotification(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', sessionId);

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const newDoc: UploadedDoc = {
        name: file.name,
        size: file.size,
        type: file.name.endsWith('.pdf') ? 'PDF' : 'TXT',
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      onDocumentAdded(newDoc);
      setNotification({
        type: 'success',
        message: `Indexed "${file.name}" into local pgvector knowledge base.`,
      });

      setTimeout(fetchDocumentsFromDb, 2000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to upload document.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (filename: string) => {
    setDeletingFile(filename);
    setNotification(null);

    try {
      const res = await fetch(
        `/api/ingest?filename=${encodeURIComponent(filename)}&sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }

      onDocumentDeleted(filename);
      setNotification({
        type: 'success',
        message: `"${filename}" and its vector chunks were deleted from the database.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to delete document.',
      });
    } finally {
      setDeletingFile(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete all indexed documents from this session?')) return;

    setIsClearingAll(true);
    setNotification(null);

    try {
      const res = await fetch(
        `/api/ingest?sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to purge');
      }

      onClearDocuments();
      setNotification({
        type: 'success',
        message: 'All session documents and vector embeddings have been deleted.',
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to delete all documents.',
      });
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUploadFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUploadFile(file);
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-[#0a0f1d] border-l border-slate-800 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-[#060913]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Knowledge Vault</h2>
              <p className="text-xs text-slate-400">pgvector HNSW Store</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={fetchDocumentsFromDb}
              disabled={isLoadingDocs}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
              title="Refresh document list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingDocs ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* Upload Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                : isUploading
                ? 'border-cyan-500/40 bg-cyan-500/5 cursor-wait'
                : 'border-slate-700/80 hover:border-cyan-500/40 hover:bg-slate-900/60 bg-slate-900/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileChange}
              className="hidden"
              disabled={isUploading}
            />

            <div className="flex flex-col items-center gap-2.5">
              <div className="p-3 rounded-full bg-slate-800 text-cyan-400 border border-slate-700/60">
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
              </div>

              {isUploading ? (
                <div>
                  <p className="text-sm font-semibold text-cyan-300">Vectorizing document...</p>
                  <p className="text-xs text-slate-400 mt-1">Generating 768d embeddings into pgvector</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Upload PDF or TXT <span className="text-cyan-400 underline">document</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Parsed and indexed for Hybrid RAG retrieval
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Notification Alert */}
          {notification && (
            <div
              className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${
                notification.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <span className="leading-snug">{notification.message}</span>
            </div>
          )}

          {/* Indexed Documents Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Indexed Documents ({documents.length})
              </span>
              {documents.length > 0 && (
                <button
                  onClick={handleClearAll}
                  disabled={isClearingAll}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {isClearingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Purge All</span>
                </button>
              )}
            </div>

            {documents.length === 0 ? (
              <div className="p-6 rounded-xl border border-slate-800/80 bg-slate-900/30 text-center">
                <FileText className="w-7 h-7 text-slate-600 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium text-slate-300">No documents in this session.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Upload files to research targeted project notes or papers.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc, idx) => {
                  const isDeleting = deletingFile === doc.name;

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/50 flex items-center justify-between hover:border-slate-700 transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className="p-2 rounded-lg bg-slate-800 text-slate-300 shrink-0 border border-slate-700/60">
                          {doc.type === 'PDF' ? (
                            <FileText className="w-4 h-4 text-rose-400" />
                          ) : (
                            <File className="w-4 h-4 text-cyan-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-slate-200 truncate">{doc.name}</p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            {doc.chunkCount ? `${doc.chunkCount} chunks • ` : ''}{doc.uploadedAt}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleDeleteDocument(doc.name)}
                          disabled={isDeleting}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                          title={`Delete ${doc.name} from DB`}
                        >
                          {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 space-y-1.5">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-cyan-300 font-semibold">
              <Info className="w-4 h-4 text-cyan-400" />
              <span>Hybrid Search Mechanics</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Documents are converted to 768-dimensional vector embeddings and searched in parallel with keyword indices using Reciprocal Rank Fusion. Deleting removes all corresponding vector embeddings from Postgres.
            </p>
          </div>

        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#060913] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
