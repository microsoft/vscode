/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';
import { QueryUnit } from '../service/queryUnit';
import { ConnectionManager } from '../service/connectionManager';

export interface ColumnInfo {
    name: string;
    type: string;
    comment: string;
    maxLength: number;
    defaultValue: string;
    isPrimary: boolean;
    isUnique: boolean;
    nullable: string;
    isAutoIncrement: boolean;
}

export interface IndexInfo {
    index_name: string;
    column_name: string;
    non_unique: boolean;
    index_type: string;
}

export class DesignView extends WebviewBase {
    private currentTable: string = '';
    private currentDatabase: string = '';
    
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.design', 'Database Designer');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'design.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'design.css']);
        const gridUri = this.getWebviewUri(['media', 'data-grid.js']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Database Designer</title>
        </head>
        <body>
            <div class="design-container">
                <!-- Table Info Panel (Always Visible) -->
                <div class="info-panel">
                    <div class="form-group">
                        <label for="tableNameInput">Table <span class="text-red">*</span>:</label>
                        <input id="tableNameInput" type="text" class="form-control" />
                    </div>
                    <div class="form-group">
                        <label for="tableComment">Comment <span class="text-red">*</span>:</label>
                        <input id="tableComment" type="text" class="form-control" />
                    </div>
                    <button id="updateTableBtn" class="btn btn-success">Update</button>
                    <button id="refreshBtn" class="btn btn-success">
                        <i class="codicon codicon-refresh"></i> Refresh
                    </button>
                </div>
                
                <!-- Tab Navigation -->
                <div class="design-tabs">
                    <button class="tab-btn active" data-tab="columns">Columns</button>
                    <button class="tab-btn" data-tab="indexes">Indexes</button>
                </div>
                
                <!-- Columns Panel -->
                <div id="columnsPanel" class="tab-panel active">
                    <div class="panel-toolbar">
                        <button id="addColumnBtn" class="btn btn-primary">
                            <i class="codicon codicon-add"></i> Add Column
                        </button>
                    </div>
                    <div class="columns-grid" id="columnsGrid"></div>
                </div>
                
                <!-- Indexes Panel -->
                <div id="indexesPanel" class="tab-panel" style="display: none;">
                    <div class="panel-toolbar">
                        <button id="addIndexBtn" class="btn btn-primary">
                            <i class="codicon codicon-add"></i> Add Index
                        </button>
                    </div>
                    <div class="indexes-grid" id="indexesGrid"></div>
                </div>
                
                <!-- Add/Edit Column Dialog -->
                <div id="columnDialog" class="dialog" style="display: none;">
                    <div class="dialog-content">
                        <h3 id="columnDialogTitle">Add Column</h3>
                        <div class="dialog-body">
                            <div class="form-group">
                                <label for="columnName">Name:</label>
                                <input id="columnName" type="text" class="form-control" required />
                            </div>
                            <div class="form-group">
                                <label for="columnType">Type:</label>
                                <input id="columnType" type="text" class="form-control" required />
                            </div>
                            <div class="form-group">
                                <label for="columnComment">Comment:</label>
                                <input id="columnComment" type="text" class="form-control" />
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="columnNotNull"> Not Null
                                </label>
                            </div>
                        </div>
                        <div class="dialog-footer">
                            <button id="saveColumnBtn" class="btn btn-primary">Save</button>
                            <button id="cancelColumnBtn" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
                
                <!-- Add Index Dialog -->
                <div id="indexDialog" class="dialog" style="display: none;">
                    <div class="dialog-content">
                        <h3>Add Index</h3>
                        <div class="dialog-body">
                            <div class="form-group">
                                <label for="indexColumn">Column:</label>
                                <select id="indexColumn" class="form-control">
                                    <!-- Options populated dynamically -->
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="indexType">Index Type:</label>
                                <select id="indexType" class="form-control">
                                    <option value="UNIQUE">UNIQUE</option>
                                    <option value="INDEX">INDEX</option>
                                    <option value="PRIMARY KEY">PRIMARY KEY</option>
                                </select>
                            </div>
                        </div>
                        <div class="dialog-footer">
                            <button id="saveIndexBtn" class="btn btn-primary">Create</button>
                            <button id="cancelIndexBtn" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <script src="${gridUri}"></script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        switch (message.type) {
            case 'loadTable':
                this.requestTableDesign(message.table);
                break;
            case 'updateTable':
                this.sendUpdateTable(message.newTableName, message.newComment);
                break;
            case 'addColumn':
                this.sendAddColumn(message.column);
                break;
            case 'updateColumn':
                this.sendUpdateColumn(message.column);
                break;
            case 'deleteColumn':
                this.sendDeleteColumn(message.columnName);
                break;
            case 'addIndex':
                this.sendAddIndex(message.index);
                break;
            case 'deleteIndex':
                this.sendDeleteIndex(message.indexName);
                break;
            case 'refresh':
                this.requestTableDesign(this.currentTable);
                break;
        }
    }
    
    private async requestTableDesign(table: string): Promise<void> {
        this.currentTable = table;
        // Use existing QueryUnit and ConnectionManager to load table design
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            const columns = await QueryUnit.queryPromise(connection, `DESCRIBE ${table}`);
            const indexes = await QueryUnit.queryPromise(connection, `SHOW INDEX FROM ${table}`);
            
            this._panel.webview.postMessage({
                type: 'designData',
                data: {
                    table,
                    columns,
                    indexes,
                    comment: '', // Load from information_schema if needed
                    dbType: ConnectionManager.activeNode?.dbType || 'mysql'
                }
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message
            });
        }
    }
    
    private async sendUpdateTable(newTableName: string, newComment: string): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            if (newTableName !== this.currentTable) {
                await QueryUnit.queryPromise(connection, `ALTER TABLE ${this.currentTable} RENAME TO ${newTableName}`);
                this.currentTable = newTableName;
            }
            if (newComment) {
                await QueryUnit.queryPromise(connection, `ALTER TABLE ${this.currentTable} COMMENT = '${newComment}'`);
            }
            this._panel.webview.postMessage({ type: 'success', message: 'Table updated successfully' });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    private async sendAddColumn(column: ColumnInfo): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            const sql = `ALTER TABLE ${this.currentTable} ADD COLUMN ${column.name} ${column.type} ${column.nullable === 'NO' ? 'NOT NULL' : 'NULL'} COMMENT '${column.comment || ''}'`;
            await QueryUnit.queryPromise(connection, sql);
            this._panel.webview.postMessage({ type: 'success', message: 'Column added successfully' });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    private async sendUpdateColumn(column: any): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            const sql = `ALTER TABLE ${this.currentTable} MODIFY COLUMN ${column.name} ${column.type} ${column.nullable === 'NO' ? 'NOT NULL' : 'NULL'} COMMENT '${column.comment || ''}'`;
            await QueryUnit.queryPromise(connection, sql);
            this._panel.webview.postMessage({ type: 'success', message: 'Column updated successfully' });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    private async sendDeleteColumn(columnName: string): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            await QueryUnit.queryPromise(connection, `ALTER TABLE ${this.currentTable} DROP COLUMN ${columnName}`);
            this._panel.webview.postMessage({ type: 'success', message: 'Column deleted successfully' });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    private async sendAddIndex(index: any): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            const indexName = `idx_${this.currentTable}_${index.column}`;
            const sql = `CREATE ${index.type === 'UNIQUE' ? 'UNIQUE' : ''} INDEX ${indexName} ON ${this.currentTable} (${index.column})`;
            await QueryUnit.queryPromise(connection, sql);
            this._panel.webview.postMessage({ type: 'success', message: 'Index created successfully' });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    private async sendDeleteIndex(indexName: string): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(ConnectionManager.activeNode);
            await QueryUnit.queryPromise(connection, `DROP INDEX ${indexName} ON ${this.currentTable}`);
            this._panel.webview.postMessage({ type: 'success', message: 'Index deleted successfully' });
        } catch (error) {
            this._panel.webview.postMessage({ type: 'error', message: error.message });
        }
    }
    
    public setTable(tableName: string, database: string): void {
        this.currentTable = tableName;
        this.currentDatabase = database;
        this.requestTableDesign(tableName);
    }
}








