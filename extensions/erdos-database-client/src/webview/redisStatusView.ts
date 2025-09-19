/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';

export interface RedisInfo {
    redis_version: string;
    os: string;
    process_id: string;
    used_memory_human: string;
    used_memory_peak_human: string;
    used_memory_lua: number;
    connected_clients: string;
    total_connections_received: string;
    total_commands_processed: string;
    [key: string]: any;
}

export interface DBKeyStats {
    db: string;
    keys: number;
    expires: number;
    avg_ttl: number;
}

export class RedisStatusView extends WebviewBase {
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.redisStatus', 'Redis Status');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'redis-status.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'redis.css']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Redis Status</title>
        </head>
        <body>
            <div class="redis-status">
                <!-- Auto Refresh Controls -->
                <div class="refresh-controls">
                    <div class="auto-refresh">
                        <label>
                            <i class="codicon codicon-refresh"></i>
                            Auto Refresh
                        </label>
                        <input type="checkbox" id="autoRefreshToggle" />
                        <span class="refresh-interval">Every 2 seconds</span>
                    </div>
                </div>
                
                <!-- Server Status Cards -->
                <div class="status-cards">
                    <!-- Server Info Card -->
                    <div class="status-card">
                        <div class="card-header">
                            <i class="codicon codicon-server"></i>
                            <span>Server</span>
                        </div>
                        <div class="card-content">
                            <div class="status-item">
                                <span class="label">Redis Version:</span>
                                <span id="redisVersion" class="value">-</span>
                            </div>
                            <div class="status-item">
                                <span class="label">OS:</span>
                                <span id="osInfo" class="value">-</span>
                            </div>
                            <div class="status-item">
                                <span class="label">Process ID:</span>
                                <span id="processId" class="value">-</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Memory Info Card -->
                    <div class="status-card">
                        <div class="card-header">
                            <i class="codicon codicon-chip"></i>
                            <span>Memory</span>
                        </div>
                        <div class="card-content">
                            <div class="status-item">
                                <span class="label">Used Memory:</span>
                                <span id="usedMemory" class="value">-</span>
                            </div>
                            <div class="status-item">
                                <span class="label">Used Memory Peak:</span>
                                <span id="usedMemoryPeak" class="value">-</span>
                            </div>
                            <div class="status-item">
                                <span class="label">Used Memory Lua:</span>
                                <span id="usedMemoryLua" class="value">-</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Stats Info Card -->
                    <div class="status-card">
                        <div class="card-header">
                            <i class="codicon codicon-graph"></i>
                            <span>Stats</span>
                        </div>
                        <div class="card-content">
                            <div class="status-item">
                                <span class="label">Connected Clients:</span>
                                <span id="connectedClients" class="value">-</span>
                            </div>
                            <div class="status-item">
                                <span class="label">Total Connections:</span>
                                <span id="totalConnections" class="value">-</span>
                            </div>
                            <div class="status-item">
                                <span class="label">Total Commands:</span>
                                <span id="totalCommands" class="value">-</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Key Statistics Table -->
                <div class="status-section">
                    <div class="section-header">
                        <i class="codicon codicon-graph-line"></i>
                        <span>Key Statistics</span>
                    </div>
                    <div class="table-container">
                        <table id="keyStatsTable" class="data-table">
                            <thead>
                                <tr>
                                    <th>DB</th>
                                    <th class="sortable" data-sort="keys">Keys</th>
                                    <th class="sortable" data-sort="expires">Expires</th>
                                    <th class="sortable" data-sort="avg_ttl">Avg TTL</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Dynamic content -->
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- All Redis Info Table -->
                <div class="status-section">
                    <div class="section-header">
                        <i class="codicon codicon-info"></i>
                        <span>All Redis Info</span>
                    </div>
                    <div class="table-container">
                        <table id="allInfoTable" class="data-table">
                            <thead>
                                <tr>
                                    <th>Key</th>
                                    <th>Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Dynamic content -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        switch (message.type) {
            case 'toggleAutoRefresh':
                this.toggleAutoRefresh(message.enabled);
                break;
            case 'refreshStatus':
                this.refreshStatus();
                break;
            case 'route':
                this.handleRouteEvent(message.routeName);
                break;
            case 'showMessage':
                this.showMessage(message.level, message.message);
                break;
        }
    }
    
    private redisClient: any;
    private autoRefreshTimer: NodeJS.Timeout | null = null;
    private autoRefreshInterval = 2000; // 2 seconds
    private currentInfo: RedisInfo = {} as RedisInfo;
    
    public setRedisClient(client: any): void {
        this.redisClient = client;
        this.refreshStatus();
    }
    
    public handleRouteEvent(routeName: string): void {
        // Handle route-based refresh like Vue does
        this.refreshStatus();
    }
    
    private async refreshStatus(): Promise<void> {
        try {
            if (!this.redisClient) {
                throw new Error('No Redis client available');
            }
            
            const info = await this.redisClient.info();
            const parsedInfo = this.parseRedisInfo(info);
            this.currentInfo = parsedInfo;
            
            this._panel.webview.postMessage({
                type: 'info',
                info: info // Send raw info string like Vue does
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private parseRedisInfo(infoString: string): RedisInfo {
        const lines = infoString.split('\n');
        const info: any = {};
        
        for (let i of lines) {
            i = i.replace(/\s/gi, ''); // Remove all whitespace like Vue does
            if (i.startsWith('#') || !i) continue;
            
            const kv = i.split(':');
            if (kv[0] && kv[1] !== undefined) {
                info[kv[0]] = kv[1];
            }
        }
        
        return info;
    }
    
    private extractDBStats(info: RedisInfo): DBKeyStats[] {
        const dbStats: DBKeyStats[] = [];
        
        for (const [key, value] of Object.entries(info)) {
            if (key.startsWith('db')) {
                const parts = value.split(',');
                const keys = parseInt(parts[0]?.split('=')[1] || '0');
                const expires = parseInt(parts[1]?.split('=')[1] || '0');
                const avg_ttl = parseInt(parts[2]?.split('=')[1] || '0');
                
                dbStats.push({
                    db: key,
                    keys,
                    expires,
                    avg_ttl
                });
            }
        }
        
        return dbStats;
    }
    
    private toggleAutoRefresh(enabled: boolean): void {
        // Clear existing timer first
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
        
        // Set up new timer that checks autoRefresh state like Vue does
        this.autoRefreshTimer = setInterval(() => {
            if (enabled) {
                this.handleRouteEvent('redisStatus'); // Simulate route emission
            }
        }, this.autoRefreshInterval);
    }
    
    public dispose(): void {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
        super.dispose();
    }
    
    // Computed properties equivalent to Vue's computed
    public getDBKeys(): DBKeyStats[] {
        const dbs: DBKeyStats[] = [];
        
        for (const i in this.currentInfo) {
            if (i.startsWith('db')) {
                const item = this.currentInfo[i];
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
    
    public getAllRedisInfo(): Array<{key: string, value: string}> {
        const infos: Array<{key: string, value: string}> = [];
        
        for (const i in this.currentInfo) {
            infos.push({ key: i, value: this.currentInfo[i] });
        }
        
        return infos;
    }
    
    private showMessage(level: string, message: string): void {
        // Use VS Code's real notification system
        if (level === 'error') {
            vscode.window.showErrorMessage(message);
        } else {
            vscode.window.showInformationMessage(message);
        }
    }
}
