/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Import G2 for charts
import { Chart } from '@antv/g2';

(function() {
    const vscode = acquireVsCodeApi();
    
    // State
    let activePanel = 'processes';
    let info = {};
    let processesGrid = null;
    let variablesGrid = null;
    let statusGrid = null;
    
    // Dashboard chart state
    let dashboardCharts = {
        sessions: { data: [], chart: null, previous: null },
        queries: { data: [], chart: null, previous: null },
        traffic: { data: [], chart: null, previous: null }
    };
    
    // DOM elements
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const processesGridEl = document.getElementById('processesGrid');
    const variablesGridEl = document.getElementById('variablesGrid');
    const statusGridEl = document.getElementById('statusGrid');
    
    // Event listeners
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
    
    // Message handler
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'statusInitialized':
                info = message.connection || {};
                // Set default active panel based on database type
                activePanel = info.dbType === 'MySQL' ? 'dashboard' : 'processes';
                switchTab(activePanel);
                loadInitialData();
                break;
            case 'processList':
                loadProcessList(message.data);
                break;
            case 'variableList':
                loadVariableList(message.data);
                break;
            case 'statusList':
                loadStatusList(message.data);
                break;
            case 'dashboardData':
                loadDashboard(message.data);
                break;
            case 'error':
                showError(message.message);
                break;
        }
    });
    
    function switchTab(tabName) {
        activePanel = tabName;
        
        // Update tab buttons
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab panels
        tabPanels.forEach(panel => {
            if (panel.id === `${tabName}Panel`) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        });
        
        // Load data for the selected tab
        loadTabData(tabName);
    }
    
    function loadInitialData() {
        // Load data for all tabs initially
        vscode.postMessage({ type: 'processList' });
        if (info.dbType !== 'SqlServer') {
            vscode.postMessage({ type: 'variableList' });
            vscode.postMessage({ type: 'statusList' });
        }
        
        if (info.dbType === 'MySQL') {
            loadDashboardData();
            // Set up auto-refresh for dashboard
            setInterval(() => {
                if (activePanel === 'dashboard') {
                    loadDashboardData();
                }
            }, 1000);
        }
    }
    
    function loadTabData(tabName) {
        switch (tabName) {
            case 'processes':
                vscode.postMessage({ type: 'processList' });
                break;
            case 'variables':
                vscode.postMessage({ type: 'variableList' });
                break;
            case 'status':
                vscode.postMessage({ type: 'statusList' });
                break;
            case 'dashboard':
                loadDashboardData();
                break;
        }
    }
    
    function loadDashboardData() {
        vscode.postMessage({ type: 'dashBoard' });
    }
    
    function loadProcessList(data) {
        if (!processesGrid && processesGridEl) {
            processesGrid = new DataGrid(processesGridEl, {
                sortable: true,
                contextMenu: false
            });
        }
        
        if (processesGrid && data && data.rows) {
            // Convert fields to column format
            const columns = data.fields ? data.fields.map(field => ({
                field: field.name,
                title: field.name
            })) : [];
            
            processesGrid.setData(data.rows, columns);
        }
    }
    
    function loadVariableList(data) {
        if (!variablesGrid && variablesGridEl) {
            variablesGrid = new DataGrid(variablesGridEl, {
                sortable: true,
                contextMenu: false
            });
        }
        
        if (variablesGrid && data && data.rows) {
            // Convert fields to column format
            const columns = data.fields ? data.fields.map(field => ({
                field: field.name,
                title: field.name
            })) : [];
            
            variablesGrid.setData(data.rows, columns);
        }
    }
    
    function loadStatusList(data) {
        if (!statusGrid && statusGridEl) {
            statusGrid = new DataGrid(statusGridEl, {
                sortable: true,
                contextMenu: false
            });
        }
        
        if (statusGrid && data && data.rows) {
            // Convert fields to column format
            const columns = data.fields ? data.fields.map(field => ({
                field: field.name,
                title: field.name
            })) : [];
            
            statusGrid.setData(data.rows, columns);
        }
    }
    
    function loadDashboard(data) {
        // Create chart data format
        const now = new Date().toLocaleTimeString();
        
        // Sessions data
        const sessionsData = [{
            now: now,
            value: parseInt(data.connections || 0),
            type: 'connections'
        }];
        
        // Queries data
        const queriesData = [{
            now: now,
            value: parseInt(data.queries || 0),
            type: 'queries'
        }];
        
        // Traffic data
        const trafficData = [{
            now: now,
            value: parseInt(data.bytesReceived || 0),
            type: 'received'
        }, {
            now: now,
            value: parseInt(data.bytesSent || 0),
            type: 'sent'
        }];
        
        // Load charts
        loadChart('sessionsChart', dashboardCharts.sessions, sessionsData);
        loadChart('queriesChart', dashboardCharts.queries, queriesData, (data, previous) => {
            // Calculate difference for queries
            if (previous && previous.length > 0) {
                data[0].value = Math.max(0, data[0].value - previous[0].value);
            }
        });
        loadChart('trafficChart', dashboardCharts.traffic, trafficData, (data, previous) => {
            // Calculate difference and convert to KB for traffic
            if (previous && previous.length > 0) {
                data.forEach((item, index) => {
                    if (previous[index]) {
                        const diff = Math.max(0, item.value - previous[index].value);
                        item.value = Math.round(diff / 1000) + 'kb';
                    }
                });
            }
        });
    }
    
    function loadChart(containerId, chartOption, data, beforeCallback) {
        if (!document.getElementById(containerId)) return;
        
        const copy = JSON.parse(JSON.stringify(data));
        
        if (!chartOption.previous) {
            chartOption.previous = copy;
        }
        
        chartOption.data.push(...data);
        
        if (beforeCallback) {
            beforeCallback(data, chartOption.previous);
        }
        
        chartOption.previous = copy;
        
        if (!chartOption.chart) {
            chartOption.chart = createChart(containerId, chartOption.data);
        } else {
            // Keep only last 100 data points
            if (chartOption.data.length >= data.length * 100) {
                for (let index = 0; index < data.length; index++) {
                    chartOption.data.shift();
                }
            }
            chartOption.chart.changeData(chartOption.data);
        }
    }
    
    function createChart(containerId, data) {
        // Simple chart implementation (fallback if Chart library not available)
        const container = document.getElementById(containerId);
        if (!container) return null;
        
        // Check if Chart library is available (from g2 or chart.js)
        if (typeof Chart !== 'undefined') {
            try {
                const chart = new Chart({
                    container: containerId,
                    autoFit: true,
                    height: 300
                });
                chart.data(data);
                chart.line().position('now*value').color('type').size(2);
                chart.render();
                return chart;
            } catch (e) {
                // Fallback to simple display
                createSimpleChart(container, data);
                return null;
            }
        } else {
            // Fallback to simple display
            createSimpleChart(container, data);
            return null;
        }
    }
    
    function createSimpleChart(container, data) {
        // Simple text-based chart fallback
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">
                <p>Chart data:</p>
                ${data.map(item => `<div>${item.type}: ${item.value}</div>`).join('')}
            </div>
        `;
    }
    
    function showError(message) {
        console.error('Status view error:', message);
        
        // Show error notification
        const errorNotification = document.createElement('div');
        errorNotification.className = 'error-notification';
        errorNotification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 12px 16px;
            border-radius: 4px;
            z-index: 1001;
            display: flex;
            align-items: center;
            gap: 8px;
            max-width: 400px;
        `;
        errorNotification.innerHTML = `<i class="codicon codicon-error"></i> ${message}`;
        document.body.appendChild(errorNotification);
        
        setTimeout(() => {
            errorNotification.remove();
        }, 5000);
    }
    
    function remainHeight() {
        return window.outerHeight - 150;
    }
    
    // Initialize
    vscode.postMessage({ type: 'init' });
})();
