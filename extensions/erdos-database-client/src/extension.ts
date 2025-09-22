"use strict";

import * as vscode from "vscode";
import { CodeCommand, CacheKey } from "./common/constants";
import { EsRequest } from "./model/es/esRequest";
import { ConnectionNode } from "./model/database/connectionNode";
import { SchemaNode } from "./model/database/schemaNode";
import { UserGroup } from "./model/database/userGroup";
import { CopyAble } from "./model/interface/copyAble";
import { FunctionNode } from "./model/main/function";
import { FunctionGroup } from "./model/main/functionGroup";
import { ProcedureNode } from "./model/main/procedure";
import { ProcedureGroup } from "./model/main/procedureGroup";
import { TableGroup } from "./model/main/tableGroup";
import { TableNode } from "./model/main/tableNode";
import { TriggerNode } from "./model/main/trigger";
import { TriggerGroup } from "./model/main/triggerGroup";
import { ViewGroup } from "./model/main/viewGroup";
import { ViewNode } from "./model/main/viewNode";
import { ColumnNode } from "./model/other/columnNode";
import { Console } from "./common/console";
// Don't change last order, it will occur circular reference
import { ServiceManager } from "./service/serviceManager";
import { QueryUnit } from "./service/queryUnit";
import { FileManager } from "./common/filesManager";
import { ConnectionManager } from "./service/connectionManager";
import { QueryNode } from "./model/query/queryNode";
import { QueryGroup } from "./model/query/queryGroup";
import { Node } from "./model/interface/node";
import { DbTreeDataProvider } from "./provider/treeDataProvider";
import { UserNode } from "./model/database/userNode";
import { EsConnectionNode } from "./model/es/model/esConnectionNode";
import { ESIndexNode } from "./model/es/model/esIndexNode";
import { activeEs } from "./model/es/provider/main";
import { RedisConnectionNode } from "./model/redis/redisConnectionNode";
import KeyNode from "./model/redis/keyNode";
import { DiffService } from "./service/diff/diffService";
import { DatabaseCache } from "./service/common/databaseCache";
import { FileNode } from "./model/ssh/fileNode";
import { SSHConnectionNode } from "./model/ssh/sshConnectionNode";
import { FTPFileNode } from "./model/ftp/ftpFileNode";
import { HistoryNode } from "./provider/history/historyNode";
import { HistoryProvider } from "./provider/history/historyProvider";
import { ConnectService } from "./service/connect/connectService";
import { DatabaseClientAPI } from "./api/databaseClientApi";
import { IDatabaseConnection } from "./api/erdosDatabaseClientApi";
import { GlobalState, WorkState } from "./common/state";

