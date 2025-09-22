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

    // Resize state management
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
    const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
    const [isResizing, setIsResizing] = useState<{
        type: 'column' | 'row' | null;
        index: string | number | null;
        startX: number;
        startY: number;
        startWidth: number;
        startHeight: number;
    }>({
        type: null,
        index: null,
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0
    });

    // Sorting state
    const [sortField, setSortField] = useState<{ field: string | null; direction: 'asc' | 'desc' }>({ 
        field: null, 
        direction: 'asc' 
    });

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
            // Database status loaded successfully
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

    // Resize handlers
    const handleResizeStart = useCallback((
        type: 'column' | 'row',
        index: string | number,
        e: React.MouseEvent
    ) => {
        e.preventDefault();
        e.stopPropagation();

        const startWidth = type === 'column' ? (columnWidths[index as string] || 150) : 0;
        const startHeight = type === 'row' ? (rowHeights[index as number] || 35) : 0;

        setIsResizing({
            type,
            index,
            startX: e.clientX,
            startY: e.clientY,
            startWidth,
            startHeight
        });
    }, [columnWidths, rowHeights]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!isResizing.type || isResizing.index === null) return;

        e.preventDefault();
        
        if (isResizing.type === 'column') {
            const deltaX = e.clientX - isResizing.startX;
            const newWidth = Math.max(0, isResizing.startWidth + deltaX);
            
            setColumnWidths(prev => ({
                ...prev,
                [isResizing.index as string]: newWidth
            }));
        } else if (isResizing.type === 'row') {
            const deltaY = e.clientY - isResizing.startY;
            const newHeight = Math.max(0, isResizing.startHeight + deltaY);
            
            setRowHeights(prev => ({
                ...prev,
                [isResizing.index as number]: newHeight
            }));
        }
    }, [isResizing]);

    const handleResizeEnd = useCallback(() => {
        setIsResizing({
            type: null,
            index: null,
            startX: 0,
            startY: 0,
            startWidth: 0,
            startHeight: 0
        });
    }, []);

    // Mouse event listeners for resizing
    useEffect(() => {
        if (isResizing.type) {
            document.addEventListener('mousemove', handleResizeMove);
            document.addEventListener('mouseup', handleResizeEnd);
            document.body.style.cursor = isResizing.type === 'column' ? 'col-resize' : 'row-resize';
            document.body.style.userSelect = 'none';
            
            return () => {
                document.removeEventListener('mousemove', handleResizeMove);
                document.removeEventListener('mouseup', handleResizeEnd);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };
        }
        
        return () => {
            // Cleanup function for when isResizing.type is null
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing.type, handleResizeMove, handleResizeEnd]);

    // Get column width helper
    const getColumnWidth = useCallback((fieldName: string): number => {
        return columnWidths[fieldName] || 150; // Default width of 150px
    }, [columnWidths]);

    // Get row height helper
    const getRowHeight = useCallback((rowIndex: number): number => {
        return rowHeights[rowIndex] || 35; // Default height of 35px
    }, [rowHeights]);

    // Handle column sorting
    const handleSort = useCallback((fieldName: string, tabType: string) => {
        const newDirection = sortField.field === fieldName && sortField.direction === 'desc' ? 'asc' : 'desc';
        
        setSortField({
            field: fieldName,
            direction: newDirection
        });

        if (!databaseStatus) return;

        // Sort the appropriate data array
        const sortData = (data: any[]) => [...data].sort((a, b) => {
            const aVal = a[fieldName];
            const bVal = b[fieldName];
            
            // Handle null/undefined values
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return newDirection === 'asc' ? -1 : 1;
            if (bVal == null) return newDirection === 'asc' ? 1 : -1;
            
            // Handle numeric values
            const aNum = Number(aVal);
            const bNum = Number(bVal);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return newDirection === 'asc' ? aNum - bNum : bNum - aNum;
            }
            
            // Handle string values
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            if (newDirection === 'asc') {
                return aStr.localeCompare(bStr);
            } else {
                return bStr.localeCompare(aStr);
            }
        });

        // Update the appropriate data in database status
        setDatabaseStatus(prev => {
            if (!prev) return prev;
            
            const newStatus = { ...prev };
            switch (tabType) {
                case 'processes':
                    newStatus.processes = sortData(prev.processes);
                    break;
                case 'variables':
                    newStatus.variables = sortData(prev.variables);
                    break;
                case 'status':
                    newStatus.status = sortData(prev.status);
                    break;
            }
            return newStatus;
        });
    }, [sortField, databaseStatus]);

    // Store original column orders to prevent reordering during sorting
    const [originalColumnOrders, setOriginalColumnOrders] = useState<Record<string, string[]>>({});

    // Get stable column order to prevent reordering
    const getColumnOrder = useCallback((data: any[], tabType: string): string[] => {
        if (!data || data.length === 0) return [];
        
        // If we already have the original order for this tab, use it
        if (originalColumnOrders[tabType]) {
            return originalColumnOrders[tabType];
        }
        
        // First time seeing this tab's data - establish the column order
        const columns = Object.keys(data[0] || {});
        setOriginalColumnOrders(prev => ({
            ...prev,
            [tabType]: columns
        }));
        
        return columns;
    }, [originalColumnOrders]);

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
        
        // Reset sort field when switching tabs
        setSortField({ field: null, direction: 'asc' });
        
        // Load data for the selected tab if needed
        if (!databaseStatus) {
            loadDatabaseStatus();
        }
    }, [databaseStatus, loadDatabaseStatus]);

    // Render data grid
    const renderDataGrid = useCallback((data: any[], title: string, tabType: string) => {
        if (!data || data.length === 0) {
            return (
                <div className="empty-state">
                    <i className="codicon codicon-database"></i>
                    <p>No {title.toLowerCase()} data available</p>
                </div>
            );
        }

        const columns = getColumnOrder(data, tabType);
        
        // Column rendering logic
        
        return (
            <div 
                className="data-table-container"
                ref={(el) => {
                    // Container reference for potential future use
                }}
            >
                <table 
                    className="results-table"
                    ref={(el) => {
                        // Table reference for potential future use
                    }}
                >
                    <thead>
                        <tr>
                            <th className="index-col">
                                <span>#</span>
                            </th>
                            {columns.map((column, index) => {
                                const isCurrentSort = sortField.field === column;
                                const sortClass = isCurrentSort ? `sorted-${sortField.direction}` : '';
                                // Column rendering
                                return (
                                    <th 
                                        key={column} 
                                        className={`sortable column-header ${sortClass}`}
                                        onClick={() => handleSort(column, tabType)}
                                        title={`Click to sort by ${column}`}
                                        style={{ 
                                            width: columnWidths[column] ? `${columnWidths[column]}px` : undefined,
                                            position: 'relative'
                                        }}
                                    >
                                        <div className="column-header-content">
                                            <span className="column-name">{column}</span>
                                            <div className="sort-indicators">
                                                <i className={`codicon codicon-chevron-up sort-chevron ${
                                                    isCurrentSort && sortField.direction === 'asc' ? 'active' : 
                                                    isCurrentSort ? 'hidden' : ''
                                                }`}></i>
                                                <i className={`codicon codicon-chevron-down sort-chevron ${
                                                    isCurrentSort && sortField.direction === 'desc' ? 'active' : 
                                                    isCurrentSort ? 'hidden' : ''
                                                }`}></i>
                                            </div>
                                        </div>
                                        <div 
                                            className="column-resize-handle"
                                            onMouseDown={(e) => handleResizeStart('column', column, e)}
                                            onClick={(e) => e.stopPropagation()}
                                            title="Drag to resize column"
                                        />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => (
                            <tr 
                                key={index}
                                style={{ 
                                    height: `${getRowHeight(index)}px`,
                                    position: 'relative'
                                }}
                            >
                                <td 
                                    className="row-number-cell"
                                    style={{ position: 'relative' }}
                                >
                                    {index + 1}
                                    <div 
                                        className="row-resize-handle"
                                        onMouseDown={(e) => handleResizeStart('row', index, e)}
                                        onClick={(e) => e.stopPropagation()}
                                        title="Drag to resize row"
                                    />
                                </td>
                                {columns.map(column => (
                                    <td 
                                        key={column} 
                                        className="data-cell"
                                        style={{ 
                                            width: columnWidths[column] ? `${columnWidths[column]}px` : undefined
                                        }}
                                    >
                                        {String(row[column] || '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }, [sortField, handleSort, getColumnWidth, getRowHeight, handleResizeStart, getColumnOrder]);

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
                    {loading ? (
                        <div className="loading-spinner">
                            <i className="codicon codicon-loading spinner"></i>
                            Loading processes...
                        </div>
                    ) : (
                        renderDataGrid(databaseStatus?.processes || [], 'Process', 'processes')
                    )}
                </div>
            )}

            {/* Variables Panel */}
            {activeTab === 'variables' && databaseType !== DatabaseType.SqlServer && (
                <div className="tab-panel variables-panel">
                    {loading ? (
                        <div className="loading-spinner">
                            <i className="codicon codicon-loading spinner"></i>
                            Loading variables...
                        </div>
                    ) : (
                        renderDataGrid(databaseStatus?.variables || [], 'Variable', 'variables')
                    )}
                </div>
            )}

            {/* Status Panel */}
            {activeTab === 'status' && databaseType !== DatabaseType.SqlServer && (
                <div className="tab-panel status-panel">
                    {loading ? (
                        <div className="loading-spinner">
                            <i className="codicon codicon-loading spinner"></i>
                            Loading status...
                        </div>
                    ) : (
                        renderDataGrid(databaseStatus?.status || [], 'Status', 'status')
                    )}
                </div>
            )}
        </div>
    );
};
