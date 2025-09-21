/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { IDatabaseStatus, IDashboardMetrics, DatabaseType } from '../../common/erdosDatabaseClientApi.js';

interface DatabaseStatusProps {
    connectionId: string;
    databaseType: DatabaseType;
    onGetDatabaseStatus: (connectionId: string) => Promise<IDatabaseStatus>;
    onShowMessage: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

interface TabType {
    id: 'dashboard' | 'processes' | 'variables' | 'status';
    label: string;
    visible: boolean;
}

interface ChartData {
    time: string;
    value: number;
    type: string;
}

interface ChartState {
    data: ChartData[];
    previous: ChartData[];
}

export const DatabaseStatus: React.FC<DatabaseStatusProps> = ({
    connectionId,
    databaseType,
    onGetDatabaseStatus,
    onShowMessage
}) => {
    // State
    const [databaseStatus, setDatabaseStatus] = useState<IDatabaseStatus | null>(null);
    const [activeTab, setActiveTab] = useState<string>('processes');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Chart state for dashboard
    const [chartStates, setChartStates] = useState<{
        queries: ChartState;
        traffic: ChartState;
        sessions: ChartState;
    }>({
        queries: { data: [], previous: [] },
        traffic: { data: [], previous: [] },
        sessions: { data: [], previous: [] }
    });

    // Refs
    const refreshInterval = useRef<number | null>(null);
    const chartRefs = useRef<{
        queries: HTMLDivElement | null;
        traffic: HTMLDivElement | null;
        sessions: HTMLDivElement | null;
    }>({
        queries: null,
        traffic: null,
        sessions: null
    });

    // Tab configuration
    const tabs: TabType[] = [
        { id: 'dashboard', label: 'Dashboard', visible: databaseType === DatabaseType.MySQL },
        { id: 'processes', label: 'Process List', visible: true },
        { id: 'variables', label: 'Variables', visible: databaseType !== DatabaseType.SqlServer },
        { id: 'status', label: 'Status', visible: databaseType !== DatabaseType.SqlServer }
    ];

    // Load database status
    const loadDatabaseStatus = useCallback(async () => {
        if (!connectionId) return;

        setLoading(true);
        setError(null);
        try {
            const status = await onGetDatabaseStatus(connectionId);
            setDatabaseStatus(status);
            
            // Update dashboard charts if MySQL
            if (databaseType === DatabaseType.MySQL && status.dashboard) {
                updateDashboardCharts(status.dashboard);
            }
        } catch (error: any) {
            const errorMessage = error.message || 'Failed to load database status';
            setError(errorMessage);
            onShowMessage(errorMessage, 'error');
        } finally {
            setLoading(false);
        }
    }, [connectionId, databaseType, onGetDatabaseStatus, onShowMessage]);

    // Update dashboard charts
    const updateDashboardCharts = useCallback((dashboard: IDashboardMetrics) => {
        const now = new Date().toLocaleTimeString();
        
        setChartStates(prev => {
            const newStates = { ...prev };
            
            // Update queries chart
            const queriesValue = dashboard.queries;
            const queriesDiff = prev.queries.previous.length > 0 
                ? Math.max(0, queriesValue - prev.queries.previous[prev.queries.previous.length - 1]?.value || 0)
                : queriesValue;
            
            newStates.queries = {
                data: [...prev.queries.data, { time: now, value: queriesDiff, type: 'queries' }].slice(-100),
                previous: [{ time: now, value: queriesValue, type: 'queries' }]
            };

            // Update traffic chart
            const receivedValue = dashboard.bytesReceived;
            const sentValue = dashboard.bytesSent;
            const receivedDiff = prev.traffic.previous.length > 0 
                ? Math.max(0, receivedValue - (prev.traffic.previous.find(p => p.type === 'received')?.value || 0))
                : receivedValue;
            const sentDiff = prev.traffic.previous.length > 0 
                ? Math.max(0, sentValue - (prev.traffic.previous.find(p => p.type === 'sent')?.value || 0))
                : sentValue;

            newStates.traffic = {
                data: [
                    ...prev.traffic.data,
                    { time: now, value: Math.round(receivedDiff / 1000), type: 'received' },
                    { time: now, value: Math.round(sentDiff / 1000), type: 'sent' }
                ].slice(-200), // Keep more data points for traffic (2 types)
                previous: [
                    { time: now, value: receivedValue, type: 'received' },
                    { time: now, value: sentValue, type: 'sent' }
                ]
            };

            // Update sessions chart
            newStates.sessions = {
                data: [...prev.sessions.data, { time: now, value: dashboard.connections, type: 'connections' }].slice(-100),
                previous: [{ time: now, value: dashboard.connections, type: 'connections' }]
            };

            return newStates;
        });

        // Update chart displays
        updateChartDisplay('queries', chartStates.queries.data);
        updateChartDisplay('traffic', chartStates.traffic.data);
        updateChartDisplay('sessions', chartStates.sessions.data);
    }, [chartStates]);

    // Update chart display (simple fallback implementation)
    const updateChartDisplay = useCallback((chartType: string, data: ChartData[]) => {
        const chartRef = chartRefs.current[chartType as keyof typeof chartRefs.current];
        if (!chartRef) return;

        // Simple chart fallback - show latest values
        const latestData = data.slice(-5); // Show last 5 data points
        chartRef.innerHTML = `
            <div class="chart-fallback">
                <div class="chart-icon"><i class="codicon codicon-graph"></i></div>
                <div class="chart-data">
                    ${latestData.map(item => `
                        <div class="data-item">
                            <span class="data-label">${item.type} (${item.time})</span>
                            <span class="data-value">${item.value}${chartType === 'traffic' ? 'kb' : ''}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }, []);

    // Toggle auto-refresh
    const toggleAutoRefresh = useCallback(() => {
        setAutoRefresh(prev => {
            const newAutoRefresh = !prev;
            
            if (newAutoRefresh) {
                refreshInterval.current = window.setInterval(() => {
                    if (activeTab === 'dashboard' && databaseType === DatabaseType.MySQL) {
                        loadDatabaseStatus();
                    }
                }, 1000);
            } else {
                if (refreshInterval.current) {
                    clearInterval(refreshInterval.current);
                    refreshInterval.current = null;
                }
            }
            
            return newAutoRefresh;
        });
    }, [activeTab, databaseType, loadDatabaseStatus]);

    // Switch tab
    const switchTab = useCallback((tabId: string) => {
        setActiveTab(tabId);
        
        // Load data for the selected tab if needed
        if (!databaseStatus) {
            loadDatabaseStatus();
        }
    }, [databaseStatus, loadDatabaseStatus]);

    // Render data grid
    const renderDataGrid = useCallback((data: any[], title: string) => {
        if (!data || data.length === 0) {
            return (
                <div className="empty-state">
                    <i className="codicon codicon-database"></i>
                    <p>No {title.toLowerCase()} data available</p>
                </div>
            );
        }

        const columns = Object.keys(data[0] || {});
        
        return (
            <div className="data-grid">
                <div className="grid-header">
                    {columns.map(column => (
                        <div key={column} className="grid-header-cell">
                            {column}
                        </div>
                    ))}
                </div>
                <div className="grid-body">
                    {data.map((row, index) => (
                        <div key={index} className="grid-row">
                            {columns.map(column => (
                                <div key={column} className="grid-cell">
                                    {String(row[column] || '')}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }, []);

    // Effects
    useEffect(() => {
        // Set initial active tab based on database type
        const defaultTab = databaseType === DatabaseType.MySQL ? 'dashboard' : 'processes';
        setActiveTab(defaultTab);
        loadDatabaseStatus();
        
        return () => {
            if (refreshInterval.current) {
                clearInterval(refreshInterval.current);
            }
        };
    }, [databaseType, loadDatabaseStatus]);

    useEffect(() => {
        // Update auto-refresh when tab changes
        if (autoRefresh && refreshInterval.current) {
            clearInterval(refreshInterval.current);
            if (activeTab === 'dashboard' && databaseType === DatabaseType.MySQL) {
                refreshInterval.current = window.setInterval(loadDatabaseStatus, 1000);
            }
        }
    }, [activeTab, autoRefresh, databaseType, loadDatabaseStatus]);

    const visibleTabs = tabs.filter(tab => tab.visible);

    return (
        <div className={`status-container ${loading ? 'loading' : ''}`}>
            {/* Tab Navigation */}
            <div className="status-tabs">
                {visibleTabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => switchTab(tab.id)}
                        disabled={loading}
                    >
                        {tab.label}
                    </button>
                ))}
                
                {/* Auto-refresh toggle for dashboard */}
                {databaseType === DatabaseType.MySQL && activeTab === 'dashboard' && (
                    <button
                        className={`tab-btn auto-refresh-btn ${autoRefresh ? 'active' : ''}`}
                        onClick={toggleAutoRefresh}
                        title={`Auto-refresh: ${autoRefresh ? 'ON' : 'OFF'}`}
                    >
                        <i className={`codicon codicon-${autoRefresh ? 'debug-stop' : 'play'}`}></i>
                        Auto-refresh
                    </button>
                )}
                
                {/* Manual refresh button */}
                <button
                    className="tab-btn refresh-btn"
                    onClick={loadDatabaseStatus}
                    disabled={loading}
                    title="Refresh"
                >
                    <i className="codicon codicon-refresh"></i>
                </button>
            </div>

            {/* Error Panel */}
            {error && (
                <div className="error-message">
                    <i className="codicon codicon-error"></i>
                    {error}
                    <button 
                        className="btn btn-secondary"
                        onClick={() => setError(null)}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Tab Panels */}
            
            {/* Dashboard Panel (MySQL only) */}
            {activeTab === 'dashboard' && databaseType === DatabaseType.MySQL && (
                <div className="tab-panel dashboard-panel">
                    <div className="charts-container">
                        <div className="chart-row">
                            <div className="chart-container">
                                <h4>Queries</h4>
                                <div 
                                    className="chart" 
                                    ref={el => chartRefs.current.queries = el}
                                >
                                    {loading && (
                                        <div className="loading-spinner">
                                            <i className="codicon codicon-loading spinner"></i>
                                            Loading chart data...
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="chart-row">
                            <div className="chart-container">
                                <h4>Traffic</h4>
                                <div 
                                    className="chart" 
                                    ref={el => chartRefs.current.traffic = el}
                                >
                                    {loading && (
                                        <div className="loading-spinner">
                                            <i className="codicon codicon-loading spinner"></i>
                                            Loading chart data...
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="chart-container">
                                <h4>Server Sessions</h4>
                                <div 
                                    className="chart" 
                                    ref={el => chartRefs.current.sessions = el}
                                >
                                    {loading && (
                                        <div className="loading-spinner">
                                            <i className="codicon codicon-loading spinner"></i>
                                            Loading chart data...
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Process List Panel */}
            {activeTab === 'processes' && (
                <div className="tab-panel processes-panel">
                    <div className="processes-grid">
                        {loading ? (
                            <div className="loading-spinner">
                                <i className="codicon codicon-loading spinner"></i>
                                Loading processes...
                            </div>
                        ) : (
                            renderDataGrid(databaseStatus?.processes || [], 'Process')
                        )}
                    </div>
                </div>
            )}

            {/* Variables Panel */}
            {activeTab === 'variables' && databaseType !== DatabaseType.SqlServer && (
                <div className="tab-panel variables-panel">
                    <div className="variables-grid">
                        {loading ? (
                            <div className="loading-spinner">
                                <i className="codicon codicon-loading spinner"></i>
                                Loading variables...
                            </div>
                        ) : (
                            renderDataGrid(databaseStatus?.variables || [], 'Variable')
                        )}
                    </div>
                </div>
            )}

            {/* Status Panel */}
            {activeTab === 'status' && databaseType !== DatabaseType.SqlServer && (
                <div className="tab-panel status-panel">
                    <div className="status-grid">
                        {loading ? (
                            <div className="loading-spinner">
                                <i className="codicon codicon-loading spinner"></i>
                                Loading status...
                            </div>
                        ) : (
                            renderDataGrid(databaseStatus?.status || [], 'Status')
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
