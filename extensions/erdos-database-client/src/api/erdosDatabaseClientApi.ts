/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Event type definition for extension environment
export type Event<T> = (listener: (e: T) => any) => void;

// Connection Management
export interface IDatabaseConnection {
    id: string;
    name: string;
    dbType: DatabaseType;
    host: string;
    port: number;
    database?: string;
    schema?: string;
    user?: string;
    password?: string;
    // SSH configuration
    ssh?: {
        host: string;
        port: number;
        username: string;
        password?: string;
        privateKeyPath?: string;
        passphrase?: string;
        cipher?: string;
        waitingTime?: number;
    };
    // SSL configuration
    ssl?: {
        ca?: string;
        cert?: string;
        key?: string;
    };
    // Database-specific options
    options?: {
        connectTimeout?: number;
        requestTimeout?: number;
        includeDatabases?: string;
        timezone?: string;
        // MongoDB specific
        srv?: boolean;
        useConnectionString?: boolean;
        connectionUrl?: string;
        // ElasticSearch specific
        elasticUrl?: string;
        esAuth?: 'none' | 'account' | 'token';
        esUsername?: string;
        esPassword?: string;
        esToken?: string;
        // SQL Server specific
        authType?: 'default' | 'ntlm';
        encrypt?: boolean;
        domain?: string;
        instanceName?: string;
        // FTP specific
        encoding?: string;
        showHidden?: boolean;
    };
}

export enum DatabaseType {
    MySQL = 'MySQL',
    PostgreSQL = 'PostgreSQL',
    SQLite = 'SQLite',
    Redis = 'Redis',
    MongoDB = 'MongoDB',
    SqlServer = 'SqlServer',
    ElasticSearch = 'ElasticSearch',
    FTP = 'FTP',
    SSH = 'SSH',
    Exasol = 'Exasol'
}

// Query Results
export interface IQueryResult {
    sql: string;
    data: any[];
    fields: IFieldInfo[];
    duration: number;
    error?: string;
    affectedRows?: number;
    insertId?: number;
    // Pagination
    total?: number;
    pageSize?: number;
    pageNum?: number;
    // Table info for editing
    table?: string;
    database?: string;
    primaryKey?: string;
    primaryKeyList?: IPrimaryKey[];
    tableCount?: number;
    dbType?: DatabaseType;
    // Metadata
    transId?: string;
    viewId?: string;
}

export interface IFieldInfo {
    name: string;
    type: string;
    orgName?: string;
    nullable?: 'YES' | 'NO';
    key?: 'PRI' | 'UNI' | 'MUL';
    defaultValue?: any;
    extra?: string;
    comment?: string;
    maxLength?: number;
}

export interface IPrimaryKey {
    name: string;
    type: string;
    simpleType?: string;
}

// Table Design
export interface ITableDesign {
    table: string;
    database: string;
    comment?: string;
    columns: IColumnInfo[];
    indexes: IIndexInfo[];
    dbType: DatabaseType;
}

export interface IColumnInfo {
    name: string;
    type: string;
    comment?: string;
    maxLength?: number;
    defaultValue?: any;
    isPrimary: boolean;
    isUnique: boolean;
    nullable: 'YES' | 'NO';
    isAutoIncrement: boolean;
    // For updates
    originalName?: string;
}

export interface IIndexInfo {
    index_name: string;
    column_name: string;
    non_unique: boolean;
    index_type: string;
}

// Redis Operations
export interface IRedisServerInfo {
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

export interface IRedisKey {
    name: string;
    type: 'string' | 'list' | 'hash' | 'set' | 'zset' | 'stream';
    content: any;
    ttl: number;
    size?: number;
}

export interface IRedisCommand {
    command: string;
    args: string[];
    result?: any;
    error?: string;
    timestamp: Date;
}

// SSH Terminal
export interface ISSHTerminalConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKeyPath?: string;
    passphrase?: string;
    cipher?: string;
    waitingTime?: number;
}

export interface ITerminalData {
    data: string;
    type: 'stdout' | 'stderr' | 'input';
    timestamp: Date;
}

// Port Forwarding
export interface IForwardRule {
    id: string;
    name: string;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    state: boolean;
    sshConfig?: ISSHTerminalConfig;
}

// Database Status
export interface IDatabaseStatus {
    processes: IProcessInfo[];
    variables: IVariableInfo[];
    status: IStatusInfo[];
    dashboard?: IDashboardMetrics;
}

export interface IProcessInfo {
    Id: number;
    User: string;
    Host: string;
    db?: string;
    Command: string;
    Time: number;
    State?: string;
    Info?: string;
}

export interface IVariableInfo {
    Variable_name: string;
    Value: string;
}

export interface IStatusInfo {
    Variable_name: string;
    Value: string;
}

export interface IDashboardMetrics {
    queries: number;
    connections: number;
    bytesReceived: number;
    bytesSent: number;
    uptime: number;
    threads: number;
}

// Schema Comparison
export interface ISchemaComparison {
    from: {
        connection: string;
        database: string;
    };
    to: {
        connection: string;
        database: string;
    };
    sqlList: ISchemaDiff[];
}

export interface ISchemaDiff {
    type: 'add' | 'remove' | 'change';
    sql: string;
    selected: boolean;
    description?: string;
}

// Export/Import
export interface IExportOptions {
    type: 'csv' | 'json' | 'sql' | 'xlsx';
    withOutLimit: boolean;
    sql?: string;
    table?: string;
    filename?: string;
}

