/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';
import { QueryUnit } from '../service/queryUnit';
import { ConnectionManager } from '../service/connectionManager';

export class StatusView extends WebviewBase {
    private refreshInterval: NodeJS.Timer | null = null;
    
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.status', 'Database Status');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'status.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'status.css']);
        const gridUri = this.getWebviewUri(['media', 'data-grid.js']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Database Status</title>
        </head>
        <body>
            <div class="status-container">
                <div class="status-tabs">
                    <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
                    <button class="tab-btn" data-tab="processes">Process List</button>
                    <button class="tab-btn" data-tab="variables">Variables</button>
                    <button class="tab-btn" data-tab="status">Status</button>
                </div>
                
                <!-- Dashboard Panel (MySQL only) -->
                <div id="dashboardPanel" class="tab-panel active">
                    <div class="charts-container">
                        <div class="chart-row">
                            <div class="chart-container">
                                <h4>Queries</h4>
                                <div id="queriesChart" class="chart"></div>
                            </div>
                        </div>
                        <div class="chart-row">
                            <div class="chart-container">
                                <h4>Traffic</h4>
                                <div id="trafficChart" class="chart"></div>
                            </div>
                            <div class="chart-container">
                                <h4>Server Sessions</h4>
                                <div id="sessionsChart" class="chart"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Process List Panel -->
                <div id="processesPanel" class="tab-panel hidden">
                    <div class="processes-grid" id="processesGrid"></div>
                </div>
                
                <!-- Variables Panel -->
                <div id="variablesPanel" class="tab-panel hidden">
                    <div class="variables-grid" id="variablesGrid"></div>
                </div>
                
                <!-- Status Panel -->
                <div id="statusPanel" class="tab-panel hidden">
                    <div class="status-grid" id="statusGrid"></div>
                </div>
            </div>
            
            <script src="${gridUri}"></script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        // Integrate with existing status monitoring using direct database queries
        switch (message.type) {
            case 'init':
                this.initializeStatus();
                break;
            case 'processList':
                this.loadProcessList();
                break;
            case 'variableList':
                this.loadVariableList();
                break;
            case 'statusList':
                this.loadStatusList();
                break;
            case 'dashBoard':
                this.loadDashboard();
                break;
        }
    }
    
    private async initializeStatus(): Promise<void> {
        // Initialize status monitoring with current connection
        this._panel.webview.postMessage({
            type: 'statusInitialized',
            connection: ConnectionManager.activeNode
        });
    }
    
    private async loadProcessList(): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            const processes = await QueryUnit.queryPromise(connection, 'SHOW PROCESSLIST');
            this._panel.webview.postMessage({
                type: 'processList',
                data: processes
            });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    private async loadVariableList(): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            const variables = await QueryUnit.queryPromise(connection, 'SHOW VARIABLES');
            this._panel.webview.postMessage({
                type: 'variableList',
                data: variables
            });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    private async loadStatusList(): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            const status = await QueryUnit.queryPromise(connection, 'SHOW STATUS');
            this._panel.webview.postMessage({
                type: 'statusList',
                data: status
            });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    private async loadDashboard(): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            // Load dashboard metrics
            const queries = await QueryUnit.queryPromise(connection, "SHOW STATUS LIKE 'Queries'");
            const connections = await QueryUnit.queryPromise(connection, "SHOW STATUS LIKE 'Connections'");
            const bytesReceived = await QueryUnit.queryPromise(connection, "SHOW STATUS LIKE 'Bytes_received'");
            const bytesSent = await QueryUnit.queryPromise(connection, "SHOW STATUS LIKE 'Bytes_sent'");
            
            this._panel.webview.postMessage({
                type: 'dashboardData',
                data: {
                    queries: queries[0]?.Value || 0,
                    connections: connections[0]?.Value || 0,
                    bytesReceived: bytesReceived[0]?.Value || 0,
                    bytesSent: bytesSent[0]?.Value || 0
                }
            });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    public dispose(): void {
        // Clean up any intervals or timers
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        super.dispose();
    }
}


