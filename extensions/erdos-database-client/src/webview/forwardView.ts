/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';
import { ForwardService } from '../service/ssh/forward/forwardService';

export interface ForwardRule {
    id: string;
    name: string;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    state: boolean;
}

export class ForwardView extends WebviewBase {
    private forwardService: ForwardService;
    private sshConfig: any;
    
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.forward', 'Port Forwarding');
        this.forwardService = new ForwardService();
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'forward.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'common.css']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Port Forwarding</title>
            <style>
                body {
                    padding: 16px;
                    font-family: var(--vscode-font-family);
                }
                .forward-container {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .toolbar {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                .btn {
                    padding: 6px 12px;
                    border: 1px solid var(--vscode-button-border);
                    border-radius: 2px;
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    text-decoration: none;
                }
                .btn-primary {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .btn-primary:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .btn-secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .btn-secondary:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                .btn-success {
                    background: var(--vscode-testing-iconPassed);
                    color: var(--vscode-button-foreground);
                }
                .btn-danger {
                    background: var(--vscode-testing-iconFailed);
                    color: var(--vscode-button-foreground);
                }
                .error-panel {
                    background: var(--vscode-inputValidation-errorBackground);
                    color: var(--vscode-inputValidation-errorForeground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    padding: 12px;
                    border-radius: 4px;
                }
                .forwards-table {
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .table-header {
                    display: flex;
                    background: var(--vscode-list-activeSelectionBackground);
                    border-bottom: 1px solid var(--vscode-widget-border);
                }
                .table-cell {
                    padding: 8px 12px;
                    border-right: 1px solid var(--vscode-widget-border);
                    font-weight: 600;
                    color: var(--vscode-list-activeSelectionForeground);
                    flex: 1;
                }
                .table-cell:last-child {
                    border-right: none;
                    flex: 0 0 200px;
                }
                .table-row {
                    display: flex;
                    border-bottom: 1px solid var(--vscode-widget-border);
                }
                .table-row:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .table-row .table-cell {
                    font-weight: normal;
                    color: var(--vscode-foreground);
                }
                .actions {
                    display: flex;
                    gap: 4px;
                }
                .dialog {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .dialog-content {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 20px;
                    min-width: 400px;
                    max-width: 600px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }
                .dialog-content h3 {
                    margin: 0 0 16px 0;
                    color: var(--vscode-foreground);
                }
                .form-group {
                    margin-bottom: 12px;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 4px;
                    font-weight: 500;
                    color: var(--vscode-foreground);
                }
                .form-control {
                    width: 100%;
                    padding: 6px 8px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                }
                .form-control:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                .dialog-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 20px;
                }
                .command-display {
                    background: var(--vscode-textCodeBlock-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 12px;
                    margin: 12px 0;
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    word-break: break-all;
                }
            </style>
        </head>
        <body>
            <div class="forward-container">
                <div class="toolbar">
                    <button id="addForwardBtn" class="btn btn-primary">
                        <i class="codicon codicon-add"></i> Add Forward
                    </button>
                    <button id="refreshBtn" class="btn btn-secondary">
                        <i class="codicon codicon-refresh"></i> Refresh
                    </button>
                </div>
                
                <div id="errorPanel" class="error-panel hidden">
                    <p>Connection error! <span id="errorMessage"></span></p>
                </div>
                
                <div class="forwards-table" id="forwardsTable">
                    <div class="table-header">
                        <div class="table-cell">Name</div>
                        <div class="table-cell">Local Host</div>
                        <div class="table-cell">Local Port</div>
                        <div class="table-cell">Remote Host</div>
                        <div class="table-cell">Remote Port</div>
                        <div class="table-cell">State</div>
                        <div class="table-cell">Actions</div>
                    </div>
                    <div class="table-body" id="forwardsBody">
                        <!-- Forwarding rules populated dynamically -->
                    </div>
                </div>
                
                <!-- Add/Edit Forward Dialog -->
                <div id="forwardDialog" class="dialog hidden">
                    <div class="dialog-content">
                        <h3 id="forwardDialogTitle">Create Forward</h3>
                        <div class="dialog-body">
                            <div class="form-group">
                                <label for="forwardName">Name:</label>
                                <input id="forwardName" type="text" class="form-control" required />
                            </div>
                            <div class="form-group">
                                <label for="localHost">Local Host:</label>
                                <input id="localHost" type="text" class="form-control" value="127.0.0.1" required />
                            </div>
                            <div class="form-group">
                                <label for="localPort">Local Port:</label>
                                <input id="localPort" type="number" class="form-control" required />
                            </div>
                            <div class="form-group">
                                <label for="remoteHost">Remote Host:</label>
                                <input id="remoteHost" type="text" class="form-control" value="127.0.0.1" required />
                            </div>
                            <div class="form-group">
                                <label for="remotePort">Remote Port:</label>
                                <input id="remotePort" type="number" class="form-control" required />
                            </div>
                        </div>
                        <div class="dialog-footer">
                            <button id="saveForwardBtn" class="btn btn-primary">Save</button>
                            <button id="cancelForwardBtn" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
                
                <!-- Command Info Dialog -->
                <div id="commandDialog" class="dialog hidden">
                    <div class="dialog-content">
                        <h3>SSH Command</h3>
                        <div class="dialog-body">
                            <div class="command-display">
                                <code id="sshCommand"></code>
                            </div>
                        </div>
                        <div class="dialog-footer">
                            <button id="copyCommandBtn" class="btn btn-primary">Copy</button>
                            <button id="closeCommandBtn" class="btn btn-secondary">Close</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        // Integrate with existing ForwardService using message pattern
        switch (message.type) {
            case 'load':
                this.loadForwardingRules();
                break;
            case 'create':
            case 'update':
                this.saveForwardingRule(message.forward);
                break;
            case 'start':
                this.startTunnel(message.id);
                break;
            case 'stop':
                this.stopTunnel(message.id);
                break;
            case 'remove':
                this.removeForwardingRule(message.id);
                break;
            case 'cmd':
                this.showSSHCommand(message.command);
                break;
        }
    }
    
    public setSSHConfig(sshConfig: any): void {
        this.sshConfig = sshConfig;
        this.loadForwardingRules();
    }
    
    private async loadForwardingRules(): Promise<void> {
        try {
            if (!this.sshConfig) {
                this._panel.webview.postMessage({
                    type: 'forwardRules',
                    rules: []
                });
                return;
            }
            
            const rules = this.forwardService.list(this.sshConfig);
            this._panel.webview.postMessage({
                type: 'forwardRules',
                rules
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message || 'Failed to load forwarding rules'
            });
        }
    }
    
    private async saveForwardingRule(forward: ForwardRule): Promise<void> {
        try {
            if (!this.sshConfig) {
                throw new Error('SSH configuration not set');
            }
            
            await this.forwardService.forward(this.sshConfig, forward);
            this._panel.webview.postMessage({ type: 'success', message: 'Rule saved' });
            this.loadForwardingRules(); // Refresh list
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message || 'Failed to save forwarding rule'
            });
        }
    }
    
    private async startTunnel(id: string): Promise<void> {
        try {
            if (!this.sshConfig) {
                throw new Error('SSH configuration not set');
            }
            
            await this.forwardService.start(this.sshConfig, id);
            this._panel.webview.postMessage({ type: 'tunnelStarted', id });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message || 'Failed to start tunnel'
            });
        }
    }
    
    private async stopTunnel(id: string): Promise<void> {
        try {
            this.forwardService.stop(id);
            this._panel.webview.postMessage({ type: 'tunnelStopped', id });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message || 'Failed to stop tunnel'
            });
        }
    }
    
    private async removeForwardingRule(id: string): Promise<void> {
        try {
            if (!this.sshConfig) {
                throw new Error('SSH configuration not set');
            }
            
            this.forwardService.remove(this.sshConfig, id);
            this._panel.webview.postMessage({ type: 'success', message: 'Rule removed' });
            this.loadForwardingRules();
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message || 'Failed to remove forwarding rule'
            });
        }
    }
    
    private showSSHCommand(command: string): void {
        this._panel.webview.postMessage({
            type: 'sshCommand',
            command
        });
    }
}
