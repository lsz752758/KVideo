'use client';

/**
 * SourceSelector - Component for selecting video source in player
 * Following Liquid Glass design system
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Icons } from '@/components/ui/Icon';
import { LatencyBadge } from '@/components/ui/LatencyBadge';
import { Button } from '@/components/ui/Button';
import { settingsStore, SPEED_TEST_TTL_MS } from '@/lib/store/settings-store';

export interface SourceInfo {
    id: string | number;
    source: string;
    sourceName?: string;
    baseUrl?: string;
    latency?: number;
    pic?: string;
}

interface SourceSelectorProps {
    sources: SourceInfo[];
    currentSource: string;
    onSourceChange: (source: SourceInfo) => void;
    className?: string;
}

export function SourceSelector({
    sources,
    currentSource,
    onSourceChange,
    className = '',
}: SourceSelectorProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [latencies, setLatencies] = useState<Record<string, number>>({});

    // Sort sources by latency
    const sortedSources = useMemo(() => {
        return [...sources].sort((a, b) => {
            const latA = latencies[a.source] ?? a.latency ?? Infinity;
            const latB = latencies[b.source] ?? b.latency ?? Infinity;
            return latA - latB;
        });
    }, [sources, latencies]);

    // Refresh latency for all sources
    const refreshLatencies = useCallback(async () => {
        setIsLoading(true);

        const results = await Promise.all(
            sources.map(async (source) => {
                // Only ping when we have a real baseUrl; the source id/name is not a URL
                // and would always fail validation on the server.
                if (!source.baseUrl) {
                    return { source: source.source, latency: undefined };
                }
                try {
                    const response = await fetch('/api/ping', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: source.baseUrl,
                        }),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        // Only trust the measurement when the probe actually succeeded;
                        // timeouts/failures must sink to the bottom, not rank as slow.
                        if (data.success === true && typeof data.latency === 'number') {
                            return { source: source.source, latency: data.latency };
                        }
                    }
                } catch {
                    // Ignore errors
                }
                return { source: source.source, latency: undefined };
            })
        );

        const newLatencies: Record<string, number> = {};
        results.forEach(({ source, latency }) => {
            if (latency !== undefined) {
                newLatencies[source] = latency;
            }
        });

        setLatencies(newLatencies);
        setIsLoading(false);
    }, [sources]);

    // Initialize latencies from sources. When "sort by speed" is on and the
    // cached measurement is fresh, prefer it over the search-time latency so
    // the list opens pre-sorted without pressing refresh.
    useEffect(() => {
        const initial: Record<string, number> = {};
        sources.forEach(s => {
            if (s.latency !== undefined) {
                initial[s.source] = s.latency;
            }
        });
        try {
            const settings = settingsStore.getSettings();
            if (
                settings.sortBySpeed &&
                settings.speedTestedAt !== null &&
                Date.now() - settings.speedTestedAt < SPEED_TEST_TTL_MS
            ) {
                sources.forEach(s => {
                    const ms = settings.sourceSpeeds?.[s.source];
                    if (typeof ms === 'number') {
                        initial[s.source] = ms;
                    }
                });
            }
        } catch {
            // Ignore settings read errors; fall back to search-time latencies.
        }
        setLatencies(initial);
    }, [sources]);

    if (sources.length <= 1) {
        return null;
    }

    return (
        <Card hover={false} className={`mt-6 ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-[var(--text-color)] flex items-center gap-2">
                    <Icons.Layers size={20} className="sm:w-6 sm:h-6" />
                    <span></span>
                    <Badge variant="primary">{sources.length}</Badge>
                </h3>
                <Button
                    variant="secondary"
                    onClick={refreshLatencies}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5"
                >
                    <Icons.RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    刷新延迟
                </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {sortedSources.map((source, index) => {
                    const isCurrent = source.source === currentSource;
                    const latency = latencies[source.source] ?? source.latency;

                    return (
                        <button
                            key={`${source.source}-${index}`}
                            onClick={() => !isCurrent && onSourceChange(source)}
                            className={`
                w-full p-3 rounded-[var(--radius-2xl)] text-left transition-all duration-200
                flex items-center gap-3
                ${isCurrent
                                    ? 'bg-[var(--accent-color)] text-white shadow-[0_4px_12px_color-mix(in_srgb,var(--accent-color)_50%,transparent)]'
                                    : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] text-[var(--text-color)] border border-[var(--glass-border)] cursor-pointer'
                                }
              `}
                            aria-current={isCurrent ? 'true' : undefined}
                        >
                            {/* Thumbnail */}
                            {source.pic && (
                                <div className="w-12 h-16 rounded-[var(--radius-2xl)] overflow-hidden flex-shrink-0 bg-[color-mix(in_srgb,var(--glass-bg)_50%,transparent)]">
                                    <Image
                                        src={source.pic}
                                        alt=""
                                        width={48}
                                        height={64}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                            )}

                            {/* Source Info */}
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm sm:text-base truncate">
                                    {source.sourceName || source.source}
                                </div>
                                {latency !== undefined && (
                                    <div className="mt-1">
                                        <LatencyBadge latency={latency} />
                                    </div>
                                )}
                            </div>

                            {/* Current indicator */}
                            {isCurrent && (
                                <Icons.Play size={16} className="flex-shrink-0" />
                            )}

                            {/* Rank badge for top 3 */}
                            {!isCurrent && index < 3 && (
                                <Badge
                                    variant="secondary"
                                    className={`flex-shrink-0 ${index === 0 ? 'bg-yellow-500/20 text-yellow-600 border-yellow-500' :
                                        index === 1 ? 'bg-gray-400/20 text-gray-600 border-gray-400' :
                                            'bg-orange-400/20 text-orange-600 border-orange-400'
                                        }`}
                                >
                                    #{index + 1}
                                </Badge>
                            )}
                        </button>
                    );
                })}
            </div>
        </Card>
    );
}
