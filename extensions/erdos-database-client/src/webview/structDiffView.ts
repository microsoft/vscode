/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';
import { DiffService } from '../service/diff/diffService';
import { DbTreeDataProvider } from '../provider/treeDataProvider';
import { UserGroup } from '../model/database/userGroup';
import { InfoNode } from '../model/other/infoNode';
import { ConnectionManager } from '../service/connectionManager';
import { QueryUnit } from '../service/queryUnit';
import { Node } from '../model/interface/node';
import { TableNode } from '../model/main/tableNode';
import { ColumnNode } from '../model/other/columnNode';
import { DatabaseType } from '../common/constants';
import { TableGroup } from '../model/main/tableGroup';

export interface ComparisonOption {
    from: {
        connection: string;
        database: string;
        db?: any;
    };
    to: {
        connection: string;
        database: string;
        db?: any;
    };
}

export interface ComparisonResult {
    sqlList: Array<{
        type: string;
        sql: string;
        selected: boolean;
    }>;
}

export class StructDiffView extends WebviewBase {
    constructor(
        extensionUri: vscode.Uri,
        private provider: DbTreeDataProvider
    ) {
        super(extensionUri, 'erdos.structDiff', 'Schema Comparison');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'struct-diff.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'common.css']);
        const gridUri = this.getWebviewUri(['media', 'data-grid.js']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Schema Comparison</title>
            <style>
                body {
                    padding: 16px;
                    font-family: var(--vscode-font-family);
                    background: var(--vscode-editor-background);
                    color: var(--vscode-foreground);
                }
                .struct-diff-container {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .comparison-options {
                    display: flex;
                    gap: 20px;
                    flex-wrap: wrap;
                }
                .option-panel {
                    flex: 1;
                    min-width: 300px;
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 16px;
                    background: var(--vscode-editor-background);
                }
                .option-panel h4 {
                    margin: 0 0 16px 0;
                    color: var(--vscode-foreground);
                    font-size: 14px;
                    font-weight: 600;
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
                .comparison-actions {
                    text-align: center;
                    padding: 16px 0;
                }
                .btn {
                    padding: 8px 16px;
                    border: 1px solid var(--vscode-button-border);
                    border-radius: 2px;
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    text-decoration: none;
                    transition: all 0.2s ease;
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
                .comparison-results {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .results-toolbar {
                    display: flex;
                    gap: 8px;
                    padding: 12px;
                    background: var(--vscode-list-activeSelectionBackground);
                    border-bottom: 1px solid var(--vscode-widget-border);
                }
                .results-grid {
                    flex: 1;
                    overflow: auto;
                }
                .loading {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    color: var(--vscode-descriptionForeground);
                }
                .error-message {
                    padding: 12px;
                    background: var(--vscode-inputValidation-errorBackground);
                    color: var(--vscode-inputValidation-errorForeground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    border-radius: 4px;
                    margin: 16px 0;
                }
            </style>
        </head>
        <body>
            <div class="struct-diff-container">
                <div class="comparison-options">
                    <div class="option-panel">
                        <h4>Target</h4>
                        <div class="form-group">
                            <label for="fromConnection">Connection:</label>
                            <select id="fromConnection" class="form-control">
                                <!-- Options populated dynamically -->
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="fromDatabase">Database:</label>
                            <select id="fromDatabase" class="form-control">
                                <!-- Options populated dynamically -->
                            </select>
                        </div>
                    </div>
                    
                    <div class="option-panel">
                        <h4>Sync From</h4>
                        <div class="form-group">
                            <label for="toConnection">Connection:</label>
                            <select id="toConnection" class="form-control">
                                <!-- Options populated dynamically -->
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="toDatabase">Database:</label>
                            <select id="toDatabase" class="form-control">
                                <!-- Options populated dynamically -->
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="comparison-actions">
                    <button id="compareBtn" class="btn btn-danger">
                        <i class="codicon codicon-compare-changes"></i> Compare
                    </button>
                </div>
                
                <div id="comparisonResults" class="comparison-results hidden">
                    <div class="results-toolbar">
                        <button id="syncBtn" class="btn btn-success">
                            <i class="codicon codicon-sync"></i> Sync
                        </button>
                        <button id="selectAllBtn" class="btn btn-secondary">Select All</button>
                        <button id="selectNoneBtn" class="btn btn-secondary">Select None</button>
                    </div>
                    
                    <div class="results-grid" id="resultsGrid"></div>
                </div>
                
                <div id="loadingPanel" class="loading hidden">
                    <div class="spinner"></div>
                    <span>Comparing schemas...</span>
                </div>
                
                <div id="errorPanel" class="error-message hidden">
                    <span id="errorText"></span>
                </div>
            </div>
            
            <script src="${gridUri}"></script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        // Integrate with existing DiffService using the established message pattern
        switch (message.type) {
            case 'init':
                this.initializeView();
                break;
            case 'start':
                this.startComparison(message.option);
                break;
            case 'sync':
                this.syncChanges(message.sqlList, message.option);
                break;
        }
    }
    
    private async initializeView(): Promise<void> {
        // Use existing provider to get connection data
        const nodes = await this.provider.getConnectionNodes();
        const databaseList = {};
        
        // Process nodes to get database lists (existing logic)
        for (const node of nodes) {
            try {
                databaseList[node.uid] = (await node.getChildren()).filter(dbNode => !(dbNode instanceof UserGroup));
            } catch (error) {
                databaseList[node.uid] = [new InfoNode("Load fail.")];
            }
        }
        
        this._panel.webview.postMessage({
            type: 'structDiffData',
            data: { nodes, databaseList }
        });
    }
    
    private async startComparison(option: any): Promise<void> {
        try {
            if (!option.from.db || !option.to.db) {
                throw new Error('Both source and target databases must be selected');
            }

            const fromTables = await this.getTablesFromNode(option.from.db);
            const toTables = await this.getTablesFromNode(option.to.db);
            
            const sqlList = await this.compareTables(fromTables, toTables);
            
            this._panel.webview.postMessage({
                type: 'compareResult',
                result: { sqlList }
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message || 'Comparison failed'
            });
        }
    }
    
    private async syncChanges(sqlList: any[], option: any): Promise<void> {
        try {
            if (!option.from.db) {
                throw new Error('Target database not selected');
            }

            // Execute SQL statements against the target database
            const connection = await ConnectionManager.getConnection(option.from.db);
            
            for (const sqlItem of sqlList) {
                if (sqlItem.selected !== false) { // Execute if not explicitly unselected
                    await QueryUnit.queryPromise(connection, sqlItem.sql);
                }
            }
            
            this._panel.webview.postMessage({
                type: 'syncSuccess'
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'error',
                message: error.message || 'Sync failed'
            });
        }
    }

    private async getTablesFromNode(dbNode: any): Promise<Node[]> {
        const children = await dbNode.getChildren();
        const tables: Node[] = [];
        
        for (const child of children) {
            if (child instanceof TableGroup) {
                const tableChildren = await child.getChildren();
                tables.push(...tableChildren);
            } else if (child instanceof TableNode) {
                tables.push(child);
            }
        }
        
        return tables;
    }

    private async compareTables(fromTables: Node[], toTables: Node[]): Promise<any[]> {
        let toTablesMap = {};
        let sqlList: any[] = [];
        
        for (const table of toTables) {
            toTablesMap[table.label] = table;
        }

        for (const table of fromTables) {
            if (toTablesMap[table.label]) {
                const fromChilds = await table.getChildren();
                const toChilds = await (toTablesMap[table.label] as TableNode).getChildren();
                sqlList.push(...await this.compareColumns(fromChilds, toChilds));
                delete toTablesMap[table.label];
            } else {
                sqlList.push({ type: 'remove', sql: `DROP TABLE ${table.label}` });
            }
        }

        for (const newTable in toTablesMap) {
            const newTableNode = toTablesMap[newTable] as TableNode;
            try {
                const createSql = await newTableNode.showSource(false);
                sqlList.push({ type: 'add', sql: createSql });
            } catch (error) {
                sqlList.push({ type: 'add', sql: `CREATE TABLE ${newTable} (id INT PRIMARY KEY)` });
            }
        }
        
        return sqlList;
    }

    private async compareColumns(fromColumns: Node[], toColumns: Node[]): Promise<any[]> {
        let toColumnsMap = {};
        let sqlList = [];
        
        for (const column of toColumns) {
            toColumnsMap[column.label] = column;
        }

        fromColumns.forEach((fromColumn: ColumnNode) => {
            if (toColumnsMap[fromColumn.label]) {
                const toColumnNode = toColumnsMap[fromColumn.label] as ColumnNode;
                if (toColumnNode.type !== fromColumn.type) {
                    if (toColumnNode.dbType === DatabaseType.MSSQL || toColumnNode.dbType === DatabaseType.PG) {
                        sqlList.push({ 
                            type: 'change', 
                            sql: `ALTER TABLE ${toColumnNode.table} ALTER COLUMN ${toColumnNode.label} ${toColumnNode.type}` 
                        });
                    } else {
                        sqlList.push({ 
                            type: 'change', 
                            sql: `ALTER TABLE ${toColumnNode.table} CHANGE ${toColumnNode.label} ${toColumnNode.label} ${toColumnNode.type}` 
                        });
                    }
                }
                delete toColumnsMap[fromColumn.label];
            } else {
                sqlList.push({ 
                    type: 'remove', 
                    sql: `ALTER TABLE ${fromColumn.table} DROP COLUMN ${fromColumn.label}` 
                });
            }
        });

        for (const toColumn in toColumnsMap) {
            const newColumnNode = toColumnsMap[toColumn] as ColumnNode;
            if (newColumnNode.dbType === DatabaseType.MSSQL) {
                sqlList.push({ 
                    type: 'add', 
                    sql: `ALTER TABLE ${newColumnNode.table} ADD ${newColumnNode.label} ${newColumnNode.column?.type || 'VARCHAR(255)'}` 
                });
            } else {
                sqlList.push({ 
                    type: 'add', 
                    sql: `ALTER TABLE ${newColumnNode.table} ADD COLUMN ${newColumnNode.label} ${newColumnNode.column?.type || 'VARCHAR(255)'}` 
                });
            }
        }
        
        return sqlList;
    }
}
