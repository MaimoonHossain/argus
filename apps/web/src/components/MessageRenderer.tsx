'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import ComparisonTable from './ComparisonTable';

export function MessageRenderer({ content }: { content: string }) {
  // Check if the stream contains <compare_matrix> tag (closing tag optional for live streaming)
  const match = content.match(/<compare_matrix>([\s\S]*?)(?:<\/compare_matrix>|$)/);

  if (!match) {
    return <ReactMarkdown>{content}</ReactMarkdown>;
  }

  const jsonPayload = match[1];
  const [beforeTag, afterTagWithClose] = content.split('<compare_matrix>');
  const afterTag = afterTagWithClose?.includes('</compare_matrix>')
    ? afterTagWithClose.split('</compare_matrix>')[1]
    : '';

  return (
    <div className="space-y-4">
      {beforeTag && <ReactMarkdown>{beforeTag}</ReactMarkdown>}
      <ComparisonTable jsonPayload={jsonPayload} />
      {afterTag && <ReactMarkdown>{afterTag}</ReactMarkdown>}
    </div>
  );
}
