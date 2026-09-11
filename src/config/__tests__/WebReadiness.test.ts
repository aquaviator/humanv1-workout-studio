import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('invited-beta web readiness', () => {
  it('uses SPA, security and noindex headers without unsafe eval', () => {
    const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting[0];
    expect(hosting.rewrites).toContainEqual({ source: '**', destination: '/index.html' });
    expect(hosting.headers.find((entry: { source: string }) => entry.source === '/service-worker.js').headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache,no-store,must-revalidate' });
    const all = hosting.headers.find((entry: { source: string }) => entry.source === '**').headers;
    const headers = Object.fromEntries(all.map((entry: { key: string; value: string }) => [entry.key, entry.value]));
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain('https://*.googleapis.com');
    expect(headers['Content-Security-Policy']).toContain('wss://*.firebaseio.com');
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-eval'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    expect(headers['X-Robots-Tag']).toBe('noindex, nofollow, noarchive');
  });

  it('keeps indexing off and caches only same-origin GET shell resources', () => {
    expect(readFileSync('index.html', 'utf8')).toContain('<meta name="robots" content="noindex, nofollow, noarchive"');
    expect(readFileSync('public/robots.txt', 'utf8')).toContain('Disallow: /');
    const worker = readFileSync('public/service-worker.js', 'utf8');
    expect(worker).toContain('__HV1_BUILD_ID__');
    expect(worker).toContain("url.origin !== self.location.origin");
    expect(worker).toContain("request.method !== 'GET'");
    expect(worker).toContain("event.request.mode === 'navigate'");
    expect(worker).not.toMatch(/googleapis|firebaseio|identitytoolkit|securetoken/);
  });
});
