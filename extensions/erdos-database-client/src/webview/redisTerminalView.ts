/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';

export class RedisTerminalView extends WebviewBase {
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.redisTerminal', 'Redis Terminal');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'redis-terminal.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'redis.css']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Redis Terminal</title>
        </head>
        <body>
            <div class="redis-terminal">
                <div class="terminal-content">
                    <textarea id="cliContent" readonly rows="22"></textarea>
                </div>
                <div class="terminal-input">
                    <input id="cliInput" type="text" placeholder="Press Enter To Exec Commands, Up and Down To Switch History" autocomplete="off" />
                </div>
            </div>
            
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        switch (message.type) {
            case 'exec':
                this.executeCommand(message.command);
                break;
            case 'clearTerminal':
                this.clearTerminal();
                break;
            case 'ext':
                this.exitTerminal();
                break;
        }
    }
    
    private redisClient: any;
    private commandHistory: string[] = [];
    private config: any;
    
    public setRedisClient(client: any, config: any): void {
        this.redisClient = client;
        this.config = config;
        this._panel.webview.postMessage({
            type: 'config',
            config: config
        });
    }
    
    private async executeCommand(command: string): Promise<void> {
        try {
            if (!command.trim()) return;
            
            // Handle special commands locally in JavaScript
            if (command === 'clear' || command === 'exit' || command === 'quit') {
                return; // These are handled in the frontend
            }
            
            // Add to history
            if (this.commandHistory[this.commandHistory.length - 1] !== command) {
                this.commandHistory.push(command);
            }
            
            // Parse command - handle complex parsing like Vue does
            const args = this.parseCommand(command);
            const cmd = args.shift();
            
            // Execute Redis command
            let result;
            if (cmd && this.redisClient[cmd.toLowerCase()]) {
                result = await this.redisClient[cmd.toLowerCase()](...args);
            } else {
                result = await this.redisClient.send_command(cmd, args);
            }
            
            // Handle special commands that affect state
            if (cmd?.toLowerCase() === 'select' && !isNaN(parseInt(args[0]))) {
                // Database selection - actually change the database like Vue does
                const database = parseInt(args[0]);
                // The Redis client will handle the database selection through the command execution
                // Send notification to UI about database change
                this._panel.webview.postMessage({
                    type: 'changeDb',
                    database: database
                });
            }
            
            this._panel.webview.postMessage({
                type: 'result',
                result: result
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'result',
                result: `Error: ${error.message}`
            });
        }
    }
    
    private parseCommand(command: string): string[] {
        // Parse Redis command arguments
        return command.trim().split(/\s+/);
    }
    
    private clearTerminal(): void {
        this._panel.webview.postMessage({
            type: 'clearTerminal'
        });
    }
    
    private exitTerminal(): void {
        this._panel.webview.postMessage({
            type: 'exit'
        });
        // Actually close the webview panel like Vue's removePreTab does
        this.dispose();
    }
    
    public getCommandHistory(): string[] {
        return this.commandHistory;
    }
    
    public emitRouteEvent(): void {
        // Equivalent to Vue's route emission
        this._panel.webview.postMessage({
            type: 'routeEmitted'
        });
    }
}
