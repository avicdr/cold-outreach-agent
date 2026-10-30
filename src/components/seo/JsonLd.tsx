import React from 'react';

interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * XSS-Safe JSON-LD Component
 * Serializes structured data and escapes script tags to prevent HTML injection.
 */
export function JsonLd({ data }: JsonLdProps) {
  const jsonString = JSON.stringify(data, null, 0).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonString }}
    />
  );
}

export default JsonLd;

