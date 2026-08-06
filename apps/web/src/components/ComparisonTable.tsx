'use client';

import React from 'react';

interface ComparisonTableProps {
  jsonPayload: string;
  isClosed?: boolean;
}

export default function ComparisonTable({ jsonPayload, isClosed = false }: ComparisonTableProps) {
  try {
    // Strip out any accidental markdown code wrappers
    const cleanedJson = jsonPayload.replace(/```json|```/g, '').trim();
    const rows = JSON.parse(cleanedJson);

    if (!Array.isArray(rows) || rows.length === 0) return null;

    const columns = Object.keys(rows[0]);

    return (
      <div className="my-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm text-gray-700">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-6 py-3 font-semibold">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row: Record<string, any>, idx: number) => (
              <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                {columns.map((col) => (
                  <td key={col} className="px-6 py-4 font-medium text-gray-900">
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } catch (error) {
    // If the tag has already been closed and parsing failed, do not display the loader
    if (isClosed) return null;

    // Render a streaming loader while the JSON is actively streaming from the LLM
    return (
      <div className="my-6 p-4 rounded-lg border border-blue-100 bg-blue-50/50 flex items-center gap-3 text-blue-700 animate-pulse text-sm font-medium">
        <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
        Generating interactive comparison table...
      </div>
    );
  }
}
