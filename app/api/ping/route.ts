/**
 * Ping API Route - Measures latency to video sources
 * Probes the source API itself ({baseUrl}?ac=list) instead of the bare root
 * address, so the measured latency reflects the actual search/play path.
 * A probe only counts as success when the host answers with a 2xx status:
 * the edge runtime can return synthetic responses for dead hosts, so mere
 * completion is not enough. Only elapsed time is used; the response body is
 * never parsed. Returns { latency, success, status } (success=false on
 * timeout/failure).
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const TIMEOUT_MS = 5000;

interface ProbeOutcome {
    ms: number;
    status: number;
}

async function probeOnce(target: string, timeoutMs: number): Promise<ProbeOutcome | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const start = performance.now();
    try {
        const res = await fetch(target, {
            method: 'GET',
            signal: controller.signal,
        });
        return { ms: Math.round(performance.now() - start), status: res.status };
    } catch {
        return null;
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

        const probeResult = await probeOnce(probe.toString(), TIMEOUT_MS);
        if (probeResult && probeResult.status >= 200 && probeResult.status < 300) {
            return NextResponse.json({
                latency: probeResult.ms,
                success: true,
                status: probeResult.status,
            });
        }

        // API probe failed: fall back to the bare root address so a source
        // whose list endpoint is blocked still reports reachability.
        const fallbackResult = await probeOnce(base.toString(), TIMEOUT_MS);
        if (fallbackResult && fallbackResult.status >= 200 && fallbackResult.status < 300) {
            return NextResponse.json({
                latency: fallbackResult.ms,
                success: true,
                fallback: true,
                status: fallbackResult.status,
            });
        }

        const latency = Math.round(performance.now() - startTime);
        // Still return latency even on error (timeout = slow)
        return NextResponse.json({
            latency,
            success: false,
            timeout: true,
            status: probeResult?.status ?? fallbackResult?.status ?? null,
        });
    } catch (error) {
        console.error('Ping error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
