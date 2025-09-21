/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConnectionManager } from '../service/connectionManager';
import { QueryUnit, QueryResult } from '../service/queryUnit';
import { FieldInfo } from '../common/typeDef';
import { IFieldInfo } from './erdosDatabaseClientApi';
import { DbTreeDataProvider } from '../provider/treeDataProvider';
import { HistoryRecorder } from '../service/common/historyRecorder';
import { HistoryProvider } from '../provider/history/historyProvider';
import { HistoryNode } from '../provider/history/historyNode';
import { ExportService } from '../service/export/exportService';
import { ExportContext, ExportType } from '../service/export/exportContext';
import { ImportService } from '../service/import/importService';
import { MysqlImportService } from '../service/import/mysqlImportService';
import { MongoImportService } from '../service/import/mongoImportService';
import { PostgresqlImortService } from '../service/import/postgresqlImortService';
import { SqlServerImportService } from '../service/import/sqlServerImportService';
import { DiffService } from '../service/diff/diffService';
import { SSHTunnelService } from '../service/tunnel/sshTunnelService';
import { ForwardService, ForwardInfo } from '../service/ssh/forward/forwardService';
import { MysqlStatusService } from '../service/status/mysqlStatusService';
import { AbstractStatusService, DashBoardResponse } from '../service/status/abstractStatusService';
import { Global } from '../common/global';
import { GlobalState, WorkState } from '../common/state';
import { Node } from '../model/interface/node';
import { RedisConnectionNode } from '../model/redis/redisConnectionNode';
import { ConnectionNode } from '../model/database/connectionNode';
import { NodeUtil } from '../model/nodeUtil';
import { DatabaseType, CacheKey } from '../common/constants';
import { DatabaseCache } from '../service/common/databaseCache';
import { FileManager } from '../common/filesManager';
import { Util } from '../common/util';
import { SSHConfig } from '../model/interface/sshConfig';
import { XtermTerminal } from '../service/ssh/terminal/xtermTerminalService';
import { ClientManager } from '../service/ssh/clientManager';
import { TableGroup } from '../model/main/tableGroup';
import { TableNode } from '../model/main/tableNode';
import { ColumnNode } from '../model/other/columnNode';
import * as path from 'path';

import { 
    IDatabaseClientAPI, 
    IDatabaseConnection, 
    IQueryResult, 
    IRedisServerInfo, 
    IRedisKey, 
    Event, 
    ITableDesign, 
    IColumnInfo, 
    IIndexInfo, 
    ISSHTerminalConfig, 
    ITerminalData, 
    IForwardRule, 
    IDatabaseStatus, 
    IProcessInfo, 
    IVariableInfo, 
    IStatusInfo, 
    ISchemaComparison, 
    ISchemaDiff, 
    IExportOptions, 
    IImportOptions, 
    ITreeNode, 
    IHistoryItem,
    DatabaseType as APIDbType
} from './erdosDatabaseClientApi';

export class DatabaseClientAPI implements IDatabaseClientAPI {
    private static instance: DatabaseClientAPI;
    private nodeCache: Map<string, any> = new Map();
    private connectionChangeEmitter = new vscode.EventEmitter<IDatabaseConnection>();
    private statusBarClickEmitter = new vscode.EventEmitter<void>();
    private exportService = new ExportService();
    private historyRecorder = new HistoryRecorder();
    private diffService = new DiffService();
    private tunnelService = new SSHTunnelService();
    private forwardService = new ForwardService();
    private mysqlStatusService = new MysqlStatusService();
    
    public static getInstance(): DatabaseClientAPI {
        if (!DatabaseClientAPI.instance) {
            DatabaseClientAPI.instance = new DatabaseClientAPI();
        }
        return DatabaseClientAPI.instance;
    }

    // Connection Management
    async getConnections(): Promise<IDatabaseConnection[]> {
        // Load connections directly from VS Code configuration
        const configConnections = Global.getConfig('connections', []) as IDatabaseConnection[];
        return configConnections;
    }

    async getConnection(connectionId: string): Promise<IDatabaseConnection> {
        const connection = await vscode.commands.executeCommand('erdos.getConnectionById', connectionId);
        if (!connection) {
            throw new Error(`Connection not found: ${connectionId}`);
        }
        
        return connection as IDatabaseConnection;
    }

    async testConnection(config: IDatabaseConnection): Promise<{ success: boolean; message: string }> {
        try {
            const node = this.connectionToNode(config);
            const connection = await ConnectionManager.getConnection(node);
            await QueryUnit.queryPromise(connection, 'SELECT 1');
            
            return { success: true, message: 'Connection successful' };
        } catch (error: any) {
            
            // Provide more specific error messages based on error type
            let message = error.message || 'Unknown connection error';
            
            if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
                message = `Cannot connect to ${config.host}:${config.port}. Server may not be running.`;
            } else if (error.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND')) {
                message = `Host "${config.host}" not found. Check the hostname.`;
            } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
                message = `Connection timeout to ${config.host}:${config.port}. Check network connectivity.`;
            } else if (error.message?.includes('authentication') || error.message?.includes('password')) {
                message = `Authentication failed. Check username and password.`;
            } else if (error.message?.includes('database') && error.message?.includes('does not exist')) {
                message = `Database "${config.database}" does not exist.`;
            } else if (error.message?.includes('AggregateError')) {
                message = `Cannot connect to ${config.host}:${config.port}. Server may not be running or accessible.`;
            }
            
