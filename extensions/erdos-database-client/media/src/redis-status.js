/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Redis Status Dashboard functionality - based on redisStatus.vue
class RedisStatus {
    constructor() {
        this.autoRefresh = false;
        this.connectionStatus = {};
        this.dbKeyStats = [];
        this.allRedisInfo = [];
        this.refreshTimer = null;
        this.refreshInterval = 2000;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupVSCodeMessaging();
        this.initializeElements();
        this.refreshInit(); // Initialize refresh timer like Vue's mounted
    }
    
    initializeElements() {
        this.autoRefreshToggle = document.getElementById('autoRefreshToggle');
        this.redisVersion = document.getElementById('redisVersion');
        this.osInfo = document.getElementById('osInfo');
        this.processId = document.getElementById('processId');
        this.usedMemory = document.getElementById('usedMemory');
        this.usedMemoryPeak = document.getElementById('usedMemoryPeak');
        this.usedMemoryLua = document.getElementById('usedMemoryLua');
        this.connectedClients = document.getElementById('connectedClients');
        this.totalConnections = document.getElementById('totalConnections');
        this.totalCommands = document.getElementById('totalCommands');
        this.keyStatsTable = document.getElementById('keyStatsTable');
        this.allInfoTable = document.getElementById('allInfoTable');
        
        if (!this.autoRefreshToggle) {
            console.error('Required DOM elements not found');
            return;
        }
    }
    
    setupEventListeners() {
        // Auto refresh toggle
        document.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'autoRefreshToggle') {
                this.toggleAutoRefresh(e.target.checked);
            }
        });
        
        // Table sorting
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('sortable')) {
                const sortField = e.target.dataset.sort;
                if (sortField) {
                    this.sortTable(sortField);
                }
            }
        });
    }
    
    setupVSCodeMessaging() {
        // Listen for messages from VS Code extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            
            switch (message.type) {
                case 'info':
                    this.initStatus(message.info);
                    break;
                case 'error':
                    this.showError(message.message);
                    break;
            }
        });
    }
    
    toggleAutoRefresh(enabled) {
        this.autoRefresh = enabled;
        this.refreshInit();
    }
    
    initStatus(content) {
        if (!content) {
            return {};
        }
        
        const lines = content.split('\n');
        const status = {};
        
        for (let i of lines) {
            i = i.replace(/\s/gi, ''); // Remove whitespace like Vue
            if (i.startsWith('#') || !i) continue;
            
            const kv = i.split(':');
            status[kv[0]] = kv[1];
        }
        
        this.connectionStatus = status;
        this.updateServerInfo();
        this.updateMemoryInfo();
        this.updateStatsInfo();
        this.updateKeyStatsTable();
        this.updateAllInfoTable();
    }
    
    updateServerInfo() {
        if (this.redisVersion) {
            this.redisVersion.textContent = this.connectionStatus.redis_version || '-';
        }
        if (this.osInfo) {
            this.osInfo.textContent = this.connectionStatus.os || '-';
            this.osInfo.title = this.connectionStatus.os || '';
        }
        if (this.processId) {
            this.processId.textContent = this.connectionStatus.process_id || '-';
        }
    }
    
    updateMemoryInfo() {
        if (this.usedMemory) {
            this.usedMemory.textContent = this.connectionStatus.used_memory_human || '-';
        }
        if (this.usedMemoryPeak) {
            this.usedMemoryPeak.textContent = this.connectionStatus.used_memory_peak_human || '-';
        }
        if (this.usedMemoryLua) {
            const luaMemory = this.connectionStatus.used_memory_lua;
            this.usedMemoryLua.textContent = luaMemory ? 
                Math.round(luaMemory / 1024) + 'K' : '-';
        }
    }
    
    updateStatsInfo() {
        if (this.connectedClients) {
            this.connectedClients.textContent = this.connectionStatus.connected_clients || '-';
        }
        if (this.totalConnections) {
            this.totalConnections.textContent = this.connectionStatus.total_connections_received || '-';
        }
        if (this.totalCommands) {
            this.totalCommands.textContent = this.connectionStatus.total_commands_processed || '-';
        }
    }
    
    updateKeyStatsTable() {
        if (!this.keyStatsTable) return;
        
        const tbody = this.keyStatsTable.querySelector('tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        const dbKeys = this.getDBKeys();
        dbKeys.forEach(stat => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${stat.db}</td>
                <td>${stat.keys}</td>
                <td>${stat.expires}</td>
                <td>${stat.avg_ttl}</td>
            `;
            tbody.appendChild(row);
        });
    }
    
    updateAllInfoTable() {
        if (!this.allInfoTable) return;
        
        const tbody = this.allInfoTable.querySelector('tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        const allInfo = this.getAllRedisInfo();
        allInfo.forEach(info => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${info.key}</td>
                <td>${info.value}</td>
            `;
            tbody.appendChild(row);
        });
    }
    
    sortTable(field) {
        // Sort key stats by the specified field using Vue's sort methods
        const dbKeys = this.getDBKeys();
        
        switch (field) {
            case 'keys':
                dbKeys.sort(this.sortByKeys);
                break;
            case 'expires':
                dbKeys.sort(this.sortByExpires);
                break;
            case 'avg_ttl':
                dbKeys.sort(this.sortByTTL);
                break;
        }
        
        this.dbKeyStats = dbKeys;
        this.updateKeyStatsTable();
        
        // Update sort indicators
        const sortableHeaders = document.querySelectorAll('.sortable');
        sortableHeaders.forEach(header => {
            header.classList.remove('sorted-asc', 'sorted-desc');
        });
        
        const currentHeader = document.querySelector(`[data-sort="${field}"]`);
        if (currentHeader) {
            currentHeader.classList.add('sorted-desc');
        }
    }
    
    showError(message) {
        console.error('Redis Status Error:', message);
        
        // Send to VS Code extension for real error notifications
        vscode.postMessage({
            type: 'showMessage', 
            level: 'error',
            message: `Redis Status Error: ${message}`
        });
    }
    
    refreshStatus() {
        vscode.postMessage({
            type: 'refreshStatus'
        });
    }
    
    refreshInit() {
        // Clear existing timer
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        // Set up timer like Vue does
        this.refreshTimer = setInterval(() => {
            if (this.autoRefresh) {
                vscode.postMessage({
                    type: 'route',
                    routeName: 'redisStatus'
                });
            }
        }, this.refreshInterval);
    }
    
    // Vue's computed properties equivalent
    getDBKeys() {
        const dbs = [];
        
        for (const i in this.connectionStatus) {
            if (i.startsWith('db')) {
                const item = this.connectionStatus[i];
                const array = item.split(',');
                
                dbs.push({
                    db: i,
                    keys: parseInt(array[0].split('=')[1]) || 0,
                    expires: parseInt(array[1].split('=')[1]) || 0,
                    avg_ttl: parseInt(array[2].split('=')[1]) || 0
                });
            }
        }
        
        return dbs;
    }
    
    getAllRedisInfo() {
        const infos = [];
        
        for (const i in this.connectionStatus) {
            infos.push({ key: i, value: this.connectionStatus[i] });
        }
        
        return infos;
    }
    
    // Vue's sort methods
    sortByKeys(a, b) {
        return a.keys - b.keys;
    }
    
    sortByExpires(a, b) {
        return a.expires - b.expires;
    }
    
    sortByTTL(a, b) {
        return a.avg_ttl - b.avg_ttl;
    }
}

// Initialize VS Code messaging
const vscode = acquireVsCodeApi();

// Initialize status dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RedisStatus();
});
