/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';
import { QueryUnit } from '../service/queryUnit';
import { ConnectionManager } from '../service/connectionManager';
import { ExportService } from '../service/export/exportService';
import { ServiceManager } from '../service/serviceManager';
import { EsRequest } from '../model/es/esRequest';
import { Util } from '../common/util';
import { Trans } from '../common/trans';
import { Global } from '../common/global';
import { DatabaseType, MessageType, ConfigKey } from '../common/constants';
import { Node } from '../model/interface/node';
import { QueryParam } from '../service/result/query';

export interface QueryResult {
    sql: string;
    results: any[];
    fields: any[];
    duration: number;
    error?: string;
}

export class ResultView extends WebviewBase {
    private currentResults: QueryResult[] = [];
    private currentConnection: Node | null = null;
    private currentQueryParam: QueryParam<any> | null = null;
    private exportService: ExportService = new ExportService();
    
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.results', 'Query Results');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'results.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'results.css']);
        const codiconsUri = this.getWebviewUri(['media', 'theme', 'codicons.css']);
        const commonStyleUri = this.getWebviewUri(['media', 'css', 'common.css']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${commonStyleUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Query Results</title>
        </head>
        <body>
            <!-- Breadcrumb Navigation -->
            <div class="breadcrumb-container">
                <div class="breadcrumb-path" id="breadcrumbPath">
                    <span class="breadcrumb-item" id="connectionBreadcrumb">
                        <i class="codicon codicon-database"></i>
                        <span id="connectionName">Connection</span>
                    </span>
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item" id="databaseBreadcrumb">
                        <i class="codicon codicon-symbol-folder"></i>
                        <span id="databaseName">Database</span>
                    </span>
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item" id="tableBreadcrumb">
                        <i class="codicon codicon-table"></i>
                        <span id="tableName">Table</span>
                    </span>
                </div>
            </div>
            
            <!-- Main Table Actions Toolbar -->
            <div class="table-actions-toolbar">
                <div class="toolbar-left">
                    <button id="insertBtn" class="btn btn-icon" title="Insert (Add)">
                        <i class="codicon codicon-add"></i>
                    </button>
                    <button id="deleteBtn" class="btn btn-icon" title="Delete">
                        <i class="codicon codicon-trash"></i>
                    </button>
                    <button id="exportBtn" class="btn btn-icon" title="Export">
                        <i class="codicon codicon-go-to-file"></i>
                    </button>
                    <button id="executeBtn" class="btn btn-icon" title="Execute (Run/Play)">
                        <i class="codicon codicon-play"></i>
                    </button>
                </div>
                
                <div class="toolbar-right">
                    <input type="text" id="searchInput" class="search-input" placeholder="Search table data..." />
                </div>
            </div>
            
            <!-- Query Editor Toolbar -->            
            <div class="query-editor">
                <textarea id="queryInput" placeholder="Enter your SQL query here..."></textarea>
            </div>
            
            <div class="results-container">
                <div class="results-info-toolbar" id="resultsInfoToolbar" style="display: none;">
                    <div class="toolbar-right">
                        <div class="pagination-info" id="paginationInfo">
                            <button id="prevPageBtn" class="btn btn-secondary">
                                <i class="codicon codicon-chevron-left"></i>
                            </button>
                            <span>Page <span id="pageNum">1</span> of <span id="totalRows">0</span> rows</span>
                            <button id="nextPageBtn" class="btn btn-secondary">
                                <i class="codicon codicon-chevron-right"></i>
                            </button>
                        </div>
                        <div class="cost-time">Cost: <span id="costTime">0</span>ms</div>
                    </div>
                </div>
                
                <div class="results-content" id="resultsContent">
                    <div id="dataTable" class="data-table-container"></div>
                </div>
                
                <div id="messagePanel" class="message-panel" style="display: none;"></div>
                
                <!-- Export Dialog -->
                <div id="exportDialog" class="dialog" style="display: none;">
                    <div class="dialog-content">
                        <h3>Export Options</h3>
                        <div class="dialog-body">
                            <div class="form-group">
                                <label for="exportType">Export File Type:</label>
                                <select id="exportType" class="form-control">
                                    <option value="csv">CSV</option>
                                    <option value="json">JSON</option>
                                    <option value="xlsx">Excel (XLSX)</option>
                                    <option value="sql">SQL</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="removeLimit"> Remove Limit
                                </label>
                            </div>
                        </div>
                        <div class="dialog-footer">
                            <button id="confirmExportBtn" class="btn btn-primary">Export</button>
                            <button id="cancelExportBtn" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
                
                <!-- Edit Row Dialog -->
                <div id="editDialog" class="dialog" style="display: none;">
                    <div class="dialog-content">
                        <h3 id="editDialogTitle">Edit Row</h3>
                        <div class="dialog-body" id="editDialogBody">
                            <!-- Dynamic form fields will be generated here -->
                        </div>
                        <div class="dialog-footer">
                            <button id="saveRowBtn" class="btn btn-primary">Save</button>
                            <button id="cancelEditBtn" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
                
                <!-- Column Selector Dialog -->
                <div id="columnSelectorDialog" class="dialog" style="display: none;">
                    <div class="dialog-content">
                        <h3>Select columns to show</h3>
                        <div class="dialog-body">
                            <div class="column-checkboxes" id="columnCheckboxes">
                                <!-- Dynamic checkboxes will be generated here -->
                            </div>
                        </div>
                        <div class="dialog-footer">
                            <button id="selectAllColumnsBtn" class="btn btn-secondary">Select All</button>
                            <button id="deselectAllColumnsBtn" class="btn btn-secondary">Deselect All</button>
                            <button id="closeColumnSelectorBtn" class="btn btn-primary">Close</button>
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
            case 'init':
                this.handleInit();
                break;
            case 'execute':
                this.handleExecute(message.sql);
                break;
            case 'next':
                this.handleNext(message.sql, message.pageNum, message.pageSize);
                break;
            case 'export':
                this.handleExport(message.option);
                break;
            case 'saveModify':
                this.handleSaveModify(message.sql);
                break;
            case 'dataModify':
                this.handleDataModify();
                break;
            case 'count':
                this.handleCount(message.sql);
                break;
            case 'esFilter':
                this.handleEsFilter(message.match);
                break;
            case 'esSort':
                this.handleEsSort(message.sort);
                break;
            case 'full':
                this.handleFull();
                break;
            case 'copy':
                this.handleCopy(message.value);
                break;
            case 'changePageSize':
                this.handleChangePageSize(message.pageSize);
                break;
            case 'openCoffee':
                this.handleOpenCoffee();
                break;
        }
    }
    
    private handleInit(): void {
        if (this.currentQueryParam?.res && this.currentQueryParam.res.table) {
            this._panel.title = this.currentQueryParam.res.table;
        }
        if (this.currentQueryParam) {
            this.currentQueryParam.res.transId = Trans.transId;
            this.currentQueryParam.res.viewId = this.currentQueryParam.queryOption?.viewId;
            this._panel.webview.postMessage({
                type: this.currentQueryParam.type,
                content: { 
                    ...this.currentQueryParam.res,
                    dbType: this.currentConnection?.dbType 
                }
            });
        }
    }

    private handleExecute(sql: string): void {
        if (this.currentConnection && this.currentQueryParam) {
            const options = { ...this.currentQueryParam.queryOption, recordHistory: true };
            QueryUnit.runQuery(sql, this.currentConnection, options);
        }
    }

    private async handleNext(sql: string, pageNum: number, pageSize: number): Promise<void> {
        if (!this.currentConnection) return;
        
        const executeTime = new Date().getTime();
        const paginatedSql = ServiceManager.getPageService(this.currentConnection.dbType)
            .build(sql, pageNum, pageSize);
            
        try {
            const rows = await this.currentConnection.execute(paginatedSql);
            const costTime = new Date().getTime() - executeTime;
            this._panel.webview.postMessage({
                type: MessageType.NEXT_PAGE,
                content: { sql: paginatedSql, data: rows, costTime }
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'ERROR',
                content: { message: error.message }
            });
        }
    }

    private async handleExport(option: any): Promise<void> {
        if (this.currentQueryParam) {
            try {
                await this.exportService.export({
                    ...option,
                    request: this.currentQueryParam.res.request,
                    dbOption: this.currentConnection
                });
                this._panel.webview.postMessage({
                    type: 'EXPORT_DONE',
                    content: {}
                });
            } catch (error) {
                this._panel.webview.postMessage({
                    type: 'ERROR',
                    content: { message: error.message }
                });
            }
        }
    }

    private async handleSaveModify(sql: string): Promise<void> {
        if (!this.currentConnection) return;
        
        try {
            await this.currentConnection.execute(sql);
            this._panel.webview.postMessage({
                type: 'updateSuccess',
                content: {}
            });
            // Remove * from title
            this._panel.title = this._panel.title.replace("*", "");
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'updateFail',
                content: { message: error.message }
            });
        }
    }

    private handleDataModify(): void {
        if (this._panel.title.indexOf("*") === -1) {
            this._panel.title = `${this._panel.title}*`;
        }
    }

    private async handleCount(sql: string): Promise<void> {
        if (!this.currentConnection) return;
        
        try {
            let countSql: string;
            if (this.currentConnection.dbType === DatabaseType.MONGO_DB) {
                countSql = sql.replace(/(.+?find\(.+?\)).+/i, '$1').replace("find", "count");
            } else {
                // Replace SELECT...FROM and remove ORDER BY and LIMIT clauses for count query
                countSql = sql
                    .replace(/\bSELECT\b.+?\bFROM\b/i, 'select count(*) count from')
                    .replace(/\bORDER BY\b.+?(?=\bLIMIT\b|$)/i, '')
                    .replace(/\bLIMIT\b.+$/i, '')
                    .trim();
            }
            
            const result = await this.currentConnection.execute(countSql);
            const count = this.currentConnection.dbType === DatabaseType.MONGO_DB ? result : result[0].count;
            
            this._panel.webview.postMessage({
                type: 'COUNT',
                content: { data: count }
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'ERROR',
                content: { message: error.message }
            });
        }
    }

    private handleEsFilter(match: any): void {
        if (this.currentConnection && this.currentQueryParam) {
            const esQuery = EsRequest.build(this.currentQueryParam.res.sql, obj => {
                obj.query = match;
            });
            const options = { ...this.currentQueryParam.queryOption, recordHistory: true };
            QueryUnit.runQuery(esQuery, this.currentConnection, options);
        }
    }

    private handleEsSort(sort: any[]): void {
        if (this.currentConnection && this.currentQueryParam) {
            const esQuery = EsRequest.build(this.currentQueryParam.res.sql, obj => {
                obj.sort = sort;
            });
            const options = { ...this.currentQueryParam.queryOption, recordHistory: true };
            QueryUnit.runQuery(esQuery, this.currentConnection, options);
        }
    }

    private handleFull(): void {
        this._panel.reveal(vscode.ViewColumn.One);
    }

    private handleCopy(value: string): void {
        Util.copyToBoard(value);
    }

    private handleChangePageSize(pageSize: number): void {
        Global.updateConfig(ConfigKey.DEFAULT_LIMIT, pageSize);
    }

    private handleOpenCoffee(): void {
        vscode.env.openExternal(vscode.Uri.parse('https://www.buymeacoffee.com/cweijan'));
    }
    
    private async exportResultsFile(format: 'csv' | 'json'): Promise<void> {
        if (this.currentResults.length === 0) return;
        
        const result = await vscode.window.showSaveDialog({
            filters: format === 'csv' 
                ? { 'CSV Files': ['csv'] }
                : { 'JSON Files': ['json'] }
        });
        
        if (result) {
            const lastResult = this.currentResults[this.currentResults.length - 1];
            let content: string;
            
            if (format === 'csv') {
                content = this.convertToCSV(lastResult.results, lastResult.fields);
            } else {
                content = JSON.stringify(lastResult.results, null, 2);
            }
            
            await vscode.workspace.fs.writeFile(result, Buffer.from(content, 'utf8'));
            this._panel.webview.postMessage({
                type: 'resultsExported',
                path: result.fsPath,
                format
            });
        }
    }
    
    private convertToCSV(results: any[], fields: any[]): string {
        if (results.length === 0) return '';
        
        const headers = fields.map(field => field.name || field.orgName).join(',');
        const rows = results.map(row => 
            Object.values(row).map(value => 
                typeof value === 'string' && value.includes(',') 
                    ? `"${value.replace(/"/g, '""')}"` 
                    : value
            ).join(',')
        );
        
        return [headers, ...rows].join('\n');
    }
    
    public updateConnectionInfo(node: any): void {
        this._panel.webview.postMessage({
            type: 'connectionUpdated',
            connection: {
                type: node.dbType,
                host: node.host,
                database: node.database,
                name: node.label || `${node.host}:${node.port}`
            }
        });
    }

    public setConnection(connection: Node): void {
        this.currentConnection = connection;
    }

    public setQueryParam(queryParam: QueryParam<any>): void {
        this.currentQueryParam = queryParam;
    }

    public loadQueryResults(queryParam: QueryParam<any>): void {
        this.currentQueryParam = queryParam;
        this.setConnection(queryParam.connection);
        
        // Send initial data after view is ready
        setTimeout(() => {
            this._panel.webview.postMessage({
                type: queryParam.type,
                content: { 
                    ...queryParam.res, 
                    dbType: this.currentConnection?.dbType 
                }
            });
        }, 100);
    }

    public show(): void {
        this._panel.reveal();
    }

    public postMessage(message: any): void {
        this._panel.webview.postMessage(message);
    }

}