            return { success: false, message };
        }
    }

    async saveConnection(config: IDatabaseConnection): Promise<{ success: boolean; connectionId: string }> {
        try {
            const connections = Global.getConfig<any[]>('connections', []);
            const existingIndex = connections.findIndex(c => c.id === config.id);
            
            if (existingIndex >= 0) {
                connections[existingIndex] = config;
            } else {
                config.id = config.id || this.generateId();
                connections.push(config);
            }
            
            await Global.updateConfig('connections', connections);
            
            this.connectionChangeEmitter.fire(config);
            
            return { success: true, connectionId: config.id };
        } catch (error) {
            return { success: false, connectionId: config.id };
        }
    }

    async deleteConnection(connectionId: string): Promise<void> {
        const connections = Global.getConfig<any[]>('connections', []);
        const filtered = connections.filter(c => c.id !== connectionId);
        await Global.updateConfig('connections', filtered);
        
        // Tree view refresh is now handled by the contrib system
    }

    public get onConnectionChange(): Event<IDatabaseConnection> {
        return this.connectionChangeEmitter.event;
    }

    // Tree Data - Uses existing DbTreeDataProvider system
    async getTreeNodes(connectionId?: string): Promise<ITreeNode[]> {
        // Get the existing tree data provider instance
        const treeDataProvider = DbTreeDataProvider.instances[0];
        
        if (!treeDataProvider) {
            throw new Error('DbTreeDataProvider instance not found - extension initialization failed');
        }
        
        try {
            let nodes: Node[];
            
            if (connectionId && connectionId !== 'root') {
                // Use the tree data provider to find and expand nodes, just like the original tree view
                const targetNode = await this.findNodeById(connectionId, treeDataProvider);
                
                if (targetNode) {
                    nodes = await targetNode.getChildren();
                } else {
                    nodes = [];
                }
            } else {
                nodes = await treeDataProvider.getConnectionNodes();
            }
            
            if (nodes.length === 0) {
                return [];
            }
            
            // Convert Node[] to ITreeNode[]
            const treeNodes: ITreeNode[] = [];
            
            for (const node of nodes) {
                try {
                    const convertedNode = this.nodeToTreeNode(node);
                    treeNodes.push(convertedNode);
                } catch (error) {
                    // Skip nodes that can't be converted
                    continue;
                }
            }
            
            return treeNodes;
        } catch (error) {
            return [];
        }
    }

    async refreshTreeNode(nodeId: string): Promise<void>;
    async refreshTreeNode(nodeId: string): Promise<ITreeNode[]>;
    async refreshTreeNode(nodeId: string): Promise<void | ITreeNode[]> {
        // Tree view refresh is now handled by the contrib system
        // Return fresh tree nodes for the requested node
        const nodes = await this.getTreeNodes(nodeId);
        return nodes.length > 0 ? nodes : undefined;
    }

    async getNodeById(nodeId: string): Promise<Node | null> {
        // Get the existing tree data provider instance
        const treeDataProvider = DbTreeDataProvider.instances[0];
        
        if (!treeDataProvider) {
            return null;
        }
        
        try {
            // Use the same tree traversal logic to find the node
            const targetNode = await this.findNodeById(nodeId, treeDataProvider);
            
            if (targetNode) {
                // Cache the node for later retrieval by commands
                this.nodeCache.set(nodeId, targetNode);
                return targetNode;
            } else {
                return null;
            }
        } catch (error) {
            console.error('[DatabaseClientAPI] getNodeById - Error:', error);
            return null;
        }
    }

    // Get cached node for command execution
    getCachedNode(nodeId: string): Node | null {
        return this.nodeCache.get(nodeId) || null;
    }

    /**
     * Normalize different database field structures to universal IFieldInfo format
     * This replicates the original extension's convertFieldInfoToColumnMeta approach
     */
    private normalizeFieldsToIFieldInfo(fields: any[]): IFieldInfo[] {
        return fields.map((field: any) => {
            // Handle different database field structures
            let name = field.name || 'unknown';
            let type = 'unknown';
            let maxLength = 0;
            let orgName = field.orgName || field.name || 'unknown';
            let defaultValue = field.default || field.defaultValue;

            // PostgreSQL: {name, dataTypeID, dataTypeSize, tableID, columnID, dataTypeModifier, format}
            if (field.dataTypeID !== undefined) {
                type = this.getPostgreSQLType(field.dataTypeID);
                maxLength = field.dataTypeSize || 0;
            }
            // MySQL: Full FieldInfo structure {name, type, length, orgName, etc.}
            else if (field.type !== undefined && typeof field.type === 'object') {
                type = this.getMySQLType(field.type);
                maxLength = field.length || 0;
            }
            // MSSQL: {name, orgTable}
            else if (field.orgTable !== undefined) {
                type = 'varchar'; // Default for MSSQL
            }
            // MongoDB/SQLite: {name} or {name, type, nullable}
            else if (field.type && typeof field.type === 'string') {
                type = field.type;
            }

            return {
                name,
                type,
                orgName,
                nullable: 'YES' as 'YES' | 'NO', // Default to YES like original
                key: undefined,
                defaultValue,
                extra: '',
                comment: '',
                maxLength
            };
        });
    }

    /**
     * Map PostgreSQL dataTypeID to simple type string
     * Based on PostgreSQL OID constants from postgreSqlConnection.ts
     */
    private getPostgreSQLType(dataTypeID: number): string {
        const typeMap: {[key: number]: string} = {
            16: 'boolean',      // BOOL
            17: 'bytea',        // BYTEA
            18: 'char',         // CHAR
            20: 'bigint',       // INT8
            21: 'smallint',     // INT2
            23: 'int',          // INT4
            25: 'text',         // TEXT
            114: 'json',        // JSON
            700: 'float',       // FLOAT4
            701: 'double',      // FLOAT8
            1042: 'char',       // BPCHAR
            1043: 'varchar',    // VARCHAR
            1082: 'date',       // DATE
            1083: 'time',       // TIME
            1114: 'timestamp',  // TIMESTAMP
            1184: 'timestamptz', // TIMESTAMPTZ
            1700: 'decimal',    // NUMERIC
            2950: 'uuid',       // UUID
            3802: 'jsonb'       // JSONB
        };
        return typeMap[dataTypeID] || 'unknown';
    }

    /**
     * Map MySQL type enum to simple type string
     * Based on Types enum from typeDef.ts
     */
    private getMySQLType(type: any): string {
        const typeMap: {[key: number]: string} = {
            0: 'decimal', 1: 'tinyint', 2: 'smallint', 3: 'int', 4: 'float',
            5: 'double', 7: 'timestamp', 8: 'bigint', 9: 'mediumint',
            10: 'date', 11: 'time', 12: 'datetime', 13: 'year',
            15: 'varchar', 16: 'bit', 245: 'json', 246: 'decimal',
            247: 'enum', 248: 'set', 249: 'tinytext', 250: 'mediumtext',
            251: 'longtext', 252: 'text', 253: 'varchar', 254: 'char'
        };
        return typeMap[type] || 'text';
    }

    // Query Execution
    async executeQuery(connectionId: string, sql: string, options?: {
        pageSize?: number;
        pageNum?: number;
        recordHistory?: boolean;
    }): Promise<IQueryResult> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        
        try {
            const startTime = Date.now();
            const conn = await ConnectionManager.getConnection(node);
            const result = await QueryUnit.queryPromise(conn, sql);
            const duration = Date.now() - startTime;
            
            // Record history if requested - save ONLY to VS Code configuration
            if (options?.recordHistory !== false) {
                try {
                    const configHistory = Global.getConfig('queryHistory', []) as IHistoryItem[];
                    
                    const newHistoryItem: IHistoryItem = {
                        id: Date.now().toString(),
                        sql: sql,
                        connectionId: connectionId,
                        connectionName: connection.name,
                        database: connection.database || '',
                        timestamp: startTime,
                        executionTime: duration,
                        resultCount: Array.isArray(result.rows) ? result.rows.length : 0
                    };
                    
                    configHistory.unshift(newHistoryItem); // Add to beginning
                    
                    // Keep only the latest 1000 items
                    if (configHistory.length > 1000) {
                        configHistory.splice(1000);
                    }
                    
                    await Global.updateConfig('queryHistory', configHistory);
                    
                    // Trigger refresh of query history view
                    try {
                        await vscode.commands.executeCommand('erdos.refreshQueryHistory');
                    } catch (refreshError) {
                        console.error('[DatabaseClientAPI] executeQuery - Failed to refresh query history view:', refreshError);
                    }
                } catch (error) {
                    console.error('[DatabaseClientAPI] executeQuery - Failed to save to VS Code config:', error);
                }
            }
            
            // Create a DataResponse object to populate metadata (like primary key info)
            const dataResponse: any = {
                sql,
                data: Array.isArray(result.rows) ? result.rows : [],
                fields: result.fields || [],
                costTime: duration,
                total: result.total,
                columnList: [],
                primaryKey: null,
                primaryKeyList: [],
                tableCount: 0,
                table: null,
                database: null
            };

            // Populate primary key and table metadata using the same logic as QueryPage
            await this.loadColumnListForResult(node, dataResponse);

            return {
                sql,
                data: dataResponse.data,
                fields: this.normalizeFieldsToIFieldInfo(dataResponse.fields),
                duration,
                total: dataResponse.total,
                pageSize: options?.pageSize,
                pageNum: options?.pageNum,
                primaryKey: dataResponse.primaryKey,
                primaryKeyList: dataResponse.primaryKeyList,
                tableCount: dataResponse.tableCount,
                table: dataResponse.table,
                database: dataResponse.database,
                dbType: node.dbType as any
            };
        } catch (error) {
            return {
                sql,
                data: [],
                fields: [],
                duration: 0,
                error: error.message
            };
        }
    }

    // Load column metadata for query results (replicates QueryPage.loadColumnList logic)
    private async loadColumnListForResult(node: any, dataResponse: any): Promise<void> {
        // fix null point on result view
        dataResponse.columnList = [];
        const sqlList = dataResponse.sql.match(/(?<=\b(from|join)\b\s*)(\S+)/gi);
        
        if (!sqlList || sqlList.length == 0) {
            return;
        }

        let tableName = sqlList[0];
        let database: string;

        if (node.dbType === DatabaseType.MSSQL && tableName.indexOf(".") != -1) {
            tableName = tableName.split(".")[1];
        }

        // MySQL gets directly from result set
        const fields = dataResponse.fields;
        if (fields && fields[0] && fields[0].orgTable) {
            tableName = fields[0].orgTable;
            database = fields[0].schema || fields[0].db;
            dataResponse.database = database;
        } else {
            tableName = tableName.replace(/^"?(.+?)"?$/, '$1');
        }
        
        // Query primary keys directly from database
        await this.loadPrimaryKeysDirectly(node, tableName, database, dataResponse);
        dataResponse.tableCount = sqlList.length;
        dataResponse.table = tableName;
    }

    // Primary key detection by querying database directly
    private async loadPrimaryKeysDirectly(node: any, tableName: string, database: string, dataResponse: any): Promise<void> {
        const dbName = database || node.database;
        
        // Handle special database types that hardcode primary keys
        if (node.dbType === DatabaseType.MONGO_DB) {
            // MongoDB always uses _id as primary key
            dataResponse.primaryKey = '_id';
            dataResponse.primaryKeyList = [{
                name: '_id',
                type: 'ObjectId',
                simpleType: 'ObjectId'
            }];
            dataResponse.database = dbName;
            return;
        }
        
        if (node.dbType === DatabaseType.ES) {
            // Elasticsearch uses _id for documents
            dataResponse.primaryKey = '_id';
            dataResponse.primaryKeyList = [{
                name: '_id',
                type: 'string',
                simpleType: 'string'
            }];
            dataResponse.database = dbName;
            return;
        }
        
        // For SQL databases, query database directly using dialect
        try {
            const conn = await ConnectionManager.getConnection(node);
            
            // For PostgreSQL, use schema name instead of database name
            const schemaOrDatabase = node.dbType === DatabaseType.PG ? (node.schema || 'public') : dbName;
            const columnsQuery = node.dialect.showColumns(schemaOrDatabase, tableName);
            
            const result = await QueryUnit.queryPromise(conn, columnsQuery);
            const columns = Array.isArray(result.rows) ? result.rows : [];
            
            if (columns.length === 0) {
                return;
            }

            let primaryKey: string | null = null;
            const primaryKeyList: any[] = [];
            
            // Process each column using the same logic as ColumnNode.buildInfo()
            columns.forEach((column: any) => {
                const columnName = column.name || column.COLUMN_NAME || 'unknown';
                const columnType = column.type || column.DATA_TYPE || column.simpleType || 'unknown';
                const simpleType = column.simpleType || column.DATA_TYPE || column.type || columnType;
                
                let isPrimary = false;
                
                // Use the same primary key detection logic as ColumnNode.buildInfo()
                if (node.dbType === DatabaseType.SQLITE) {
                    // SQLite: pk field = '1' or 1
                    isPrimary = column.pk === '1' || column.pk === 1;
                } else {
                    // MySQL, PostgreSQL, MSSQL, Exasol: check key field
                    const columnKey = column.key || column.COLUMN_KEY || column.constraint_type;
                    isPrimary = columnKey === 'PRI' || columnKey === 'PRIMARY KEY';
                }
                
                if (isPrimary) {
                    if (!primaryKey) {
                        primaryKey = columnName; // Use first primary key as the main one
                    }
                    
                    primaryKeyList.push({
                        name: columnName,
                        type: columnType,
                        simpleType: simpleType
                    });
                }
            });
            
            if (primaryKey) {
                dataResponse.primaryKey = primaryKey;
                dataResponse.primaryKeyList = primaryKeyList;
                dataResponse.database = dbName;
            }
            
        } catch (error) {
            // Silently handle errors - primary key detection is optional
        }
    }

    // Convert ColumnMeta array to FieldInfo array (replicates QueryPage logic)
    private convertColumnMetaToFieldInfo(columnList: any[]): any[] {
        return columnList.map(column => ({
            name: column.name,
            type: column.type,
            orgTable: column.table,
            schema: column.schema,
            db: column.database
        }));
    }


    // Table Operations
    async getTableDesign(connectionId: string, database: string, table: string): Promise<ITableDesign> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        
        // Find the actual table node in the tree structure
        const connectionNode = node;
        
        // Navigate to the table node through the tree structure
        const children = await connectionNode.getChildren();
        const schemaNode = children.find(child => child.schema === database || child.database === database);
        if (!schemaNode) {
            throw new Error(`Database/schema not found: ${database}`);
        }
        
        const schemaChildren = await schemaNode.getChildren();
        const tableGroupNode = schemaChildren.find(child => child.contextValue?.includes('tableGroup'));
        if (!tableGroupNode) {
            throw new Error('Table group not found');
        }
        
        const tables = await tableGroupNode.getChildren();
        const tableNode = tables.find(t => t.label === table) as TableNode;
        if (!tableNode) {
            throw new Error(`Table not found: ${table}`);
        }
        
        // Use the existing TableNode to get columns
        const columnNodes = await tableNode.getChildren();
        const columns: IColumnInfo[] = columnNodes.map((columnNode: ColumnNode) => ({
            name: columnNode.column.name,
            type: columnNode.column.type,
            comment: columnNode.column.comment,
            defaultValue: columnNode.column.defaultValue,
            isPrimary: columnNode.column.isPrimary,
            isUnique: columnNode.column.isUnique,
            nullable: columnNode.column.nullable as 'YES' | 'NO',
            isAutoIncrement: columnNode.column.isAutoIncrement
        }));
        
        // Get indexes using the existing dialect
        const conn = await ConnectionManager.getConnection(node);
        const indexesResult = await QueryUnit.queryPromise(conn, node.dialect.showIndex(database, table));
        
        interface ShowIndexRow {
            Key_name: string;
            Column_name: string;
            Non_unique: number;
            Index_type: string;
        }
        
        const indexes: IIndexInfo[] = (indexesResult.rows as ShowIndexRow[]).map(row => ({
            index_name: row.Key_name,
            column_name: row.Column_name,
            non_unique: row.Non_unique === 1,
            index_type: row.Index_type
        }));
        
        return {
            table,
            database,
            columns,
            indexes,
            dbType: this.stringToApiDbType(connection.dbType)
        };
    }

    async updateTable(connectionId: string, database: string, oldName: string, newName: string, comment?: string): Promise<void> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        const conn = await ConnectionManager.getConnection(node);
        
        let sql = `ALTER TABLE \`${database}\`.\`${oldName}\` RENAME TO \`${newName}\``;
        if (comment) {
            sql += `, COMMENT = '${comment}'`;
        }
        
        await QueryUnit.queryPromise(conn, sql);
    }

    async addColumn(connectionId: string, database: string, table: string, column: IColumnInfo): Promise<void> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        const conn = await ConnectionManager.getConnection(node);
        
        let sql = `ALTER TABLE \`${database}\`.\`${table}\` ADD COLUMN \`${column.name}\` ${column.type}`;
        if (column.nullable === 'NO') sql += ' NOT NULL';
        if (column.defaultValue !== undefined) sql += ` DEFAULT '${column.defaultValue}'`;
        if (column.isAutoIncrement) sql += ' AUTO_INCREMENT';
        if (column.comment) sql += ` COMMENT '${column.comment}'`;
        
        await QueryUnit.queryPromise(conn, sql);
    }

    async updateColumn(connectionId: string, database: string, table: string, column: IColumnInfo): Promise<void> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        const conn = await ConnectionManager.getConnection(node);
        
        let sql = `ALTER TABLE \`${database}\`.\`${table}\` MODIFY COLUMN \`${column.name}\` ${column.type}`;
        if (column.nullable === 'NO') sql += ' NOT NULL';
        if (column.defaultValue !== undefined) sql += ` DEFAULT '${column.defaultValue}'`;
        if (column.isAutoIncrement) sql += ' AUTO_INCREMENT';
        if (column.comment) sql += ` COMMENT '${column.comment}'`;
        
        await QueryUnit.queryPromise(conn, sql);
    }

    async deleteColumn(connectionId: string, database: string, table: string, columnName: string): Promise<void> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        const conn = await ConnectionManager.getConnection(node);
        
        const sql = `ALTER TABLE \`${database}\`.\`${table}\` DROP COLUMN \`${columnName}\``;
        await QueryUnit.queryPromise(conn, sql);
    }

    async addIndex(connectionId: string, database: string, table: string, index: { column: string; type: string }): Promise<void> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        const conn = await ConnectionManager.getConnection(node);
        
        const indexName = `idx_${index.column}`;
        const sql = `ALTER TABLE \`${database}\`.\`${table}\` ADD ${index.type} \`${indexName}\` (\`${index.column}\`)`;
        await QueryUnit.queryPromise(conn, sql);
    }

    async deleteIndex(connectionId: string, database: string, table: string, indexName: string): Promise<void> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        const conn = await ConnectionManager.getConnection(node);
        
        const sql = `ALTER TABLE \`${database}\`.\`${table}\` DROP INDEX \`${indexName}\``;
        await QueryUnit.queryPromise(conn, sql);
    }

    // Helper method to get Redis connection node
    private async getRedisNode(connectionId: string): Promise<RedisConnectionNode> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        
        if (!(node instanceof RedisConnectionNode)) {
            throw new Error(`Connection is not a Redis connection: ${connectionId}`);
        }
        
        return node as RedisConnectionNode;
    }

    // Redis Operations - Use existing RedisConnectionNode functionality
    async getRedisStatus(connectionId: string): Promise<IRedisServerInfo> {
        const redisNode = await this.getRedisNode(connectionId);
        
        // Use existing showStatus method which creates the status view
        await redisNode.showStatus();
        
        // Get the raw info for API response
        const client = await redisNode.getClient();
        const infoString = await client.info();
        return this.parseRedisInfo(infoString);
    }

    async getRedisKeys(connectionId: string, pattern?: string, database?: number): Promise<string[]> {
        const redisNode = await this.getRedisNode(connectionId);
        const client = await redisNode.getClient();
        
        if (database !== undefined) {
            await client.select(database);
        }
        
        return await client.keys(pattern || '*');
    }

    async getRedisKey(connectionId: string, keyName: string): Promise<IRedisKey> {
        const redisNode = await this.getRedisNode(connectionId);
        const client = await redisNode.getClient();
        
        const type = await client.type(keyName) as 'string' | 'list' | 'hash' | 'set' | 'zset' | 'stream';
        const ttl = await client.ttl(keyName);
        let content: any;
        let size: number | undefined;
        
        switch (type) {
            case 'string':
                content = await client.get(keyName);
                break;
            case 'list':
                content = await client.lrange(keyName, 0, -1);
                size = await client.llen(keyName);
                break;
            case 'hash':
                content = await client.hgetall(keyName);
                size = await client.hlen(keyName);
                break;
            case 'set':
                content = await client.smembers(keyName);
                size = await client.scard(keyName);
                break;
            case 'zset':
                content = await client.zrange(keyName, 0, -1, 'WITHSCORES');
                size = await client.zcard(keyName);
                break;
            default:
                content = null;
        }
        
        return {
            name: keyName,
            type,
            content,
            ttl,
            size
        };
    }

    async setRedisKey(connectionId: string, keyName: string, value: any, ttl?: number): Promise<void> {
        const redisNode = await this.getRedisNode(connectionId);
        const client = await redisNode.getClient();
        
        await client.set(keyName, value);
        if (ttl) {
            await client.expire(keyName, ttl);
        }
    }

    async deleteRedisKey(connectionId: string, keyName: string): Promise<void> {
        const redisNode = await this.getRedisNode(connectionId);
        const client = await redisNode.getClient();
        
        await client.del(keyName);
    }

    async renameRedisKey(connectionId: string, oldName: string, newName: string): Promise<void> {
        const redisNode = await this.getRedisNode(connectionId);
        const client = await redisNode.getClient();
        
        await client.rename(oldName, newName);
    }

    async executeRedisCommand(connectionId: string, command: string, args?: string[]): Promise<any> {
        const redisNode = await this.getRedisNode(connectionId);
        const client = await redisNode.getClient();
        
        // Redis client uses standard Redis commands
        if (args && args.length > 0) {
            return await client[command.toLowerCase()](...args);
        } else {
            return await client[command.toLowerCase()]();
        }
    }

    // SSH Terminal - Use existing XtermTerminal service
    async createSSHTerminal(config: ISSHTerminalConfig): Promise<string> {
        const terminalId = this.generateId();
        
        const xtermTerminal = new XtermTerminal();
        const sshConfig: SSHConfig = {
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            privateKeyPath: config.privateKeyPath,
            passphrase: config.passphrase,
            tunnelPort: 0,
            key: terminalId
        };
        
        // Use existing openMethod from XtermTerminal service
        await xtermTerminal.openMethod(sshConfig);
        return terminalId;
    }

    // Port Forwarding
    async getForwardingRules(connectionId: string): Promise<IForwardRule[]> {
        const connection = await this.getConnection(connectionId);
        const sshConfig = this.connectionToSSHConfig(connection);
        
        const forwardInfos = this.forwardService.list(sshConfig);
        return forwardInfos.map(info => this.forwardInfoToRule(info, sshConfig));
    }

    async createForwardingRule(connectionId: string, rule: Omit<IForwardRule, 'id' | 'state'>): Promise<string> {
        const connection = await this.getConnection(connectionId);
        const sshConfig = this.connectionToSSHConfig(connection);
        
        const forwardInfo: ForwardInfo = {
            id: null,
            name: rule.name,
            localHost: rule.localHost,
            localPort: rule.localPort,
            remoteHost: rule.remoteHost,
            remotePort: rule.remotePort,
            state: false
        };
        
        await this.forwardService.forward(sshConfig, forwardInfo, true);
        return forwardInfo.id;
    }

    async startForwarding(ruleId: string): Promise<void> {
        // Find the connection with this rule and start forwarding
        const connections = await this.getConnections();
        for (const connection of connections) {
            if (connection.ssh) {
                const sshConfig = this.connectionToSSHConfig(connection);
                await this.forwardService.start(sshConfig, ruleId);
                break;
            }
        }
    }

    async stopForwarding(ruleId: string): Promise<void> {
        this.forwardService.stop(ruleId);
    }

    async deleteForwardingRule(ruleId: string): Promise<void> {
        const connections = await this.getConnections();
        for (const connection of connections) {
            if (connection.ssh) {
                const sshConfig = this.connectionToSSHConfig(connection);
                this.forwardService.remove(sshConfig, ruleId);
                break;
            }
        }
    }

    // Database Status - Use existing MysqlStatusService
    async getDatabaseStatus(connectionId: string): Promise<IDatabaseStatus> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection) as ConnectionNode;
        
        // Use existing MysqlStatusService for MySQL databases
        if (connection.dbType === APIDbType.MySQL) {
            // Use the existing service to get dashboard data
            const dashboardResponse = await this.mysqlStatusService['onDashBoard'](node);
            
            // Get process list using existing dialect
            const conn = await ConnectionManager.getConnection(node);
            const processResult = await QueryUnit.queryPromise(conn, node.dialect.processList());
            const variableResult = await QueryUnit.queryPromise(conn, node.dialect.variableList());
            const statusResult = await QueryUnit.queryPromise(conn, node.dialect.statusList());
            
            interface ProcessListRow {
                Id: number;
                User: string;
                Host: string;
                db: string;
                Command: string;
                Time: number;
                State: string;
                Info: string;
            }
            
            interface VariableRow {
                Variable_name: string;
                Value: string;
            }
            
            const processes: IProcessInfo[] = (processResult.rows as ProcessListRow[]).map(row => ({
                Id: row.Id,
                User: row.User,
                Host: row.Host,
                db: row.db,
                Command: row.Command,
                Time: row.Time,
                State: row.State,
                Info: row.Info
            }));
            
            const variables: IVariableInfo[] = (variableResult.rows as VariableRow[]).map(row => ({
                Variable_name: row.Variable_name,
                Value: row.Value
            }));
            
            const status: IStatusInfo[] = (statusResult.rows as VariableRow[]).map(row => ({
                Variable_name: row.Variable_name,
                Value: row.Value
            }));
            
            const dashboard = {
                queries: dashboardResponse.queries.reduce((sum, item) => sum + item.value, 0),
                connections: processes.length,
                bytesReceived: dashboardResponse.traffic.find(item => item.type === 'received')?.value || 0,
                bytesSent: dashboardResponse.traffic.find(item => item.type === 'sent')?.value || 0,
                uptime: parseInt(status.find(item => item.Variable_name === 'Uptime')?.Value || '0'),
                threads: parseInt(status.find(item => item.Variable_name === 'Threads_connected')?.Value || '0')
            };
            
            return { processes, variables, status, dashboard };
        } else {
            // For non-MySQL databases, use basic implementation
            const conn = await ConnectionManager.getConnection(node);
            const processResult = await QueryUnit.queryPromise(conn, node.dialect.processList());
            const variableResult = await QueryUnit.queryPromise(conn, node.dialect.variableList());
            const statusResult = await QueryUnit.queryPromise(conn, node.dialect.statusList());
            
            interface ProcessListRow {
                Id: number;
                User: string;
                Host: string;
                db: string;
                Command: string;
                Time: number;
                State: string;
                Info: string;
            }
            
            interface VariableRow {
                Variable_name: string;
                Value: string;
            }
            
            const processes: IProcessInfo[] = (processResult.rows as ProcessListRow[]).map(row => ({
                Id: row.Id,
                User: row.User,
                Host: row.Host,
                db: row.db,
                Command: row.Command,
                Time: row.Time,
                State: row.State,
                Info: row.Info
            }));
            
            const variables: IVariableInfo[] = (variableResult.rows as VariableRow[]).map(row => ({
                Variable_name: row.Variable_name,
                Value: row.Value
            }));
            
            const status: IStatusInfo[] = (statusResult.rows as VariableRow[]).map(row => ({
                Variable_name: row.Variable_name,
                Value: row.Value
            }));
            
            return { processes, variables, status };
        }
    }


    // Schema Comparison
    async compareSchemas(fromConnection: string, fromDatabase: string, toConnection: string, toDatabase: string): Promise<ISchemaComparison> {
        const fromConn = await this.getConnection(fromConnection);
        const toConn = await this.getConnection(toConnection);
        const fromNode = this.connectionToNode(fromConn);
        const toNode = this.connectionToNode(toConn);
        
        // Get table groups for both databases
        const fromTableGroup = new TableGroup(fromNode);
        const toTableGroup = new TableGroup(toNode);
        
        const fromTables = await fromTableGroup.getChildren();
        const toTables = await toTableGroup.getChildren();
        
        const sqlList = await this.compareTables(fromTables, toTables);
        
        return {
            from: { connection: fromConnection, database: fromDatabase },
            to: { connection: toConnection, database: toDatabase },
            sqlList: sqlList.map(item => ({
                type: item.type as 'add' | 'remove' | 'change',
                sql: item.sql,
                selected: false,
                description: item.description
            }))
        };
    }

    async syncSchemas(connectionId: string, sqlList: ISchemaDiff[]): Promise<void> {
        const connection = await this.getConnection(connectionId);
        const node = this.connectionToNode(connection);
        const conn = await ConnectionManager.getConnection(node);
        
        for (const diff of sqlList.filter(d => d.selected)) {
            await QueryUnit.queryPromise(conn, diff.sql);
        }
    }

    // Export/Import
    async exportData(connectionId: string, options: IExportOptions): Promise<{ success: boolean; filename?: string; message?: string }> {
        try {
            const connection = await this.getConnection(connectionId);
            const node = this.connectionToNode(connection);
            
            const context = new ExportContext();
            context.sql = options.sql || `SELECT * FROM ${options.table}`;
            context.table = options.table;
            context.type = options.type as ExportType;
            context.withOutLimit = options.withOutLimit;
            context.dbOption = node;
            
            await this.exportService.export(context);
            
            return { success: true, filename: context.exportPath };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async importData(connectionId: string, options: IImportOptions): Promise<{ success: boolean; message?: string }> {
        try {
            const connection = await this.getConnection(connectionId);
            const node = this.connectionToNode(connection);
            
            let importService: ImportService;
            
            // Choose appropriate import service based on database type
            switch (connection.dbType) {
                case APIDbType.MySQL:
                    importService = new MysqlImportService();
                    break;
                case APIDbType.MongoDB:
                    importService = new MongoImportService();
                    break;
                case APIDbType.PostgreSQL:
                    importService = new PostgresqlImortService();
                    break;
                case APIDbType.SqlServer:
                    importService = new SqlServerImportService();
                    break;
                default:
                    importService = new MysqlImportService(); // Default fallback
            }
            
            if (options.type === 'sql') {
                importService.importSql(options.filename, node);
            } else {
                // Only SQL import is currently implemented across all database types
                throw new Error(`Import type ${options.type} not supported for ${connection.dbType}. Only SQL import is supported.`);
            }
            
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async getQueryHistory(connectionId: string): Promise<string[]>;
    async getQueryHistory(): Promise<IHistoryItem[]>;
    async getQueryHistory(connectionId?: string): Promise<string[] | IHistoryItem[]> {
        // Load ONLY from VS Code configuration
        const configHistory = Global.getConfig('queryHistory', []) as IHistoryItem[];
        
        if (connectionId) {
            // Return string array when connectionId is provided
            const filtered = configHistory
                .filter(item => item.connectionId === connectionId)
                .map(item => item.sql);
            return filtered;
        } else {
            // Return IHistoryItem array when no connectionId
            return configHistory;
        }
    }

    async saveQueryToHistory(query: string, connectionId: string): Promise<void> {
        // Save ONLY to VS Code configuration
        const configHistory = Global.getConfig('queryHistory', []) as IHistoryItem[];
        
        // Get connection details for the history item
        const connection = await this.getConnection(connectionId).catch(() => null);
        
        const newHistoryItem: IHistoryItem = {
            id: Date.now().toString(),
            sql: query,
            connectionId: connectionId,
            connectionName: connection?.name || 'Unknown Connection',
            database: connection?.database || '',
            timestamp: Date.now(),
            executionTime: 0,
            resultCount: 0
        };
        
        configHistory.unshift(newHistoryItem); // Add to beginning
        
        // Keep only the latest 1000 items
        if (configHistory.length > 1000) {
            configHistory.splice(1000);
        }
        
        await Global.updateConfig('queryHistory', configHistory);
    }

    async deleteHistoryItem(historyId: string): Promise<void> {
        // Delete ONLY from VS Code config
        const configHistory = Global.getConfig('queryHistory', []) as IHistoryItem[];
        const filteredHistory = configHistory.filter(item => item.id !== historyId);
        
        if (filteredHistory.length < configHistory.length) {
            await Global.updateConfig('queryHistory', filteredHistory);
        }
    }

    async clearHistory(): Promise<void> {
        // Clear ONLY VS Code configuration storage
        await Global.updateConfig('queryHistory', []);
    }

    // File Operations
    async browseFile(filters?: { [name: string]: string[] }): Promise<string | null> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: filters || { 'All Files': ['*'] }
        });
        
        return result && result[0] ? result[0].fsPath : null;
    }

    async saveFile(content: string, filename?: string, filters?: { [name: string]: string[] }): Promise<string | null> {
        const result = await vscode.window.showSaveDialog({
            defaultUri: filename ? vscode.Uri.file(filename) : undefined,
            filters: filters || { 'All Files': ['*'] }
        });
        
        if (result) {
            await vscode.workspace.fs.writeFile(result, Buffer.from(content));
            return result.fsPath;
        }
        
        return null;
    }

    async uploadFile(connectionId: string, localPath: string, remotePath: string): Promise<{ success: boolean; message?: string }> {
        try {
            const connection = await this.getConnection(connectionId);
            if (!connection.ssh) {
                return { success: false, message: 'Connection does not support SSH file operations' };
            }
            
            const sshConfig = this.connectionToSSHConfig(connection);
            const { sftp } = await ClientManager.getSSH(sshConfig);
            
            return new Promise((resolve) => {
                sftp.fastPut(localPath, remotePath, (err) => {
                    if (err) {
                        resolve({ success: false, message: err.message });
                    } else {
                        resolve({ success: true });
                    }
                });
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async downloadFile(connectionId: string, remotePath: string, localPath?: string): Promise<{ success: boolean; localPath?: string; message?: string }> {
        try {
            const connection = await this.getConnection(connectionId);
            if (!connection.ssh) {
                return { success: false, message: 'Connection does not support SSH file operations' };
            }
            
            const sshConfig = this.connectionToSSHConfig(connection);
            const { sftp } = await ClientManager.getSSH(sshConfig);
            
            const downloadPath = localPath || path.join(FileManager.getPath(''), path.basename(remotePath));
            
            return new Promise((resolve) => {
                sftp.fastGet(remotePath, downloadPath, (err) => {
                    if (err) {
                        resolve({ success: false, message: err.message });
                    } else {
                        resolve({ success: true, localPath: downloadPath });
                    }
                });
            });
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // User Input
    async showInputBox(prompt: string, defaultValue?: string, validateInput?: (value: string) => string | null): Promise<string | null> {
        return await vscode.window.showInputBox({
            prompt,
            value: defaultValue,
            validateInput
        });
    }

    async showQuickPick(items: string[], options?: { placeHolder?: string; canPickMany?: boolean }): Promise<string | string[] | null> {
        if (options?.canPickMany) {
            return await vscode.window.showQuickPick(items, {
                placeHolder: options.placeHolder,
                canPickMany: true
            }) || null;
        } else {
            return await vscode.window.showQuickPick(items, {
                placeHolder: options?.placeHolder
            }) || null;
        }
    }

    // Notifications
    async showMessage(message: string, type: 'info' | 'warning' | 'error'): Promise<void> {
        switch (type) {
            // Messages silently ignored - no notifications
        }
    }

    async showProgress(title: string, task: () => Promise<void>): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title,
            cancellable: false
        }, task);
    }

    // Status Bar
    async updateStatusBar(connection: IDatabaseConnection | null): Promise<void> {
        if (connection) {
            const node = this.connectionToNode(connection);
            Global.updateStatusBarItems(node);
        }
    }

    public get onStatusBarClick(): Event<void> {
        return this.statusBarClickEmitter.event;
    }

    public notifyStatusBarClick(): void {
        this.statusBarClickEmitter.fire();
    }

    // Helper methods
    private nodeToConnection(node: Node): IDatabaseConnection {
        return {
            id: node.uid,
            name: node.label,
            dbType: this.stringToApiDbType(node.dbType),
            host: node.host,
            port: node.port || 3306,
            database: node.database,
            schema: node.schema,
            user: node.user,
            ssh: node.ssh ? {
                host: node.ssh.host,
                port: node.ssh.port,
                username: node.ssh.username,
                password: node.ssh.password,
                privateKeyPath: node.ssh.privateKeyPath,
                passphrase: node.ssh.passphrase
            } : undefined,
            ssl: (node as ConnectionNode).useSSL ? {
                ca: (node as ConnectionNode).caPath,
                cert: (node as ConnectionNode).clientCertPath,
                key: (node as ConnectionNode).clientKeyPath
            } : undefined,
            options: {
                connectTimeout: node.connectTimeout,
                requestTimeout: node.requestTimeout,
                timezone: node.timezone
            }
        };
    }

    private connectionToNode(connection: IDatabaseConnection): Node {
        
        // Create the connection info object similar to how treeDataProvider does it
        const connectInfo = {
            uid: connection.id,
            label: connection.name,
            name: connection.name,
            dbType: this.apiDbTypeToString(connection.dbType),
            host: connection.host,
            port: connection.port,
            database: connection.database,
            schema: connection.schema,
            user: connection.user,
            password: connection.password,
            ssh: connection.ssh,
            ssl: connection.ssl,
            connectTimeout: connection.options?.connectTimeout,
            requestTimeout: connection.options?.requestTimeout,
            timezone: connection.options?.timezone
        };
        
        
        // Create the appropriate connection node type based on database type
        // This matches the logic in treeDataProvider.ts
        let node: Node;
        
        if (connectInfo.dbType === 'elasticsearch') {
            // Import and create EsConnectionNode
            const { EsConnectionNode } = require('../model/es/model/esConnectionNode');
            node = new EsConnectionNode(connection.id, connectInfo);
        } else if (connectInfo.dbType === 'redis') {
            // Import and create RedisConnectionNode
            const { RedisConnectionNode } = require('../model/redis/redisConnectionNode');
            node = new RedisConnectionNode(connection.id, connectInfo);
        } else if (connection.ssh && Object.keys(connection.ssh).length > 0) {
            // Import and create SSHConnectionNode for connections with SSH
            const { SSHConnectionNode } = require('../model/ssh/sshConnectionNode');
            node = new SSHConnectionNode(connection.id, connectInfo, connection.ssh, connection.name);
        } else if (connectInfo.dbType === 'ftp') {
            // Import and create FTPConnectionNode
            const { FTPConnectionNode } = require('../model/ftp/ftpConnectionNode');
            node = new FTPConnectionNode(connection.id, connectInfo);
        } else {
            // Import and create standard ConnectionNode for SQL databases
            const { ConnectionNode } = require('../model/database/connectionNode');
            node = new ConnectionNode(connection.id, connectInfo);
        }
        
        
        return node;
    }

    private getConnectionIcon(dbType: string): string {
        // Return appropriate icon path for each database type
        switch (dbType.toLowerCase()) {
            case 'mysql':
                return 'mysql.svg';
            case 'postgresql':
                return 'postgresql.svg';
            case 'mongodb':
                return 'mongodb.svg';
            case 'redis':
                return 'redis.svg';
            case 'sqlite':
                return 'sqlite.svg';
            case 'elasticsearch':
                return 'elasticsearch.svg';
            default:
                return 'database.svg';
        }
    }

    private connectionToSSHConfig(connection: IDatabaseConnection): SSHConfig {
        if (!connection.ssh) {
            throw new Error('Connection does not have SSH configuration');
        }
        
        return {
            host: connection.ssh.host,
            port: connection.ssh.port,
            username: connection.ssh.username,
            password: connection.ssh.password,
            privateKeyPath: connection.ssh.privateKeyPath,
            passphrase: connection.ssh.passphrase,
            tunnelPort: 0,
            key: this.generateId()
        };
    }

    private forwardInfoToRule(info: ForwardInfo, sshConfig: SSHConfig): IForwardRule {
        return {
            id: info.id,
            name: info.name,
            localHost: info.localHost,
            localPort: info.localPort,
            remoteHost: info.remoteHost,
            remotePort: info.remotePort,
            state: info.state,
            sshConfig: {
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                password: sshConfig.password,
                privateKeyPath: sshConfig.privateKeyPath,
                passphrase: sshConfig.passphrase
            }
        };
    }

    private nodeToTreeNode(node: Node): ITreeNode {
        // Handle different icon types
        let iconPath: string | undefined;
        
        if (typeof node.iconPath === 'string') {
            // It's a file path (SVG)
            iconPath = node.iconPath;
        } else if (node.iconPath && typeof node.iconPath === 'object' && 'id' in node.iconPath) {
            // It's a VS Code ThemeIcon - extract the codicon name
            iconPath = (node.iconPath as any).id;
        }

        // Note: We don't serialize the command property because:
        // 1. Command arguments contain Node object references that can't be serialized
        // 2. The contrib system can't execute extension commands with Node arguments anyway
        // 3. Double-click actions are handled by the contrib system's _handleNodeDoubleClick method
        
        return {
            id: node.uid,
            label: node.label,
            type: node.contextValue || 'unknown',
            contextValue: node.contextValue,
            collapsibleState: node.collapsibleState,
            iconPath: iconPath,
            description: node.description,
            tooltip: node.tooltip
        };
    }

    private stringToApiDbType(dbType: string): APIDbType {
        switch (dbType) {
            case DatabaseType.MYSQL: return APIDbType.MySQL;
            case DatabaseType.PG: return APIDbType.PostgreSQL;
            case DatabaseType.SQLITE: return APIDbType.SQLite;
            case DatabaseType.REDIS: return APIDbType.Redis;
            case DatabaseType.MONGO_DB: return APIDbType.MongoDB;
            case DatabaseType.MSSQL: return APIDbType.SqlServer;
            case DatabaseType.ES: return APIDbType.ElasticSearch;
            case DatabaseType.FTP: return APIDbType.FTP;
            case DatabaseType.SSH: return APIDbType.SSH;
            case DatabaseType.EXASOL: return APIDbType.Exasol;
            default: return APIDbType.MySQL;
        }
    }

    private apiDbTypeToString(dbType: APIDbType): string {
        switch (dbType) {
            case APIDbType.MySQL: return DatabaseType.MYSQL;
            case APIDbType.PostgreSQL: return DatabaseType.PG;
            case APIDbType.SQLite: return DatabaseType.SQLITE;
            case APIDbType.Redis: return DatabaseType.REDIS;
            case APIDbType.MongoDB: return DatabaseType.MONGO_DB;
            case APIDbType.SqlServer: return DatabaseType.MSSQL;
            case APIDbType.ElasticSearch: return DatabaseType.ES;
            case APIDbType.FTP: return DatabaseType.FTP;
            case APIDbType.SSH: return DatabaseType.SSH;
            case APIDbType.Exasol: return DatabaseType.EXASOL;
            default: return DatabaseType.MYSQL;
        }
    }

    private parseRedisInfo(infoString: string): IRedisServerInfo {
        const info: any = {};
        const lines = infoString.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('#') || !line.includes(':')) continue;
            const [key, value] = line.split(':');
            info[key.trim()] = isNaN(Number(value)) ? value.trim() : Number(value);
        }
        
        return {
            redis_version: info.redis_version || '',
            os: info.os || '',
            process_id: info.process_id || '',
            used_memory_human: info.used_memory_human || '',
            used_memory_peak_human: info.used_memory_peak_human || '',
            used_memory_lua: info.used_memory_lua || 0,
            connected_clients: info.connected_clients || '',
            total_connections_received: info.total_connections_received || '',
            total_commands_processed: info.total_commands_processed || '',
            ...info
        };
    }

    private generateId(): string {
        return Math.random().toString(36).substr(2, 9);
    }

    /**
     * Find a node by ID using tree traversal, just like VS Code's native tree view.
     * This avoids the need for caching all nodes and works with the existing tree structure.
     */
    private async findNodeById(nodeId: string, treeDataProvider: any): Promise<any> {
        // Start with root connections
        const rootNodes = await treeDataProvider.getConnectionNodes();
        
        // Recursively search through the tree
        return await this.searchNodeInTree(nodeId, rootNodes);
    }

    /**
     * Recursively search for a node in the tree structure
     */
    private async searchNodeInTree(targetId: string, nodes: any[]): Promise<any> {
        for (const node of nodes) {
            // Check if this is the target node
            if (node.uid === targetId) {
                return node;
            }
            
            // If this node can have children, search its children
            if (node.collapsibleState !== 0) { // 0 = TreeItemCollapsibleState.None
                try {
                    const children = await node.getChildren();
                    const found = await this.searchNodeInTree(targetId, children);
                    if (found) {
                        return found;
                    }
                } catch (error) {
                    // Skip nodes that can't be expanded (e.g., disconnected databases)
                    continue;
                }
            }
        }
        
        return null;
    }

    public notifyConnectionChange(connection: IDatabaseConnection): void {
        this.connectionChangeEmitter.fire(connection);
    }

    // Schema comparison helper methods (from DiffService)
    private async compareTables(fromTables: Node[], toTables: Node[]): Promise<any[]> {
        const toTablesMap: { [key: string]: Node } = {};
        const sqlList: any[] = [];
        
        for (const table of toTables) {
            toTablesMap[table.label] = table;
        }

        for (const table of fromTables) {
            if (toTablesMap[table.label]) {
                const fromChilds = await table.getChildren();
                const toChilds = await (toTablesMap[table.label] as TableNode).getChildren();
                sqlList.push(...await this.compareChilds(fromChilds, toChilds));
                delete toTablesMap[table.label];
            } else {
                sqlList.push({ type: 'remove', sql: `DROP TABLE ${table.label}` });
            }
        }

        for (const newTable in toTablesMap) {
            const newTableNode = toTablesMap[newTable] as TableNode;
            sqlList.push({ type: 'add', sql: await newTableNode.showSource(false) });
        }
        
        return sqlList;
    }

    private async compareChilds(fromColumns: Node[], toColumns: Node[]): Promise<any[]> {
        const toColumnsMap: { [key: string]: Node } = {};
        const sqlList: any[] = [];
        
        for (const column of toColumns) {
            toColumnsMap[column.label] = column;
        }

        fromColumns.forEach((fromColumn: ColumnNode) => {
            if (toColumnsMap[fromColumn.label]) {
                const toColumnNode = toColumnsMap[fromColumn.label] as ColumnNode;
                if (toColumnNode.type !== fromColumn.type) {
                    if (toColumnNode.dbType === DatabaseType.MSSQL || toColumnNode.dbType === DatabaseType.PG) {
                        sqlList.push({ type: 'change', sql: `ALTER TABLE ${toColumnNode.table} ALTER COLUMN ${toColumnNode.label} ${toColumnNode.type}` });
                    } else {
                        sqlList.push({ type: 'change', sql: `ALTER TABLE ${toColumnNode.table} CHANGE ${toColumnNode.label} ${toColumnNode.label} ${toColumnNode.type};` });
                    }
                }
                delete toColumnsMap[fromColumn.label];
            } else {
                sqlList.push({ type: 'remove', sql: `ALTER TABLE ${fromColumn.table} DROP COLUMN ${fromColumn.label};` });
            }
        });

        for (const toColumn in toColumnsMap) {
            const newColumnNode = toColumnsMap[toColumn] as ColumnNode;
            if (newColumnNode.dbType === DatabaseType.MSSQL) {
                sqlList.push({ type: 'add', sql: `ALTER TABLE ${newColumnNode.table} ADD ${newColumnNode.label} ${newColumnNode.column.type};` });
            } else {
                sqlList.push({ type: 'add', sql: `ALTER TABLE ${newColumnNode.table} ADD COLUMN ${newColumnNode.label} ${newColumnNode.column.type};` });
            }
        }
        
        return sqlList;
    }
}