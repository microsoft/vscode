/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';

export class RedisKeyView extends WebviewBase {
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.redisKey', 'Redis Key Viewer');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'redis-key.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'redis.css']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Redis Key Viewer</title>
        </head>
        <body>
            <div class="key-viewer">
                <div class="key-header">
                    <input id="keyName" type="text" placeholder="Key name" />
                    <span id="keyType" class="key-type"></span>
                    <input id="keyTtl" type="number" placeholder="TTL" />
                    <button id="renameBtn" class="btn btn-secondary">
                        <i class="codicon codicon-edit"></i> Rename
                    </button>
                    <button id="deleteBtn" class="btn btn-danger">
                        <i class="codicon codicon-trash"></i> Delete
                    </button>
                    <button id="refreshBtn" class="btn btn-success">
                        <i class="codicon codicon-refresh"></i> Refresh
                    </button>
                </div>
                
                <div class="key-content">
                    <!-- String content -->
                    <div id="stringContent" class="content-panel" style="display: none;">
                        <div class="format-selector">
                            <select id="viewFormat">
                                <option value="text">Text</option>
                                <option value="json">JSON</option>
                                <option value="hex">Hex</option>
                            </select>
                        </div>
                        <textarea id="stringValue" placeholder="String value"></textarea>
                        <button id="saveStringBtn" class="btn btn-primary">Save</button>
                    </div>
                    
                    <!-- List/Set/Hash content -->
                    <div id="collectionContent" class="content-panel" style="display: none;">
                        <div class="collection-toolbar">
                            <button id="addItemBtn" class="btn btn-primary">
                                <i class="codicon codicon-add"></i> Add Item
                            </button>
                        </div>
                        <div class="data-grid" id="collectionGrid"></div>
                    </div>
                </div>
                
                <!-- Add/Edit Dialog -->
                <div id="editDialog" class="dialog" style="display: none;">
                    <div class="dialog-content">
                        <h3 id="dialogTitle">Add Item</h3>
                        <div class="dialog-body">
                            <div class="form-group">
                                <label for="itemKey">Key:</label>
                                <input id="itemKey" type="text" />
                            </div>
                            <div class="form-group">
                                <label for="itemValue">Value:</label>
                                <textarea id="itemValue"></textarea>
                            </div>
                        </div>
                        <div class="dialog-footer">
                            <button id="confirmBtn" class="btn btn-primary">Confirm</button>
                            <button id="cancelBtn" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        switch (message.type) {
            case 'refresh':
                this.refreshKey(message.key);
                break;
            case 'update':
                this.updateKey(message.key);
                break;
            case 'del':
                this.deleteKey(message.key);
                break;
            case 'rename':
                this.renameKey(message.key);
                break;
            case 'ttl':
                this.setTtl(message.key);
                break;
            case 'add':
                this.addCollectionItem(message.key, message.value, message.editModel);
                break;
            case 'deleteLine':
                this.deleteCollectionItem(message.row);
                break;
            case 'showMessage':
                this.showMessage(message.level, message.message);
                break;
        }
    }
    
    private client: any;
    private keyName: string = '';
    private keyType: string = '';
    
    public loadKey(keyName: string, client: any): void {
        this.keyName = keyName;
        this.client = client;
        this.loadKeyData();
    }
    
    private async loadKeyData(): Promise<void> {
        try {
            const type = await this.client.type(this.keyName);
            const ttl = await this.client.ttl(this.keyName);
            this.keyType = type;
            let content: any;
            
            switch (type) {
                case 'string':
                    content = await this.client.get(this.keyName);
                    break;
                case 'list':
                    content = await this.client.lrange(this.keyName, 0, -1);
                    break;
                case 'hash':
                    const hashData = await this.client.hgetall(this.keyName);
                    content = Object.entries(hashData).map(([key, value]) => ({ key, value }));
                    break;
                case 'set':
                    content = await this.client.smembers(this.keyName);
                    break;
                case 'zset':
                    const zsetData = await this.client.zrange(this.keyName, 0, -1, 'WITHSCORES');
                    content = [];
                    for (let i = 0; i < zsetData.length; i += 2) {
                        content.push({ member: zsetData[i], score: zsetData[i + 1] });
                    }
                    break;
            }
            
            this._panel.webview.postMessage({
                type: 'detail',
                res: { name: this.keyName, type, content, ttl }
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private async updateKey(keyData: any): Promise<void> {
        try {
            const { name, type, content } = keyData.key;
            switch (type) {
                case 'string':
                    await this.client.set(name, content);
                    break;
            }
            this._panel.webview.postMessage({
                type: 'msg',
                content: `Key ${name} updated successfully`
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private async deleteKey(keyData: any): Promise<void> {
        try {
            const keyName = keyData.key.name;
            await this.client.del(keyName);
            this._panel.webview.postMessage({
                type: 'msg',
                content: `Key ${keyName} deleted successfully`
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private async renameKey(keyData: any): Promise<void> {
        try {
            const { name, newName } = keyData.key;
            await this.client.rename(name, newName);
            this.keyName = newName;
            this._panel.webview.postMessage({
                type: 'msg',
                content: `Key renamed from ${name} to ${newName}`
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private async setTtl(keyData: any): Promise<void> {
        try {
            const { name, ttl } = keyData.key;
            await this.client.expire(name, ttl);
            this._panel.webview.postMessage({
                type: 'msg',
                content: `TTL set to ${ttl} seconds for key ${name}`
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private async refreshKey(keyData: any): Promise<void> {
        this.keyName = keyData.key.name;
        await this.loadKeyData();
    }
    
    private async addCollectionItem(key: string, value: string, editModel: boolean): Promise<void> {
        try {
            switch (this.keyType) {
                case 'list':
                    await this.client.rpush(this.keyName, value);
                    break;
                case 'set':
                    await this.client.sadd(this.keyName, value);
                    break;
                case 'hash':
                    if (key) {
                        if (editModel) {
                            await this.client.hset(this.keyName, key, value);
                        } else {
                            await this.client.hset(this.keyName, key, value);
                        }
                    }
                    break;
                case 'zset':
                    const score = parseFloat(key) || 0;
                    await this.client.zadd(this.keyName, score, value);
                    break;
            }
            this._panel.webview.postMessage({ type: 'refresh' });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private async deleteCollectionItem(row: any): Promise<void> {
        try {
            switch (this.keyType) {
                case 'list':
                    await this.client.lrem(this.keyName, 1, row);
                    break;
                case 'set':
                    await this.client.srem(this.keyName, row);
                    break;
                case 'hash':
                    await this.client.hdel(this.keyName, row.key);
                    break;
                case 'zset':
                    await this.client.zrem(this.keyName, row.member || row);
                    break;
            }
            this._panel.webview.postMessage({ type: 'refresh' });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
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
