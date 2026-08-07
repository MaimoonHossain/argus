'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import ComparisonTable from './ComparisonTable';

interface MessageRendererProps {
  content: string;
}

export function MessageRenderer({ content }: MessageRendererProps) {
  if (!content) return null;

  // Check if the stream contains <compare_matrix> tag (closing tag optional for live streaming)
  const match = content.match(/<compare_matrix>([\s\S]*?)(?:<\/compare_matrix>|$)/);

  if (!match) {
    return (
      <div className="prose-argus">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  const jsonPayload = match[1];
  const hasCloseTag = content.includes('</compare_matrix>');
  const [beforeTag, afterTagWithClose] = content.split('<compare_matrix>');
  const afterTag = afterTagWithClose?.includes('</compare_matrix>')
    ? afterTagWithClose.split('</compare_matrix>')[1]
    : '';

  return (
    <div className="space-y-4">
      {beforeTag && (
        <div className="prose-argus">
          <ReactMarkdown>{beforeTag}</ReactMarkdown>
        </div>
      )}
      
      <ComparisonTable jsonPayload={jsonPayload} isClosed={hasCloseTag} />

      {afterTag && (
        <div className="prose-argus">
          <ReactMarkdown>{afterTag}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
