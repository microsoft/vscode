/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/* REDIS COMPONENT COMMENTED OUT
import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { IRedisServerInfo } from '../../common/erdosDatabaseClientApi.js';

interface RedisStatusProps {
    connectionId: string;
    onGetRedisStatus: (connectionId: string) => Promise<IRedisServerInfo>;
    onShowMessage: (message: string, type: 'info' | 'warning' | 'error') => void;
}

interface DBKeyStats {
    db: string;
    keys: number;
    expires: number;
    avg_ttl: number;
}

interface SortField {
    field: 'keys' | 'expires' | 'avg_ttl';
    direction: 'asc' | 'desc';
}

export const RedisStatus: React.FC<RedisStatusProps> = ({
    connectionId,
    onGetRedisStatus,
    onShowMessage
}) => {
    // Main state
    const [redisInfo, setRedisInfo] = useState<IRedisServerInfo>({} as IRedisServerInfo);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [sortField, setSortField] = useState<SortField>({ field: 'keys', direction: 'desc' });

    // Refs for timers
    const refreshTimer = useRef<number | null>(null);
    const refreshInterval = 2000; // 2 seconds

    // Load Redis status
    const loadRedisStatus = useCallback(async () => {
        if (!connectionId) return;

        setLoading(true);
        try {
            const info = await onGetRedisStatus(connectionId);
            setRedisInfo(info);
        } catch (error: any) {
            onShowMessage(`Redis Status Error: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [connectionId, onGetRedisStatus, onShowMessage]);

    // Auto refresh functionality
    const setupAutoRefresh = useCallback(() => {
        if (refreshTimer.current) {
            window.clearInterval(refreshTimer.current);
            refreshTimer.current = null;
        }

        if (autoRefresh) {
            refreshTimer.current = window.setInterval(() => {
                loadRedisStatus();
            }, refreshInterval);
        }
    }, [autoRefresh, loadRedisStatus]);

    // Handle auto refresh toggle
    const handleAutoRefreshToggle = useCallback((enabled: boolean) => {
        setAutoRefresh(enabled);
    }, []);

    // Parse DB key statistics from Redis info
    const getDBKeys = useCallback((): DBKeyStats[] => {
        const dbs: DBKeyStats[] = [];

        for (const key in redisInfo) {
            if (key.startsWith('db')) {
                const value = redisInfo[key];
                if (typeof value === 'string') {
                    const parts = value.split(',');
                    const keys = parseInt(parts[0]?.split('=')[1] || '0');
                    const expires = parseInt(parts[1]?.split('=')[1] || '0');
                    const avg_ttl = parseInt(parts[2]?.split('=')[1] || '0');

                    dbs.push({
                        db: key,
                        keys,
                        expires,
                        avg_ttl
                    });
                }
            }
        }

        return dbs;
    }, [redisInfo]);

    // Get all Redis info as key-value pairs
    const getAllRedisInfo = useCallback((): Array<{ key: string; value: string }> => {
        const infos: Array<{ key: string; value: string }> = [];

        for (const key in redisInfo) {
            infos.push({ key, value: String(redisInfo[key]) });
        }

        return infos;
    }, [redisInfo]);

    // Sort table by field
    const handleSort = useCallback((field: 'keys' | 'expires' | 'avg_ttl') => {
        setSortField(prev => ({
            field,
            direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    }, []);

    // Sort DB keys based on current sort field
    const sortedDBKeys = useCallback(() => {
        const dbKeys = getDBKeys();
        
        return dbKeys.sort((a, b) => {
            const aVal = a[sortField.field];
            const bVal = b[sortField.field];
            const result = aVal - bVal;
            return sortField.direction === 'desc' ? -result : result;
        });
    }, [getDBKeys, sortField]);

    // Format memory value for Lua memory
    const formatLuaMemory = useCallback((value: any): string => {
        if (!value) return '-';
        const numValue = typeof value === 'number' ? value : parseInt(String(value));
        return isNaN(numValue) ? '-' : Math.round(numValue / 1024) + 'K';
    }, []);

    // Effects
    useEffect(() => {
        loadRedisStatus();
    }, [loadRedisStatus]);

    useEffect(() => {
        setupAutoRefresh();
        return () => {
            if (refreshTimer.current) {
                window.clearInterval(refreshTimer.current);
            }
        };
    }, [setupAutoRefresh]);

    return (
        <div className={`redis-status ${loading ? 'loading' : ''}`}>
            <div className="refresh-controls">
                <div className="auto-refresh">
                    <label>
                        <i className="codicon codicon-refresh"></i>
                        Auto Refresh
                    </label>
                    <input 
                        type="checkbox" 
                        checked={autoRefresh}
                        onChange={(e) => handleAutoRefreshToggle(e.target.checked)}
                    />
                    <span className="refresh-interval">Every 2 seconds</span>
                </div>
            </div>

            <div className="status-cards">
                <div className="status-card">
                    <div className="card-header">
                        <i className="codicon codicon-server"></i>
                        <span>Server</span>
                    </div>
                    <div className="card-content">
                        <div className="status-item">
                            <span className="label">Redis Version:</span>
                            <span className="value">{redisInfo.redis_version || '-'}</span>
                        </div>
                        <div className="status-item">
                            <span className="label">OS:</span>
                            <span className="value" title={redisInfo.os || ''}>
                                {redisInfo.os || '-'}
                            </span>
                        </div>
                        <div className="status-item">
                            <span className="label">Process ID:</span>
                            <span className="value">{redisInfo.process_id || '-'}</span>
                        </div>
                    </div>
                </div>

                <div className="status-card">
                    <div className="card-header">
                        <i className="codicon codicon-chip"></i>
                        <span>Memory</span>
                    </div>
                    <div className="card-content">
                        <div className="status-item">
                            <span className="label">Used Memory:</span>
                            <span className="value">{redisInfo.used_memory_human || '-'}</span>
                        </div>
                        <div className="status-item">
                            <span className="label">Used Memory Peak:</span>
                            <span className="value">{redisInfo.used_memory_peak_human || '-'}</span>
                        </div>
                        <div className="status-item">
                            <span className="label">Used Memory Lua:</span>
                            <span className="value">{formatLuaMemory(redisInfo.used_memory_lua)}</span>
                        </div>
                    </div>
                </div>

                <div className="status-card">
                    <div className="card-header">
                        <i className="codicon codicon-graph"></i>
                        <span>Stats</span>
                    </div>
                    <div className="card-content">
                        <div className="status-item">
                            <span className="label">Connected Clients:</span>
                            <span className="value">{redisInfo.connected_clients || '-'}</span>
                        </div>
                        <div className="status-item">
                            <span className="label">Total Connections:</span>
                            <span className="value">{redisInfo.total_connections_received || '-'}</span>
                        </div>
                        <div className="status-item">
                            <span className="label">Total Commands:</span>
                            <span className="value">{redisInfo.total_commands_processed || '-'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="status-section">
                <div className="section-header">
                    <i className="codicon codicon-graph-line"></i>
                    <span>Key Statistics</span>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>DB</th>
                                <th 
                                    className={`sortable ${sortField.field === 'keys' ? `sorted-${sortField.direction}` : ''}`}
                                    onClick={() => handleSort('keys')}
                                >
                                    Keys
                                </th>
                                <th 
                                    className={`sortable ${sortField.field === 'expires' ? `sorted-${sortField.direction}` : ''}`}
                                    onClick={() => handleSort('expires')}
                                >
                                    Expires
                                </th>
                                <th 
                                    className={`sortable ${sortField.field === 'avg_ttl' ? `sorted-${sortField.direction}` : ''}`}
                                    onClick={() => handleSort('avg_ttl')}
                                >
                                    Avg TTL
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedDBKeys().map((stat) => (
                                <tr key={stat.db}>
                                    <td>{stat.db}</td>
                                    <td>{stat.keys}</td>
                                    <td>{stat.expires}</td>
                                    <td>{stat.avg_ttl}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="status-section">
                <div className="section-header">
                    <i className="codicon codicon-info"></i>
                    <span>All Redis Info</span>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Key</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {getAllRedisInfo().map((info) => (
                                <tr key={info.key}>
                                    <td>{info.key}</td>
                                    <td>{info.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
END REDIS COMPONENT COMMENTED OUT */