export interface IImportOptions {
    type: 'csv' | 'json' | 'sql';
    filename: string;
    table?: string;
    database?: string;
    delimiter?: string;
    encoding?: string;
    hasHeader?: boolean;
}

// Tree View Data
export interface ITreeNode {
    id: string;
    label: string;
    type: string;
    contextValue?: string;
    collapsibleState?: number;
    iconPath?: string;
    description?: string;
    tooltip?: string;
    children?: ITreeNode[];
}

export interface IHistoryItem {
    id: string;
    sql: string;
    connectionId: string;
    connectionName: string;
    timestamp: number;
    database?: string;
    executionTime?: number;
    resultCount?: number;
}

// Main API Interface
export interface IDatabaseClientAPI {
    // Connection Management
    getConnections(): Promise<IDatabaseConnection[]>;
    getConnection(connectionId: string): Promise<IDatabaseConnection>;
    testConnection(config: IDatabaseConnection): Promise<{ success: boolean; message: string }>;
    saveConnection(config: IDatabaseConnection): Promise<{ success: boolean; connectionId: string }>;
    deleteConnection(connectionId: string): Promise<void>;
    onConnectionChange: Event<IDatabaseConnection>;
    
    // Tree Data
    getTreeNodes(connectionId?: string): Promise<ITreeNode[]>;
    refreshTreeNode(nodeId: string): Promise<ITreeNode[]>;
    
    // Query Execution
    executeQuery(connectionId: string, sql: string, options?: {
        pageSize?: number;
        pageNum?: number;
        recordHistory?: boolean;
    }): Promise<IQueryResult>;
    getQueryHistory(connectionId: string): Promise<string[]>;
    
    // Table Operations
    getTableDesign(connectionId: string, database: string, table: string): Promise<ITableDesign>;
    updateTable(connectionId: string, database: string, oldName: string, newName: string, comment?: string): Promise<void>;
    addColumn(connectionId: string, database: string, table: string, column: IColumnInfo): Promise<void>;
    updateColumn(connectionId: string, database: string, table: string, column: IColumnInfo): Promise<void>;
    deleteColumn(connectionId: string, database: string, table: string, columnName: string): Promise<void>;
    addIndex(connectionId: string, database: string, table: string, index: { column: string; type: string }): Promise<void>;
    deleteIndex(connectionId: string, database: string, table: string, indexName: string): Promise<void>;
    
    // Redis Operations
    getRedisStatus(connectionId: string): Promise<IRedisServerInfo>;
    getRedisKeys(connectionId: string, pattern?: string, database?: number): Promise<string[]>;
    getRedisKey(connectionId: string, keyName: string): Promise<IRedisKey>;
    setRedisKey(connectionId: string, keyName: string, value: any, ttl?: number): Promise<void>;
    deleteRedisKey(connectionId: string, keyName: string): Promise<void>;
    renameRedisKey(connectionId: string, oldName: string, newName: string): Promise<void>;
    executeRedisCommand(connectionId: string, command: string, args?: string[]): Promise<any>;
    
    // SSH Terminal
    createSSHTerminal(config: ISSHTerminalConfig): Promise<string>; // Returns terminal ID
    
    // Port Forwarding
    getForwardingRules(connectionId: string): Promise<IForwardRule[]>;
    createForwardingRule(connectionId: string, rule: Omit<IForwardRule, 'id' | 'state'>): Promise<string>;
    startForwarding(ruleId: string): Promise<void>;
    stopForwarding(ruleId: string): Promise<void>;
    deleteForwardingRule(ruleId: string): Promise<void>;
    
    // Database Status
    getDatabaseStatus(connectionId: string): Promise<IDatabaseStatus>;
    
    // Schema Comparison
    compareSchemas(fromConnection: string, fromDatabase: string, toConnection: string, toDatabase: string): Promise<ISchemaComparison>;
    syncSchemas(connectionId: string, sqlList: ISchemaDiff[]): Promise<void>;
    
    // Export/Import
    exportData(connectionId: string, options: IExportOptions): Promise<{ success: boolean; filename?: string; message?: string }>;
    importData(connectionId: string, options: IImportOptions): Promise<{ success: boolean; message?: string }>;
    
    // Tree View Operations
    getTreeNodes(nodeId?: string): Promise<ITreeNode[]>;
    refreshTreeNode(nodeId: string): Promise<void>;
    getQueryHistory(): Promise<IHistoryItem[]>;
    saveQueryToHistory(query: string, connectionId: string): Promise<void>;
    deleteHistoryItem(historyId: string): Promise<void>;
    clearHistory(): Promise<void>;
    
    // File Operations
    browseFile(filters?: { [name: string]: string[] }): Promise<string | null>;
    saveFile(content: string, filename?: string, filters?: { [name: string]: string[] }): Promise<string | null>;
    uploadFile(connectionId: string, localPath: string, remotePath: string): Promise<{ success: boolean; message?: string }>;
    downloadFile(connectionId: string, remotePath: string, localPath?: string): Promise<{ success: boolean; localPath?: string; message?: string }>;
    
    // User Input
    showInputBox(prompt: string, defaultValue?: string, validateInput?: (value: string) => string | null): Promise<string | null>;
    showQuickPick(items: string[], options?: { placeHolder?: string; canPickMany?: boolean }): Promise<string | string[] | null>;
    
    // Notifications
    showMessage(message: string, type: 'info' | 'warning' | 'error'): Promise<void>;
    showProgress(title: string, task: () => Promise<void>): Promise<void>;
}