export function activate(context: vscode.ExtensionContext) {

    const serviceManager = new ServiceManager(context)

    activeEs(context)

    ConnectionNode.init()
    context.subscriptions.push(
        ...serviceManager.init(),
        vscode.window.onDidChangeActiveTextEditor(detectActive),
        ConnectService.listenConfig(),
        ...registerContribCommands(context),
        ...initCommand({
            // util
            ...{
                [CodeCommand.Refresh]: async (node: Node) => {
                    if (node) {
                        await node.getChildren(true)
                    } else {
                        DatabaseCache.clearCache()
                    }
                    DbTreeDataProvider.refresh(node)
                },
                [CodeCommand.RecordHistory]: (sql: string, costTime: number) => {
                    serviceManager.historyService.recordHistory(sql, costTime);
                },
                [CodeCommand.HistoryOpen]: () => serviceManager.historyService.showHistory(),
                [CodeCommand.SettingOpen]: () => {
                    serviceManager.settingService.open();
                },
                [CodeCommand.ServerInfo]: (connectionNode: ConnectionNode) => {
                    serviceManager.statusService.show(connectionNode)
                },
                [CodeCommand.NameCopy]: (copyAble: CopyAble) => {
                    copyAble.copyName();
                },
            },
            // connection
            ...{
                [CodeCommand.ConnectionAdd]: () => {
                    serviceManager.connectService.openConnect(serviceManager.provider)
                },
                [CodeCommand.ConnectionEdit]: (connectionNode: ConnectionNode) => {
                    serviceManager.connectService.openConnect(connectionNode.provider, connectionNode)
                },
                [CodeCommand.ConnectionConfig]: () => {
                    serviceManager.connectService.openConfig()
                },
                [CodeCommand.ConnectionOpen]: (connectionNode: ConnectionNode) => {
                    connectionNode.provider.openConnection(connectionNode)
                },
                [CodeCommand.ConnectionDisable]: (connectionNode: ConnectionNode) => {
                    connectionNode.provider.disableConnection(connectionNode)
                },
                [CodeCommand.ConnectionDelete]: (connectionNode: ConnectionNode) => {
                    connectionNode.deleteConnection(context);
                },
                [CodeCommand.HostCopy]: (connectionNode: ConnectionNode) => {
                    connectionNode.copyName();
                },
            },
            // externel data
            ...{
                [CodeCommand.StructDiff]: () => {
                    new DiffService().startDiff(serviceManager.provider);
                },
                [CodeCommand.DataExport]: (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).dump(node, true)
                },
                [CodeCommand.StructExport]: (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).dump(node, false)
                },
                [CodeCommand.DocumentGenerate]: (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).generateDocument(node)
                },
                [CodeCommand.DataImport]: (node: SchemaNode | ConnectionNode) => {
                    const importService=ServiceManager.getImportService(node.dbType);
                    vscode.window.showOpenDialog({ filters: importService.filter(), canSelectMany: false, openLabel: "Select sql file to import", canSelectFiles: true, canSelectFolders: false }).then((filePath) => {
                        if (filePath) {
                            importService.importSql(filePath[0].fsPath, node)
                        }
                    });
                },
            },
            // ssh
            ...{
                'database.ssh.folder.new': (parentNode: SSHConnectionNode) => parentNode.newFolder(),
                'database.ssh.file.new': (parentNode: SSHConnectionNode) => parentNode.newFile(),
                'database.ssh.host.copy': (parentNode: SSHConnectionNode) => parentNode.copyIP(),
                'database.ssh.forward.port': (parentNode: SSHConnectionNode) => parentNode.fowardPort(),
                'database.ssh.file.upload': (parentNode: SSHConnectionNode) => parentNode.upload(),
                'database.ssh.folder.open': (parentNode: SSHConnectionNode) => parentNode.openInTeriminal(),
                'database.ssh.path.copy': (node: Node) => node.copyName(),
                'database.ssh.socks.port': (parentNode: SSHConnectionNode) => parentNode.startSocksProxy(),
                'database.ssh.file.delete': (fileNode: FileNode | SSHConnectionNode) => fileNode.delete(),
                'database.ssh.file.open': (fileNode: FileNode | FTPFileNode) => fileNode.open(),
                'database.ssh.file.download': (fileNode: FileNode) => fileNode.download(),
                'database.ssh.terminal.hear': (parentNode: SSHConnectionNode) => parentNode.openInTeriminal(),
            },
            // database
            ...{
                [CodeCommand.DbActive]: () => {
                    serviceManager.provider.activeDb();
                },
                [CodeCommand.DbTruncate]: (databaseNode: SchemaNode) => {
                    databaseNode.truncateDb();
                },
                [CodeCommand.DatabaseAdd]: (connectionNode: ConnectionNode) => {
                    connectionNode.createDatabase();
                },
                [CodeCommand.DbDrop]: (databaseNode: SchemaNode) => {
                    databaseNode.dropDatatabase();
                }
            },
            // user node
            ...{
                [CodeCommand.ChangeUser]: (userNode: UserNode) => {
                    userNode.changePasswordTemplate();
                },
                [CodeCommand.UserGrant]: (userNode: UserNode) => {
                    userNode.grandTemplate();
                },
                [CodeCommand.UserSql]: (userNode: UserNode) => {
                    userNode.selectSqlTemplate();
                },
            },
            // history
            ...{
                [CodeCommand.HistoryView]: (historyNode: HistoryNode) => {
                    historyNode.view()
                },
                [CodeCommand.HistoryCopy]: (historyNode: HistoryNode) => {
                    vscode.env.clipboard.writeText(historyNode.sql);
                    // SQL copied to clipboard - silently
                },
                [CodeCommand.HistoryRun]: (historyNode: HistoryNode) => {
                    QueryUnit.runQuery(historyNode.sql, ConnectionManager.tryGetConnection(), { recordHistory: false });
                },
                [CodeCommand.HistoryDelete]: (historyNode: HistoryNode) => {
                    HistoryProvider.deleteHistory(historyNode);
                },
                [CodeCommand.HistoryClear]: () => {
                    // Clear all query history - silently clear without confirmation
                    serviceManager.historyService.clearHistory();
                }
            },
            // query node
            ...{
                [CodeCommand.RunQuery]: (sql:string) => {
                    if (typeof sql != 'string') { sql = null; }
                    QueryUnit.runQuery(sql, ConnectionManager.tryGetConnection(), { recordHistory: true });
                },
                [CodeCommand.RunAllQuery]: () => {
                    QueryUnit.runQuery(null, ConnectionManager.tryGetConnection(), { runAll: true, recordHistory: true });
                },
                [CodeCommand.QuerySwitch]: async (databaseOrConnectionNode: SchemaNode | ConnectionNode | EsConnectionNode | ESIndexNode) => {
                    if (databaseOrConnectionNode) {
                        await databaseOrConnectionNode.newQuery();
                    } else {
                        vscode.workspace.openTextDocument({ language: 'sql' }).then(async (doc) => {
                            vscode.window.showTextDocument(doc)
                        });
                    }
                },
                [CodeCommand.QueryRun]: (queryNode: QueryNode) => {
                    queryNode.run()
                },
                [CodeCommand.QueryOpen]: (queryNode: QueryNode) => {
                    queryNode.open()
                },
                [CodeCommand.QueryAdd]: (queryGroup: QueryGroup) => {
                    queryGroup.add();
                },
                [CodeCommand.QueryRename]: (queryNode: QueryNode) => {
                    queryNode.rename()
                }
            },
            // redis
            ...{
                [CodeCommand.RedisConnectionStatus]: (connectionNode: RedisConnectionNode) => connectionNode.showStatus(),
                [CodeCommand.ConnectionTerminal]: (node: Node) => node.openTerminal(),
                [CodeCommand.RedisKeyDetail]: (keyNode: KeyNode) => keyNode.detail(),
                [CodeCommand.RedisKeyDel]: (keyNode: KeyNode) => keyNode.delete(),
            },
            // table node
            ...{
                [CodeCommand.ShowEsIndex]: (indexNode: ESIndexNode) => {
                    indexNode.viewData()
                },
                [CodeCommand.TableTruncate]: (tableNode: TableNode) => {
                    tableNode.truncateTable();
                },
                [CodeCommand.TableDrop]: (tableNode: TableNode) => {
                    tableNode.dropTable();
                },
                [CodeCommand.TableSource]: (tableNode: TableNode) => {
                    if (tableNode) { tableNode.showSource(); }
                },
                [CodeCommand.ViewSource]: (tableNode: TableNode) => {
                    if (tableNode) { tableNode.showSource(); }
                },
                [CodeCommand.TableShow]: (tableNode: TableNode) => {
                    if (tableNode) { tableNode.openInNew(); }
                },
            },
            // column node
            ...{
                [CodeCommand.ColumnUp]: (columnNode: ColumnNode) => {
                    columnNode.moveUp();
                },
                [CodeCommand.ColumnDown]: (columnNode: ColumnNode) => {
                    columnNode.moveDown();
                },
                [CodeCommand.ColumnAdd]: (tableNode: TableNode) => {
                    tableNode.addColumnTemplate();
                },
                [CodeCommand.ColumnUpdate]: (columnNode: ColumnNode) => {
                    columnNode.updateColumnTemplate();
                },
                [CodeCommand.ColumnDrop]: (columnNode: ColumnNode) => {
                    columnNode.dropColumnTemplate();
                },
            },
            // template
            ...{
                [CodeCommand.TableFind]: (tableNode: TableNode) => {
                    tableNode.openTable();
                },
                [CodeCommand.CodeLensRun]: (sql: string) => {
                    QueryUnit.runQuery(sql, ConnectionManager.tryGetConnection(), { split: true, recordHistory: true })
                },
                [CodeCommand.TableDesign]: (tableNode: TableNode) => {
                    tableNode.designTable();
                },
            },
            // show source
            ...{
                [CodeCommand.ShowProcedure]: (procedureNode: ProcedureNode) => {
                    procedureNode.showSource();
                },
                [CodeCommand.ShowFunction]: (functionNode: FunctionNode) => {
                    functionNode.showSource();
                },
                [CodeCommand.ShowTrigger]: (triggerNode: TriggerNode) => {
                    triggerNode.showSource();
                },
            },
            // create template
            ...{
                [CodeCommand.TemplateSql]: (tableNode: TableNode) => {
                    tableNode.selectSqlTemplate();
                },
                [CodeCommand.TemplateTable]: (tableGroup: TableGroup) => {
                    tableGroup.createTemplate();
                },
                [CodeCommand.TemplateProcedure]: (procedureGroup: ProcedureGroup) => {
                    procedureGroup.createTemplate();
                },
                [CodeCommand.TemplateView]: (viewGroup: ViewGroup) => {
                    viewGroup.createTemplate();
                },
                [CodeCommand.TemplateTrigger]: (triggerGroup: TriggerGroup) => {
                    triggerGroup.createTemplate();
                },
                [CodeCommand.TemplateFunction]: (functionGroup: FunctionGroup) => {
                    functionGroup.createTemplate();
                },
                [CodeCommand.TemplateUser]: (userGroup: UserGroup) => {
                    userGroup.createTemplate();
                },
                [CodeCommand.ChangeTableName]: (tableNode: TableNode) => {
                    const sql = `ALTER TABLE ${tableNode.wrap(tableNode.table)} RENAME TO new_table_name;`;
                    QueryUnit.showSQLTextDocument(tableNode, sql, "rename_table.sql");
                },
            },
            // drop template
            ...{
                [CodeCommand.DeleteUser]: (userNode: UserNode) => {
                    userNode.drop();
                },
                [CodeCommand.DeleteView]: (viewNode: ViewNode) => {
                    viewNode.drop();
                },
                [CodeCommand.DeleteProcedure]: (procedureNode: ProcedureNode) => {
                    procedureNode.drop();
                },
                [CodeCommand.DeleteFunction]: (functionNode: FunctionNode) => {
                    functionNode.drop();
                },
                [CodeCommand.DeleteTrigger]: (triggerNode: TriggerNode) => {
                    triggerNode.drop();
                },
            },
        }),
    );

}

