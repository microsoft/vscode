"use strict";

import * as vscode from "vscode";
import { CodeCommand } from "./common/constants";
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
import { ConnectService } from "./service/connect/connectService";

export function activate(context: vscode.ExtensionContext) {

    const serviceManager = new ServiceManager(context)

    activeEs(context)

    ConnectionNode.init()
    context.subscriptions.push(
        ...serviceManager.init(),
        vscode.window.onDidChangeActiveTextEditor(detectActive),
        ConnectService.listenConfig(),
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
                'mysql.ssh.folder.new': (parentNode: SSHConnectionNode) => parentNode.newFolder(),
                'mysql.ssh.file.new': (parentNode: SSHConnectionNode) => parentNode.newFile(),
                'mysql.ssh.host.copy': (parentNode: SSHConnectionNode) => parentNode.copyIP(),
                'mysql.ssh.forward.port': (parentNode: SSHConnectionNode) => parentNode.fowardPort(),
                'mysql.ssh.file.upload': (parentNode: SSHConnectionNode) => parentNode.upload(),
                'mysql.ssh.folder.open': (parentNode: SSHConnectionNode) => parentNode.openInTeriminal(),
                'mysql.ssh.path.copy': (node: Node) => node.copyName(),
                'mysql.ssh.socks.port': (parentNode: SSHConnectionNode) => parentNode.startSocksProxy(),
                'mysql.ssh.file.delete': (fileNode: FileNode | SSHConnectionNode) => fileNode.delete(),
                'mysql.ssh.file.open': (fileNode: FileNode | FTPFileNode) => fileNode.open(),
                'mysql.ssh.file.download': (fileNode: FileNode) => fileNode.download(),
                'mysql.ssh.terminal.hear': (parentNode: SSHConnectionNode) => parentNode.openInTeriminal(),
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
            // mock
            ...{
                [CodeCommand.MockTable]: (tableNode: TableNode) => {
                    serviceManager.mockRunner.create(tableNode)
                },
                [CodeCommand.MockRun]: () => {
                    serviceManager.mockRunner.runMock()
                },
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
                }
            },
            // query node
            ...{
                [CodeCommand.RunQuery]: (sql:string) => {
                    if (typeof sql != 'string') { sql = null; }
                    QueryUnit.runQuery(sql, ConnectionManager.tryGetConnection());
                },
                [CodeCommand.RunAllQuery]: () => {
                    QueryUnit.runQuery(null, ConnectionManager.tryGetConnection(), { runAll: true });
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
            commandDefinition[command](...args);
        }catch (err) {
            Console.log(err);
        }
    };
}

function initCommand(commandDefinition: any): vscode.Disposable[] {

    const dispose = []

    for (const command in commandDefinition) {
        if (commandDefinition.hasOwnProperty(command)) {
            console.log(`🔧 Registering command: ${command}`); // Debug logging
            dispose.push(vscode.commands.registerCommand(command, commandWrapper(commandDefinition, command)))
        }
    }

    console.log(`✅ Registered ${dispose.length} commands total`); // Debug logging
    return dispose;
}


// refrences
// - when : https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts