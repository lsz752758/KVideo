/**
 * Batch Speed Test API Route - Measures latency for many video sources at once.
 * Probes each source API ({baseUrl}?ac=list) server-side, same probe semantics
 * as /api/ping. Only HTTP completion + elapsed time are used; response bodies
 * are never parsed. Failed/timeout sources return ms: null (callers sink them
 * to the bottom, never delete them).
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const TIMEOUT_MS = 5000;
const BATCH_SIZE = 8;

async function probeSource(baseUrl: string): Promise<number | null> {
    let probe: string;
    try {
        const url = new URL(baseUrl);
        url.searchParams.set('ac', 'list');
        probe = url.toString();
    } catch {
        return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const start = performance.now();
    try {
        await fetch(probe, {
            method: 'GET',
            signal: controller.signal,
        });
        return Math.round(performance.now() - start);
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const sources = Array.isArray(body?.sources) ? body.sources : [];
        const valid = sources.filter(
            (s: any) => s && typeof s.id === 'string' && typeof s.baseUrl === 'string'
        );

        const results: { id: string; ms: number | null }[] = [];
        for (let i = 0; i < valid.length; i += BATCH_SIZE) {
            const batch = valid.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(async (s: any) => ({
                    id: s.id,
                    ms: await probeSource(s.baseUrl),
                }))
            );
            results.push(...batchResults);
        }

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Speedtest error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
