import DOMPurify from 'dompurify';

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function pickFields(input, allowedFields) {
  if (!input || typeof input !== 'object') return {};
  const allowed = new Set(allowedFields);
  const output = {};

  for (const key of Object.keys(input)) {
    if (BLOCKED_KEYS.has(key) || !allowed.has(key)) continue;
    output[key] = input[key];
  }

  return output;
}

export function sanitizeObject(input, allowedFields) {
  return pickFields(input, allowedFields);
}

export function sanitizeHtml(input) {
  return DOMPurify.sanitize(String(input ?? ''), {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'br', 'p', 'ul', 'ol', 'li', 'span'],
    ALLOWED_ATTR: [],
  });
}