export function deactivate() {
}

function detectActive(): void {
    const fileNode = ConnectionManager.getByActiveFile();
    if (fileNode) {
        ConnectionManager.changeActive(fileNode);
    }
}

function commandWrapper(commandDefinition: any, command: string): (...args: any[]) => any {
    return (...args: any[]) => {
        try {
            // Convert nodeId arguments back to Node objects
            const convertedArgs = args.map((arg) => {
                if (typeof arg === 'string' && arg.includes('@@')) {
                    // This looks like a nodeId, try to get the cached node
                    const cachedNode = DatabaseClientAPI.getInstance().getCachedNode(arg);
                    if (cachedNode) {
                        return cachedNode;
                    }
                }
                return arg;
            });
            
            commandDefinition[command](...convertedArgs);
        }catch (err) {
            Console.log(err);
        }
    };
}

function initCommand(commandDefinition: any): vscode.Disposable[] {

    const dispose = []

    for (const command in commandDefinition) {
        if (commandDefinition.hasOwnProperty(command)) {
            dispose.push(vscode.commands.registerCommand(command, commandWrapper(commandDefinition, command)))
        }
    }

    // Editor Opening Commands - These open the contrib module editors
    dispose.push(
        vscode.commands.registerCommand('erdos.openQueryResultsEditor', async (options: { connectionId: string; initialQuery?: string; initialResults?: any; breadcrumbPath?: string[] }) => {
            // Create URI with query and breadcrumb encoded in query string
            const queryParams = new URLSearchParams();
            if (options.initialQuery) {
                queryParams.set('sql', options.initialQuery);
            }
            if (options.breadcrumbPath && options.breadcrumbPath.length > 0) {
                queryParams.set('breadcrumb', JSON.stringify(options.breadcrumbPath));
            }
            
            const uri = vscode.Uri.parse(`erdos-query-results:/${options.connectionId}/${Date.now()}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
            
            // All data is passed through URI path and query parameters, no custom options needed
            await vscode.commands.executeCommand('vscode.openWith', uri, 'workbench.editors.erdosQueryResultsEditor', { 
                pinned: true
            });
        })
    );

    return dispose;
}

// Export the API for use by contrib modules
export function getAPI() {
    return DatabaseClientAPI.getInstance();
}

// Register commands for contrib module communication
function registerContribCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const api = DatabaseClientAPI.getInstance();
    
    const commands = [
        // Connection Management
        vscode.commands.registerCommand('erdos.getConnections', async () => {
            return await api.getConnections();
        }),
        vscode.commands.registerCommand('erdos.getConnection', async (connectionId: string) => {
            return await api.getConnection(connectionId);
        }),
        vscode.commands.registerCommand('erdos.testConnection', async (config: any) => {
            return await api.testConnection(config);
        }),
        vscode.commands.registerCommand('erdos.saveConnection', async (config: any) => {
            return await api.saveConnection(config);
        }),
        vscode.commands.registerCommand('erdos.deleteConnection', async (connectionId: string) => {
            return await api.deleteConnection(connectionId);
        }),
        vscode.commands.registerCommand('erdos.disableConnection', async (connectionId: string, disabled: boolean) => {
            return await api.disableConnection(connectionId, disabled);
        }),

        // Tree Data
        vscode.commands.registerCommand('erdos.getTreeNodes', async (connectionId?: string) => {
            const result = await api.getTreeNodes(connectionId);
            return result || [];
        }),
        vscode.commands.registerCommand('erdos.refreshTreeNode', async (nodeId: string) => {
            return await api.refreshTreeNode(nodeId);
        }),
	vscode.commands.registerCommand('erdos.getNodeById', async (nodeId: string) => {
		await api.getNodeById(nodeId);
		return nodeId;
	}),

	vscode.commands.registerCommand('erdos.getConnectionById', async (connectionId: string) => {
		try {
			// Extract the base connection key from connection ID format
			// Connection IDs are in format: key@@host@port or key@@host@port@database
			const actualConnectionKey = connectionId.includes('@@') ? connectionId.split('@@')[0] : connectionId;
			
			// Get connections from unified storage
			const globalConnections = GlobalState.get(CacheKey.CONNECTIONS) as { [key: string]: any } || {};
			const workspaceConnections = WorkState.get(CacheKey.CONNECTIONS) as { [key: string]: any } || {};
			
			// Look for the connection in storage
			let connection = null;
			if (typeof globalConnections === 'object' && globalConnections[actualConnectionKey]) {
				connection = globalConnections[actualConnectionKey];
			} else if (typeof workspaceConnections === 'object' && workspaceConnections[actualConnectionKey]) {
				connection = workspaceConnections[actualConnectionKey];
			}
			
			if (connection) {
				// Convert to IDatabaseConnection format with connection-level ID
				const connectionLevelId = actualConnectionKey + '@@' + connection.host + '@' + (connection.instanceName ? connection.instanceName : connection.port);
				return {
					id: connectionLevelId,
					name: connection.name || `${connection.host}@${connection.port}`,
					dbType: connection.dbType,
					host: connection.host,
					port: connection.port,
					database: connection.database,
					user: connection.user
				};
			} else {
				return null;
			}
		} catch (error) {
			return null;
		}
	}),

        // Query Execution
        vscode.commands.registerCommand('erdos.executeQuery', async (connectionId: string, sql: string, options?: any) => {
            return await api.executeQuery(connectionId, sql, options);
        }),
        vscode.commands.registerCommand('erdos.getQueryHistory', async (connectionId: string) => {
            return await api.getQueryHistory(connectionId);
        }),

        
        // Cell Editing and Sorting
        vscode.commands.registerCommand('erdos.saveModify', async (connectionId: string, sql: string) => {
            return await api.executeQuery(connectionId, sql, { recordHistory: false });
        }),
        vscode.commands.registerCommand('erdos.esSort', async (connectionId: string, originalSql: string, sort: any[]) => {
            const esQuery = EsRequest.build(originalSql, obj => {
                obj.sort = sort;
            });
            return await api.executeQuery(connectionId, esQuery, { recordHistory: true });
        }),

        // Table Operations
        vscode.commands.registerCommand('erdos.getTableDesign', async (connectionId: string, database: string, table: string) => {
            return await api.getTableDesign(connectionId, database, table);
        }),
        vscode.commands.registerCommand('erdos.updateTable', async (connectionId: string, database: string, oldName: string, newName: string, comment?: string) => {
            return await api.updateTable(connectionId, database, oldName, newName, comment);
        }),
        vscode.commands.registerCommand('erdos.addColumn', async (connectionId: string, database: string, table: string, column: any) => {
            return await api.addColumn(connectionId, database, table, column);
        }),
        vscode.commands.registerCommand('erdos.updateColumn', async (connectionId: string, database: string, table: string, column: any) => {
            return await api.updateColumn(connectionId, database, table, column);
        }),
        vscode.commands.registerCommand('erdos.deleteColumn', async (connectionId: string, database: string, table: string, columnName: string) => {
            return await api.deleteColumn(connectionId, database, table, columnName);
        }),
        vscode.commands.registerCommand('erdos.addIndex', async (connectionId: string, database: string, table: string, index: any) => {
            return await api.addIndex(connectionId, database, table, index);
        }),
        vscode.commands.registerCommand('erdos.deleteIndex', async (connectionId: string, database: string, table: string, indexName: string) => {
            return await api.deleteIndex(connectionId, database, table, indexName);
        }),

        // Redis Operations
        vscode.commands.registerCommand('erdos.getRedisStatus', async (connectionId: string) => {
            return await api.getRedisStatus(connectionId);
        }),
        vscode.commands.registerCommand('erdos.getRedisKeys', async (connectionId: string, pattern?: string, database?: number) => {
            return await api.getRedisKeys(connectionId, pattern, database);
        }),
        vscode.commands.registerCommand('erdos.getRedisKey', async (connectionId: string, keyName: string) => {
            return await api.getRedisKey(connectionId, keyName);
        }),
        vscode.commands.registerCommand('erdos.setRedisKey', async (connectionId: string, keyName: string, value: any, ttl?: number) => {
            return await api.setRedisKey(connectionId, keyName, value, ttl);
        }),
        vscode.commands.registerCommand('erdos.deleteRedisKey', async (connectionId: string, keyName: string) => {
            return await api.deleteRedisKey(connectionId, keyName);
        }),
        vscode.commands.registerCommand('erdos.renameRedisKey', async (connectionId: string, oldName: string, newName: string) => {
            return await api.renameRedisKey(connectionId, oldName, newName);
        }),
        vscode.commands.registerCommand('erdos.executeRedisCommand', async (connectionId: string, command: string, args?: string[]) => {
            return await api.executeRedisCommand(connectionId, command, args);
        }),

        // SSH Terminal
        vscode.commands.registerCommand('erdos.createSSHTerminal', async (config: any) => {
            return await api.createSSHTerminal(config);
        }),

        // Port Forwarding
        vscode.commands.registerCommand('erdos.getForwardingRules', async (connectionId: string) => {
            return await api.getForwardingRules(connectionId);
        }),
        vscode.commands.registerCommand('erdos.createForwardingRule', async (connectionId: string, rule: any) => {
            return await api.createForwardingRule(connectionId, rule);
        }),
        vscode.commands.registerCommand('erdos.startForwarding', async (ruleId: string) => {
            return await api.startForwarding(ruleId);
        }),
        vscode.commands.registerCommand('erdos.stopForwarding', async (ruleId: string) => {
            return await api.stopForwarding(ruleId);
        }),
        vscode.commands.registerCommand('erdos.deleteForwardingRule', async (ruleId: string) => {
            return await api.deleteForwardingRule(ruleId);
        }),

        // Database Status
        vscode.commands.registerCommand('erdos.getDatabaseStatus', async (connectionId: string) => {
            return await api.getDatabaseStatus(connectionId);
        }),

        // Schema Comparison
        vscode.commands.registerCommand('erdos.compareSchemas', async (fromConnection: string, fromDatabase: string, toConnection: string, toDatabase: string) => {
            return await api.compareSchemas(fromConnection, fromDatabase, toConnection, toDatabase);
        }),
        vscode.commands.registerCommand('erdos.syncSchemas', async (connectionId: string, sqlList: any[]) => {
            return await api.syncSchemas(connectionId, sqlList);
        }),

        // Export/Import
        vscode.commands.registerCommand('erdos.exportData', async (connectionId: string, options: any) => {
            return await api.exportData(connectionId, options);
        }),
        vscode.commands.registerCommand('erdos.importData', async (connectionId: string, options: any) => {
            return await api.importData(connectionId, options);
        }),

        // Context menu functionality is now handled by the workbench contribution system

        // Tree View Operations (for view components)
        vscode.commands.registerCommand('erdos.getTreeNodesForView', async (nodeId?: string) => {
            return await api.getTreeNodes(nodeId);
        }),
        vscode.commands.registerCommand('erdos.refreshTreeNodeForView', async (nodeId: string) => {
            return await api.refreshTreeNode(nodeId);
        }),
        vscode.commands.registerCommand('erdos.getQueryHistoryForView', async () => {
            return await api.getQueryHistory();
        }),
        vscode.commands.registerCommand('erdos.getQueryHistoryItems', async () => {
            const result = await api.getQueryHistory();
            return result;
        }),
        vscode.commands.registerCommand('erdos.saveQueryToHistory', async (query: string, connectionId: string) => {
            return await api.saveQueryToHistory(query, connectionId);
        }),
        vscode.commands.registerCommand('erdos.deleteHistoryItem', async (historyId: string) => {
            return await api.deleteHistoryItem(historyId);
        }),
        vscode.commands.registerCommand('erdos.clearHistory', async () => {
            return await api.clearHistory();
        }),
        
        // Debug command to add test history items
        vscode.commands.registerCommand('erdos.addTestHistoryItem', async () => {
            await api.saveQueryToHistory('SELECT * FROM test_table WHERE id = 1', 'test-connection-id');
            // Trigger refresh of query history view
            vscode.commands.executeCommand('erdos.refreshQueryHistory');
            // Also try to open the query history view
            vscode.commands.executeCommand('erdos.database.openHistory');
        }),
        
        // File Operations
        vscode.commands.registerCommand('erdos.browseFile', async (filters?: any) => {
            return await api.browseFile(filters);
        }),
        vscode.commands.registerCommand('erdos.saveFile', async (content: string, filename?: string, filters?: any) => {
            return await api.saveFile(content, filename, filters);
        }),
        vscode.commands.registerCommand('erdos.uploadFile', async (connectionId: string, localPath: string, remotePath: string) => {
            return await api.uploadFile(connectionId, localPath, remotePath);
        }),
        vscode.commands.registerCommand('erdos.downloadFile', async (connectionId: string, remotePath: string, localPath?: string) => {
            return await api.downloadFile(connectionId, remotePath, localPath);
        }),

        // User Input
        vscode.commands.registerCommand('erdos.showInputBox', async (prompt: string, defaultValue?: string, validateInput?: any) => {
            return await api.showInputBox(prompt, defaultValue, validateInput);
        }),
        vscode.commands.registerCommand('erdos.showQuickPick', async (items: string[], options?: any) => {
            return await api.showQuickPick(items, options);
        }),

        // Notifications
        vscode.commands.registerCommand('erdos.showMessage', async (message: string, type: 'info' | 'warning' | 'error') => {
            return await api.showMessage(message, type);
        }),
        vscode.commands.registerCommand('erdos.showProgress', async (title: string, task: () => Promise<void>) => {
            return await api.showProgress(title, task);
        }),

        // Editor Opening Commands - These open the contrib module editors
        // Note: These commands will be handled by the contrib module's editor system
		vscode.commands.registerCommand('erdos.openConnectionEditor', async (options?: { connection?: any; isEdit?: boolean }) => {
			// Call the internal workbench contribution command directly
			await vscode.commands.executeCommand('erdos.internal.openConnectionEditor', options);
		}),
        vscode.commands.registerCommand('erdos.openTableDesignEditor', async (options: { connectionId: string; database: string; table: string }) => {
            // Open the Table Design editor in contrib system
            // All data is passed through URI path, no custom options needed
            await vscode.commands.executeCommand('vscode.openWith', 
                vscode.Uri.parse(`erdos-table-design:/${options.connectionId}/${options.database}/${options.table}`), 
                'workbench.editors.erdosTableDesignEditor',
                { pinned: true }
            );
        }),
        vscode.commands.registerCommand('erdos.openRedisKeyEditor', async (options: { connectionId: string; key: string }) => {
            // Open the Redis Key editor in contrib system
            // All data is passed through URI path, no custom options needed
            await vscode.commands.executeCommand('vscode.openWith', 
                vscode.Uri.parse(`erdos-redis-key:/${options.connectionId}/${encodeURIComponent(options.key)}`), 
                'workbench.editors.erdosRedisKeyEditor',
                { pinned: true }
            );
        }),
        vscode.commands.registerCommand('erdos.openRedisTerminalEditor', async (options: { connectionId: string }) => {
            // For now, show a message that Redis terminal is available in the Databases pane
            // Redis terminal is available in the Databases pane - silently ignore
        }),
        vscode.commands.registerCommand('erdos.openRedisStatusView', async (options: { connectionId: string }) => {
            // Redis status should be shown in a dedicated view - for now, we'll use a basic implementation
            const statusData = await api.getRedisStatus(options.connectionId);
            // Redis Status - silently ignore
        }),
        vscode.commands.registerCommand('erdos.openSSHTerminalEditor', async (options: { connectionId: string }) => {
            // Open the SSH Terminal editor in contrib system
            // All data is passed through URI path, no custom options needed
            await vscode.commands.executeCommand('vscode.openWith', 
                vscode.Uri.parse(`erdos-ssh-terminal:/${options.connectionId}/${Date.now()}`), 
                'workbench.editors.erdosSSHTerminalEditor',
                { pinned: true }
            );
        }),
        vscode.commands.registerCommand('erdos.openPortForwardingEditor', async (options?: { sshConfig?: any }) => {
            // Open the Port Forwarding editor in contrib system
            // All data is passed through URI path, no custom options needed
            const configId = options?.sshConfig?.id || 'new';
            await vscode.commands.executeCommand('vscode.openWith', 
                vscode.Uri.parse(`erdos-port-forwarding:/${configId}`), 
                'workbench.editors.erdosPortForwardingEditor',
                { pinned: true }
            );
        }),
        vscode.commands.registerCommand('erdos.openSchemaComparisonEditor', async () => {
            await vscode.commands.executeCommand('database.struct.diff');
        })
        
        // Note: View title commands are handled by the contrib system
    ];

    return commands;
}


// refrences
// - when : https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts