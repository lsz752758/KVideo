import { useState, useEffect } from 'react';
import { SourceManager } from '@/components/settings/SourceManager';
import type { VideoSource } from '@/lib/types';
import { DEFAULT_SOURCES } from '@/lib/api/default-sources';
import { settingsStore, SPEED_TEST_TTL_MS } from '@/lib/store/settings-store';

interface SourceSettingsProps {
    sources: VideoSource[];
    onSourcesChange: (sources: VideoSource[]) => void;
    onRestoreDefaults: () => void;
    onAddSource: () => void;
    onEditSource?: (source: VideoSource) => void;
}

export function SourceSettings({
    sources,
    onSourcesChange,
    onRestoreDefaults,
    onAddSource,
    onEditSource,
}: SourceSettingsProps) {
    const [showAllSources, setShowAllSources] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [speeds, setSpeeds] = useState<Record<string, number | null>>({});
    const [speedTestedAt, setSpeedTestedAt] = useState<number | null>(null);
    const [sortBySpeed, setSortBySpeed] = useState(false);
    const [speedTesting, setSpeedTesting] = useState(false);

    // Load previously measured speeds + sort toggle (local only, never written
    // back to the subscription file).
    useEffect(() => {
        const settings = settingsStore.getSettings();
        setSpeeds(settings.sourceSpeeds || {});
        setSpeedTestedAt(settings.speedTestedAt ?? null);
        setSortBySpeed(settings.sortBySpeed === true);
    }, []);

    const speedsExpired = speedTestedAt !== null &&
        Date.now() - speedTestedAt > SPEED_TEST_TTL_MS;

    const handleSpeedTestAll = async () => {
        if (speedTesting || sources.length === 0) return;
        setSpeedTesting(true);
        try {
            const response = await fetch('/api/speedtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: sources.map(s => ({ id: s.id, baseUrl: s.baseUrl })),
                }),
            });
            if (!response.ok) return;
            const data = await response.json();
            const next: Record<string, number | null> = {};
            (data.results || []).forEach((r: { id: string; ms: number | null }) => {
                next[r.id] = r.ms;
            });
            const testedAt = Date.now();
            setSpeeds(next);
            setSpeedTestedAt(testedAt);
            settingsStore.saveSettings({
                ...settingsStore.getSettings(),
                sourceSpeeds: next,
                speedTestedAt: testedAt,
            });

            // Re-order the local source list by measured speed (failures last).
            // This only changes the local stored order, never the subscription file.
            const rank = (s: VideoSource) => {
                const ms = next[s.id];
                return ms === undefined || ms === null ? Infinity : ms;
            };
            const sorted = [...sources].sort((a, b) => rank(a) - rank(b));
            sorted.forEach((s, idx) => { s.priority = idx + 1; });
            onSourcesChange(sorted);
        } catch {
            // Speed test failure must not touch the source list itself.
        } finally {
            setSpeedTesting(false);
        }
    };

    const handleSortBySpeedToggle = (enabled: boolean) => {
        setSortBySpeed(enabled);
        settingsStore.saveSettings({
            ...settingsStore.getSettings(),
            sortBySpeed: enabled,
        });
    };

    const filteredSources = sources.filter(source =>
        source.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        source.baseUrl.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const displayedSources = showAllSources || searchQuery
        ? filteredSources
        : filteredSources.slice(0, 10);

    const handleToggle = (id: string) => {
        const updated = sources.map(s =>
            s.id === id ? { ...s, enabled: !s.enabled } : s
        );
        onSourcesChange(updated);
    };

    const handleDelete = (id: string) => {
        const updated = sources.filter(s => s.id !== id);
        onSourcesChange(updated);
    };

    const handleReorder = (id: string, direction: 'up' | 'down') => {
        const currentIndex = sources.findIndex(s => s.id === id);
        if (currentIndex === -1) return;

        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (newIndex < 0 || newIndex >= sources.length) return;

        const updated = [...sources];
        [updated[currentIndex], updated[newIndex]] = [updated[newIndex], updated[currentIndex]];

        // Update priorities
        updated.forEach((s, idx) => s.priority = idx + 1);
        onSourcesChange(updated);
    };

    return (
        <div className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-[var(--text-color)]">视频源管理</h2>
                <div className="flex gap-2">
                    <button
                        onClick={handleSpeedTestAll}
                        disabled={speedTesting}
                        className="px-4 py-2 rounded-[var(--radius-2xl)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] text-sm font-medium hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-all duration-200 cursor-pointer disabled:opacity-50"
                    >
                        {speedTesting ? '测速中...' : '全部测速'}
                    </button>
                    <button
                        onClick={onRestoreDefaults}
                        className="px-4 py-2 rounded-[var(--radius-2xl)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] text-sm font-medium hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-all duration-200 cursor-pointer"
                    >
                        恢复默认
                    </button>
                    <button
                        onClick={onAddSource}
                        className="px-4 py-2 rounded-[var(--radius-2xl)] bg-[var(--accent-color)] text-white text-sm font-semibold hover:brightness-110 hover:-translate-y-0.5 shadow-[var(--shadow-sm)] transition-all duration-200 cursor-pointer"
                    >
                        + 添加源
                    </button>
                </div>
            </div>
            <p className="text-sm text-[var(--text-color-secondary)] mb-6">
                管理视频来源，调整优先级和启用状态
            </p>

            {/* Speed test: sort toggle + expiry hint (local only) */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
                <label className="flex items-center gap-2 text-sm text-[var(--text-color)] cursor-pointer">
                    <input
                        type="checkbox"
                        checked={sortBySpeed}
                        onChange={(e) => handleSortBySpeedToggle(e.target.checked)}
                        className="w-4 h-4 accent-[var(--accent-color)]"
                    />
                    按速度排序（搜索与播放默认按本地测速顺序排源）
                </label>
                {speedTestedAt !== null && (
                    <span className={`text-xs ${speedsExpired ? 'text-orange-500' : 'text-[var(--text-color-secondary)]'}`}>
                        {speedsExpired
                            ? '测速结果已过期，建议重新测速'
                            : `测速于 ${new Date(speedTestedAt).toLocaleString()}`}
                    </span>
                )}
            </div>

            {/* Search Bar */}
            <div className="relative mb-4">
                <input
                    type="text"
                    placeholder="搜索源..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 pl-10 rounded-[var(--radius-2xl)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] placeholder-[var(--text-color-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all duration-200"
                />
                <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-color-secondary)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            <SourceManager
                sources={displayedSources}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onReorder={handleReorder}
                onEdit={onEditSource}
                defaultIds={DEFAULT_SOURCES.map(s => s.id)}
                speeds={speeds}
                speedsExpired={speedsExpired}
            />
            {!searchQuery && sources.length > 10 && (
                <button
                    onClick={() => setShowAllSources(!showAllSources)}
                    className="w-full mt-4 px-4 py-3 rounded-[var(--radius-2xl)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] text-sm font-medium hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-all duration-200 cursor-pointer"
                >
                    {showAllSources ? '收起' : `显示全部 (${sources.length})`}
                </button>
            )}
        </div>
    );
}
