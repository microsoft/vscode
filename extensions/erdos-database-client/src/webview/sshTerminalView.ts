/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';

export class SshTerminalView extends WebviewBase {
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.sshTerminal', 'SSH Terminal');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'ssh-terminal.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'terminal.css']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>SSH Terminal</title>
        </head>
        <body>
            <div class="box">
                <div id="header">
                    <div id="status">Disconnected</div>
                </div>
                <div id="terminal-container" class="terminal"></div>
            </div>
            
            <!-- Terminal Controls (Hidden by default, shown on hover) -->
            <div class="terminal-controls">
                <button id="connectBtn" class="btn btn-primary">Connect</button>
                <button id="disconnectBtn" class="btn btn-secondary" disabled>Disconnect</button>
                <button id="clearBtn" class="btn btn-secondary">Clear</button>
            </div>
            
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        switch (message.type) {
            case 'ready':
                this.initializeTerminal();
                break;
            case 'connect':
                this.connect(message.config);
                break;
            case 'disconnect':
                this.disconnect();
                break;
            case 'sendData':
                this.sendData(message.data);
                break;
            case 'resize':
                this.resize(message.cols, message.rows);
                break;
            case 'initTerminal':
                this.handleTerminalInit(message.cols, message.rows);
                break;
            case 'openLink':
                this.openLink(message.uri);
                break;
        }
    }
    
    private redisConnection: any;
    
    public setConnection(connection: any): void {
        this.redisConnection = connection;
        this.initializeTerminal();
    }
    
    private async initializeTerminal(): Promise<void> {
        this._panel.webview.postMessage({
            type: 'terminalReady',
            connection: {
                host: this.redisConnection.host,
                port: this.redisConnection.port
            }
        });
    }
    
    private async connect(config: any): Promise<void> {
        try {
            if (!this.redisConnection) {
                throw new Error('No connection available');
            }
            
            // Send connecting status
            this._panel.webview.postMessage({
                type: 'connecting',
                content: 'Establishing connection...\r\n'
            });
            
            // Test connection
            const client = await this.redisConnection.getClient();
            const info = await client.info();
            
            this._panel.webview.postMessage({
                type: 'connected',
                message: `Connected to ${this.redisConnection.host}:${this.redisConnection.port}`
            });
            
            // Send initial connection info
            this._panel.webview.postMessage({
                type: 'data',
                content: `Redis Server Info:\r\n${info.substring(0, 200)}...\r\n\r\n> `
            });
            
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'ssherror',
                data: error.message
            });
        }
    }
    
    private disconnect(): void {
        this._panel.webview.postMessage({
            type: 'disconnected'
        });
    }
    
    private async sendData(data: string): Promise<void> {
        try {
            if (!this.redisConnection) {
                throw new Error('No Redis connection available');
            }
            
            const client = await this.redisConnection.getClient();
            const splitCommand: string[] = data.replace(/ +/g, " ").split(' ');
            const command = splitCommand.shift();
            const reply = await client.send_command(command, splitCommand);
            
            this._panel.webview.postMessage({
                type: 'commandResult',
                result: reply
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private resize(cols: number, rows: number): void {
        // Terminal resize is handled by xterm.js on the frontend
        this._panel.webview.postMessage({
            type: 'resize',
            cols,
            rows
        });
    }
    
    private handleTerminalInit(cols: number, rows: number): void {
        // Terminal initialization complete, ready for commands
        this._panel.webview.postMessage({
            type: 'status',
            data: `Terminal initialized (${cols}x${rows})`
        });
    }
    
    private openLink(uri: string): void {
        // Open external links
        vscode.env.openExternal(vscode.Uri.parse(uri));
    }
    
    public sendTerminalConfig(config: any): void {
        this._panel.webview.postMessage({
            type: 'terminalConfig',
            data: config
        });
    }
    
    public sendPath(path: string): void {
        this._panel.webview.postMessage({
            type: 'path',
            path: path
        });
    }
}
