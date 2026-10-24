/**
 * Ping API Route - Measures latency to video sources
 * Probes the source API itself ({baseUrl}?ac=list) instead of the bare root
 * address, so the measured latency reflects the actual search/play path.
 * Only HTTP completion + elapsed time are used; the response body is never parsed.
 * Returns { latency, success } (success=false on timeout/failure).
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const TIMEOUT_MS = 5000;

async function timedGet(target: string, timeoutMs: number): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        await fetch(target, {
            method: 'GET',
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { url } = body;

        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
        }

        // Validate URL format
        let base: URL;
        try {
            base = new URL(url);
        } catch {
            return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }

        // Probe the API list endpoint (lightweight, no search term needed)
        const probe = new URL(base.toString());
        probe.searchParams.set('ac', 'list');

        const startTime = performance.now();

        try {
            await timedGet(probe.toString(), TIMEOUT_MS);
            const latency = Math.round(performance.now() - startTime);
            return NextResponse.json({ latency, success: true });
        } catch {
            // API probe failed: fall back to the bare root address so a source
            // whose list endpoint is blocked still reports reachability.
            try {
                const fallbackStart = performance.now();
                await timedGet(base.toString(), TIMEOUT_MS);
                const latency = Math.round(performance.now() - fallbackStart);
                return NextResponse.json({ latency, success: true, fallback: true });
            } catch {
                const latency = Math.round(performance.now() - startTime);
                // Still return latency even on error (timeout = slow)
                return NextResponse.json({ latency, success: false, timeout: true });
            }
        }
    } catch (error) {
        console.error('Ping error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
