/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebviewBase } from './webviewBase';
import { ConnectionManager } from '../service/connectionManager';
import { Node } from '../model/interface/node';

export class ConnectionView extends WebviewBase {
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, 'erdos.connection', 'Database Connection');
    }
    
    protected getHtmlContent(): string {
        const scriptUri = this.getWebviewUri(['media', 'connection.js']);
        const styleUri = this.getWebviewUri(['media', 'css', 'connection.css']);
        const codiconsUri = this.getWebviewUri(['media', 'css', 'codicons.css']);
        const commonStyleUri = this.getWebviewUri(['media', 'css', 'common.css']);
        
        // Generate proper webview URIs for database icons
        const mysqlIconUri = this.getWebviewUri(['resources', 'icon', 'mysql.svg']);
        const postgresqlIconUri = this.getWebviewUri(['resources', 'icon', 'pg_server.svg']);
        const sqliteIconUri = this.getWebviewUri(['resources', 'icon', 'sqlite-icon.svg']);
        const redisIconUri = this.getWebviewUri(['resources', 'image', 'redis_connection.png']);
        const mongodbIconUri = this.getWebviewUri(['resources', 'icon', 'mongodb-icon.svg']);
        const mssqlIconUri = this.getWebviewUri(['resources', 'icon', 'mssql_server.png']);
        const elasticsearchIconUri = this.getWebviewUri(['resources', 'icon', 'elasticsearch.svg']);
        const ftpIconUri = this.getWebviewUri(['resources', 'icon', 'ftp.svg']);
        const sshIconUri = this.getWebviewUri(['resources', 'icon', 'ssh.svg']);
        const exasolIconUri = this.getWebviewUri(['resources', 'icon', 'exasol.svg']);
        
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${codiconsUri}" rel="stylesheet">
            <link href="${commonStyleUri}" rel="stylesheet">
            <link href="${styleUri}" rel="stylesheet">
            <title>Database Connection</title>
        </head>
        <body>
            <div class="container">
                <div class="connection-form">
                    <div class="main-layout">
                        <!-- Left side: Database type selection -->
                        <div class="database-selection">
                            <select id="dbType" class="form-control" style="display: none;">
                                <option value="MySQL">MySQL</option>
                                <option value="PostgreSQL">PostgreSQL</option>
                                <option value="SQLite">SQLite</option>
                                <option value="Redis">Redis</option>
                                <option value="MongoDB">MongoDB</option>
                                <option value="SqlServer">SqlServer</option>
                                <option value="ElasticSearch">ElasticSearch</option>
                                <option value="FTP">FTP</option>
                                <option value="SSH">SSH</option>
                                <option value="Exasol">Exasol</option>
                            </select>
                            <div class="database-stack">
                                <div class="tab-item active" data-type="MySQL">
                                    <img src="${mysqlIconUri}" alt="MySQL" class="db-icon">
                                    <span>MySQL</span>
                                </div>
                                <div class="tab-item" data-type="PostgreSQL">
                                    <img src="${postgresqlIconUri}" alt="PostgreSQL" class="db-icon">
                                    <span>PostgreSQL</span>
                                </div>
                                <div class="tab-item" data-type="SQLite">
                                    <img src="${sqliteIconUri}" alt="SQLite" class="db-icon">
                                    <span>SQLite</span>
                                </div>
                                <div class="tab-item" data-type="Redis">
                                    <img src="${redisIconUri}" alt="Redis" class="db-icon">
                                    <span>Redis</span>
                                </div>
                                <div class="tab-item" data-type="MongoDB">
                                    <img src="${mongodbIconUri}" alt="MongoDB" class="db-icon">
                                    <span>MongoDB</span>
                                </div>
                                <div class="tab-item" data-type="SqlServer">
                                    <img src="${mssqlIconUri}" alt="SqlServer" class="db-icon">
                                    <span>SqlServer</span>
                                </div>
                                <div class="tab-item" data-type="ElasticSearch">
                                    <img src="${elasticsearchIconUri}" alt="ElasticSearch" class="db-icon">
                                    <span>ElasticSearch</span>
                                </div>
                                <div class="tab-item" data-type="FTP">
                                    <img src="${ftpIconUri}" alt="FTP" class="db-icon">
                                    <span>FTP</span>
                                </div>
                                <div class="tab-item" data-type="SSH">
                                    <img src="${sshIconUri}" alt="SSH" class="db-icon">
                                    <span>SSH</span>
                                </div>
                                <div class="tab-item" data-type="Exasol">
                                    <img src="${exasolIconUri}" alt="Exasol" class="db-icon">
                                    <span>Exasol</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Right side: All form content in two-column layout -->
                        <div class="form-content">
                            <div class="form-grid">
                                <!-- Basic connection fields -->
                                <div class="field-name">Connection Name</div>
                                <div class="field-input">
                                    <input type="text" id="connectionName" class="form-control" placeholder="My Database">
                                </div>
                                
                                <div class="field-name">Connection Target</div>
                                <div class="field-input">
                                    <div class="radio-group">
                                        <label><input type="radio" name="target" value="global" checked> Global</label>
                                        <label><input type="radio" name="target" value="workspace"> Current Workspace</label>
                                    </div>
                                </div>
                                
                                <div class="field-name" id="hostLabel">Host</div>
                                <div class="field-input" id="hostGroup">
                                    <input type="text" id="host" class="form-control" placeholder="localhost">
                                </div>
                                
                                <div class="field-name" id="portLabel">Port</div>
                                <div class="field-input" id="portGroup">
                                    <input type="number" id="port" class="form-control" placeholder="3306">
                                </div>
                                
                                <div class="field-name">Username</div>
                                <div class="field-input">
                                    <input type="text" id="username" class="form-control">
                                </div>
                                
                                <div class="field-name">Password</div>
                                <div class="field-input">
                                    <input type="password" id="password" class="form-control">
                                </div>
                                
                                <div class="field-name" id="databaseLabel">Database</div>
                                <div class="field-input" id="databaseGroup">
                                    <input type="text" id="database" class="form-control">
                                </div>
                                
                                <div class="field-name" id="fileLabel" style="display: none;">File Path</div>
                                <div class="field-input" id="fileGroup" style="display: none;">
                                    <div class="file-input-group">
                                        <input type="text" id="filePath" class="form-control" readonly>
                                        <button type="button" id="browseFile" class="btn btn-secondary">
                                            <i class="codicon codicon-folder-opened"></i> Browse
                                        </button>
                                    </div>
                                </div>
                            
                                <!-- Database-specific fields positioned after Database field -->
                                <!-- For databases that hide the Database field, we need spacer elements to maintain grid alignment -->
                                
                                <!-- MongoDB specific fields -->
                                <div class="field-name" id="srvRecordLabel" style="display: none;"></div>
                                <div class="field-input" id="srvRecordGroup" style="display: none;">
                                    <label><input type="checkbox" id="srvRecord"> SRV Record</label>
                                </div>
                                
                                <div class="field-name" id="useConnectionStringLabel" style="display: none;"></div>
                                <div class="field-input" id="useConnectionStringGroup" style="display: none;">
                                    <label><input type="checkbox" id="useConnectionString"> Use Connection String</label>
                                </div>
                                
                                <div class="field-name" id="connectionStringLabel" style="display: none;">Connection String</div>
                                <div class="field-input" id="connectionStringGroup" style="display: none;">
                                    <input type="text" id="connectionString" class="form-control" 
                                           placeholder="mongodb+srv://username:password@server-url/admin">
                                </div>
                                
                                <!-- ElasticSearch specific fields -->
                                <div class="field-name" id="elasticUrlLabel" style="display: none;">URL</div>
                                <div class="field-input" id="elasticUrlGroup" style="display: none;">
                                    <input type="text" id="elasticUrl" class="form-control" placeholder="https://localhost:9200">
                                </div>
                                
                                <div class="field-name" id="esAuthLabel" style="display: none;">Basic Auth (Optional)</div>
                                <div class="field-input" id="esAuthGroup" style="display: none;">
                                    <div class="radio-group">
                                        <label><input type="radio" name="esAuth" value="none" checked> Not Auth</label>
                                        <label><input type="radio" name="esAuth" value="account"> Account</label>
                                        <label><input type="radio" name="esAuth" value="token"> Token</label>
                                    </div>
                                </div>
                                
                                <div class="field-name" id="esUsernameLabel" style="display: none;">Username</div>
                                <div class="field-input" id="esUsernameGroup" style="display: none;">
                                    <input type="text" id="esUsername" class="form-control">
                                </div>
                                
                                <div class="field-name" id="esPasswordLabel" style="display: none;">Password</div>
                                <div class="field-input" id="esPasswordGroup" style="display: none;">
                                    <input type="password" id="esPassword" class="form-control">
                                </div>
                                
                                <div class="field-name" id="esTokenLabel" style="display: none;">Token</div>
                                <div class="field-input" id="esTokenGroup" style="display: none;">
                                    <input type="text" id="esToken" class="form-control" placeholder="Basic Auth Token. e.g Bearer <token>">
                                </div>
                                
                                <div class="field-name" id="esTimeoutLabel" style="display: none;">Connection Timeout (ms)</div>
                                <div class="field-input" id="esTimeoutGroup" style="display: none;">
                                    <input type="number" id="esTimeout" class="form-control" placeholder="2000" value="2000">
                                </div>
                                
                                <!-- FTP specific fields -->
                                <div class="field-name" id="encodingLabel" style="display: none;">Encoding</div>
                                <div class="field-input" id="encodingGroup" style="display: none;">
                                    <input type="text" id="encoding" class="form-control" placeholder="UTF8">
                                </div>
                                
                                <div class="field-name" id="showHiddenLabel" style="display: none;"></div>
                                <div class="field-input" id="showHiddenGroup" style="display: none;">
                                    <label><input type="checkbox" id="showHidden"> Show Hidden Files</label>
                                </div>
                                
                                <!-- Redis specific fields (Redis typically doesn't have database-specific config fields) -->
                                <!-- But we may need spacers for proper alignment -->
                                
                                <!-- SSH specific fields (SSH typically doesn't have database-specific config fields) -->
                                <!-- But we may need spacers for proper alignment -->
                                
                                <!-- SQL Server specific fields -->
                                <div class="field-name" id="instanceNameLabel" style="display: none;">Instance Name</div>
                                <div class="field-input" id="instanceNameGroup" style="display: none;">
                                    <input type="text" id="instanceName" class="form-control" 
                                           placeholder="Connection named instance" 
                                           title="The instance name to connect to. The SQL Server Browser service must be running on the database server, and UDP port 1434 on the database server must be reachable.(no default)">
                                    <small class="form-text">If instance name is specified, the port config is ignored</small>
                                </div>
                                
                                <div class="field-name" id="authTypeLabel" style="display: none;">Auth Type</div>
                                <div class="field-input" id="authTypeGroup" style="display: none;">
                                    <select id="authType" class="form-control">
                                        <option value="default">Default</option>
                                        <option value="ntlm">NTLM (Windows Auth)</option>
                                    </select>
                                </div>
                                
                                <div class="field-name" id="encryptLabel" style="display: none;"></div>
                                <div class="field-input" id="encryptGroup" style="display: none;">
                                    <label><input type="checkbox" id="encrypt"> Encrypt</label>
                                </div>
                                
                                <div class="field-name" id="domainLabel" style="display: none;">Domain <span class="text-red">*</span></div>
                                <div class="field-input" id="domainGroup" style="display: none;">
                                    <input type="text" id="domain" class="form-control" placeholder="Domain">
                                </div>
                                
                                <!-- SQLite specific fields -->
                                <div class="field-name" id="sqliteWarningLabel" style="display: none;"></div>
                                <div class="field-input" id="sqliteWarning" style="display: none;">
                                    <div class="alert alert-warning">
                                        <i class="codicon codicon-warning"></i> SQLite not installed
                                        <button type="button" id="installSqlite" class="btn btn-primary">Install SQLite</button>
                                    </div>
                                </div>
                                
                                <div class="field-name" id="sqliteFilePathLabel" style="display: none;">SQLite File Path</div>
                                <div class="field-input" id="sqliteFilePathGroup" style="display: none;">
                                    <div class="file-input-group">
                                        <input type="text" id="sqliteFilePath" class="form-control" readonly>
                                        <button type="button" id="browseSqliteFile" class="btn btn-secondary">
                                            <i class="codicon codicon-folder-opened"></i> Choose Database File
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <!-- End of top section form-grid -->
                    
                            <!-- Advanced Options Section -->
                            <div class="advanced-section">
                                <button type="button" id="toggleAdvanced" class="btn btn-link">
                                    <i class="codicon codicon-chevron-right"></i> Advanced Options
                                </button>
                                
                                <div id="advancedOptions" style="display: none;">
                                    <div class="form-grid">
                                        <div class="field-name">Connection Timeout</div>
                                        <div class="field-input">
                                            <input type="number" id="connectTimeout" class="form-control" placeholder="5000">
                                        </div>
                                        
                                        <div class="field-name">Request Timeout</div>
                                        <div class="field-input">
                                            <input type="number" id="requestTimeout" class="form-control" placeholder="10000">
                                        </div>
                                        
                                        <div class="field-name" id="timezoneLabel" style="display: none;">Timezone</div>
                                        <div class="field-input" id="timezoneGroup" style="display: none;">
                                            <input type="text" id="timezone" class="form-control" placeholder="+HH:MM">
                                        </div>
                                        
                                        <div class="field-name" id="includeDatabasesLabel">Include Databases</div>
                                        <div class="field-input" id="includeDatabasesGroup">
                                            <input type="text" id="includeDatabases" class="form-control" 
                                                   placeholder="mysql,information_schema">
                                        </div>
                                        
                                        <div class="field-name"></div>
                                        <div class="field-input">
                                            <label><input type="checkbox" id="useSSL"> Use SSL</label>
                                        </div>
                                        
                                        <div class="field-name"></div>
                                        <div class="field-input">
                                            <label><input type="checkbox" id="useSSH"> Use SSH Tunnel</label>
                                        </div>
                                        
                                        <div id="sslOptions" style="display: none;">
                                            <div class="field-name">CA Certificate Path</div>
                                            <div class="field-input">
                                                <input type="text" id="caPath" class="form-control">
                                            </div>
                                            
                                            <div class="field-name">Client Certificate Path</div>
                                            <div class="field-input">
                                                <input type="text" id="clientCertPath" class="form-control">
                                            </div>
                                            
                                            <div class="field-name">Client Key Path</div>
                                            <div class="field-input">
                                                <input type="text" id="clientKeyPath" class="form-control">
                                            </div>
                                        </div>
                                        
                                        <div id="sshOptions" style="display: none;">
                                            <div class="field-name">SSH Host <span class="text-red">*</span></div>
                                            <div class="field-input">
                                                <input type="text" id="sshHost" class="form-control" required>
                                            </div>
                                            
                                            <div class="field-name">SSH Port <span class="text-red">*</span></div>
                                            <div class="field-input">
                                                <input type="number" id="sshPort" class="form-control" placeholder="22" required>
                                            </div>
                                            
                                            <div class="field-name">SSH Username <span class="text-red">*</span></div>
                                            <div class="field-input">
                                                <input type="text" id="sshUser" class="form-control" required>
                                            </div>
                                            
                                            <div class="field-name">SSH Cipher</div>
                                            <div class="field-input">
                                                <select id="sshCipher" class="form-control">
                                                    <option value="">Default</option>
                                                    <option value="aes128-cbc">aes128-cbc</option>
                                                    <option value="aes192-cbc">aes192-cbc</option>
                                                    <option value="aes256-cbc">aes256-cbc</option>
                                                    <option value="3des-cbc">3des-cbc</option>
                                                    <option value="aes128-ctr">aes128-ctr</option>
                                                    <option value="aes192-ctr">aes192-ctr</option>
                                                    <option value="aes256-ctr">aes256-ctr</option>
                                                </select>
                                            </div>
                                            
                                            <div class="field-name">SSH Auth Type</div>
                                            <div class="field-input">
                                                <div class="radio-group">
                                                    <label><input type="radio" name="sshAuthType" value="password" checked> Password</label>
                                                    <label><input type="radio" name="sshAuthType" value="privateKey"> Private Key</label>
                                                    <label><input type="radio" name="sshAuthType" value="native"> Native SSH</label>
                                                </div>
                                            </div>
                                            
                                            <div id="sshPasswordAuth" class="auth-fields">
                                                <div class="field-name">Password <span class="text-red">*</span></div>
                                                <div class="field-input">
                                                    <input type="password" id="sshPassword" class="form-control" required>
                                                </div>
                                            </div>
                                            
                                            <div id="sshKeyAuth" class="auth-fields" style="display: none;">
                                                <div class="field-name">Private Key Path</div>
                                                <div class="field-input">
                                                    <div class="file-input-group">
                                                        <input type="text" id="privateKeyPath" class="form-control" readonly>
                                                        <button type="button" id="browsePrivateKey" class="btn btn-secondary">
                                                            <i class="codicon codicon-folder-opened"></i> Choose
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div class="field-name">Passphrase</div>
                                                <div class="field-input">
                                                    <input type="password" id="passphrase" class="form-control">
                                                </div>
                                            </div>
                                            
                                            <div id="sshNativeAuth" class="auth-fields" style="display: none;">
                                                <div class="field-name">Waiting Time</div>
                                                <div class="field-input">
                                                    <input type="number" id="waitingTime" class="form-control" placeholder="Waiting time for ssh command">
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                    
                            <div class="form-actions">
                                <button type="button" id="testConnection" class="btn btn-secondary">
                                    <i class="codicon codicon-debug-alt"></i> Test Connection
                                </button>
                                <button type="button" id="saveConnection" class="btn btn-primary">
                                    <i class="codicon codicon-save"></i> Connect
                                </button>
                            </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="status" class="status-message" style="display: none;"></div>
            </div>
            
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    protected handleMessage(message: any): void {
        switch (message.type) {
            case 'testConnection':
                this.testConnection(message.config);
                break;
            case 'saveConnection':
                this.saveConnection(message.config);
                break;
            case 'browseFile':
                this.browseFile();
                break;
        }
    }
    
    private async testConnection(config: Node): Promise<void> {
        try {
            await ConnectionManager.getConnection(config);
            this._panel.webview.postMessage({
                type: 'connectionResult',
                success: true,
                message: 'Connection successful!'
            });
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'connectionResult',
                success: false,
                message: error.message || 'Connection failed'
            });
        }
    }
    
    private async saveConnection(config: Node): Promise<void> {
        try {
            const connection = await ConnectionManager.getConnection(config);
            ConnectionManager.activeNode = config;
            
            this._panel.webview.postMessage({
                type: 'connectionSaved',
                success: true
            });
            
            // Refresh tree view to show new connection
            vscode.commands.executeCommand('mysql.refresh');
        } catch (error) {
            this._panel.webview.postMessage({
                type: 'connectionResult',
                success: false,
                message: error.message || 'Connection failed'
            });
        }
    }
    
    private async browseFile(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Database Files': ['db', 'sqlite', 'sqlite3', 'db3']
            }
        });
        
        if (result && result[0]) {
            this._panel.webview.postMessage({
                type: 'fileSelected',
                path: result[0].fsPath
            });
        }
    }
}
