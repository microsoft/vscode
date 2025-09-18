import { CacheKey, CodeCommand, DatabaseType } from "../../common/constants";
import { FileManager, FileModel } from "../../common/filesManager";
import { ConnectionManager } from "../../service/connectionManager";
import { resolve } from "path";
import * as path from "path";
import { platform } from "os";
import { commands, Disposable, window, workspace } from "vscode";
import * as vscode from "vscode";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { ViewManager } from "../../common/viewManager";
import { ConnectionNode } from "../../model/database/connectionNode";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ClientManager } from "../ssh/clientManager";
import { ConnnetionConfig } from "./config/connnetionConfig";
import { readFileSync } from "fs";
import { GlobalState, WorkState } from "../../common/state";
import { sync as commandExistsSync } from 'command-exists';

export class ConnectService {

    public async openConnect(provider: DbTreeDataProvider, connectionNode?: ConnectionNode) {
        let node: any;
        if (connectionNode) {
            node = { ...NodeUtil.removeParent(connectionNode), isGlobal: connectionNode.global }
            if (node.ssh) {
                node.ssh.tunnelPort = null
                if (!node.ssh.algorithms) {
                    node.ssh.algorithms = { cipher: [] }
                }
            }
        }
        let plat: string = platform();
        ViewManager.createWebviewPanel({
            path: "app", title: connectionNode ? "edit" : "connect",
            splitView: false, iconPath: Global.getExtPath("resources", "icon", "connection.svg"),
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit('route', 'connect')
                }).on("route-connect", async () => {
                    if (node) {
                        handler.emit("edit", node)
                    } else {
                        handler.emit("connect")
                    }
                    const exists = plat == 'win32' ? true : commandExistsSync("sqlite");
                    handler.emit("sqliteState", exists)
                    
                    // Provide webview URIs for database icons
                    const webview = handler.panel.webview;
                    const extensionPath = Global.context.extensionPath;
                    const databaseIcons = {
                        'MySQL': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'icon', 'mysql.svg'))).toString(),
                        'PostgreSQL': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'icon', 'pg_server.svg'))).toString(),
                        'SqlServer': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'icon', 'mssql_server.png'))).toString(),
                        'SQLite': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'icon', 'sqlite-icon.svg'))).toString(),
                        'MongoDB': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'icon', 'mongodb-icon.svg'))).toString(),
                        'Redis': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'image', 'redis_connection.png'))).toString(),
                        'ElasticSearch': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'icon', 'elasticsearch.svg'))).toString(),
                        'SSH': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'ssh', 'forward.svg'))).toString(),
                        'FTP': webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'resources', 'ssh', 'zip.svg'))).toString()
                    };
                    handler.emit("databaseIcons", databaseIcons)
                }).on("installSqlite", () => {
                    let command: string;
                    switch (plat) {
                        case 'darwin':
                            command = `brew install sqlite3`
                            break;
                        case 'linux':
                            if (commandExistsSync("apt")) {
                                command = `sudo apt -y install sqlite`;
                            } else if (commandExistsSync("yum")) {
                                command = `sudo yum -y install sqlite3`;
                            } else if (commandExistsSync("dnf")) {
                                command = `sudo dnf install sqlite` // Fedora
                            } else {
                                command = `sudo pkg install -y sqlite3` // freebsd
                            }
                            break;
                        default: return;
                    }
                    const terminal = window.createTerminal("installSqlite")
                    terminal.sendText(command)
                    terminal.show()
                }).on("connecting", async (data) => {
                    const connectionOption = data.connectionOption
                    const node:Node = Util.trim(NodeUtil.of(connectionOption))
                    try {
                        node.initKey();
                        await this.connect(node)
                        await provider.addConnection(node)
                        const { key, connectionKey } = node
                        handler.emit("success", { message: 'connect success!', key, connectionKey })
                    } catch (err) {
                        if (err && err.message) {
                            handler.emit("error", err.message)
                        } else {
                            handler.emit("error", err)
                        }
                    }
                }).on("close", () => {
                    handler.panel.dispose()
                }).on("choose", ({ event, filters }) => {
                    window.showOpenDialog({ filters }).then((uris) => {
                        const uri = uris[0]
                        if (uri) {
                            handler.emit("choose", { event, path: uri.fsPath })
                        }
                    })
                })
            }
        });
    }

    public async connect(connectionNode: Node): Promise<void> {
        if (connectionNode.dbType == DatabaseType.SSH) {
            connectionNode.ssh.key=connectionNode.key;
            await ClientManager.getSSH(connectionNode.ssh, {withSftp:false})
            return;
        }
        ConnectionManager.removeConnection(connectionNode.getConnectId())
        await ConnectionManager.getConnection(connectionNode)
    }

    static listenConfig(): Disposable {
        const configPath = resolve(FileManager.getPath("config.json"))
        return workspace.onDidSaveTextDocument(e => {
            const changePath = resolve(e.uri.fsPath);
            if (changePath == configPath) {
                this.saveConfig(configPath)
            }
        });
    }

    private static async saveConfig(path: string) {
        const configContent = readFileSync(path, { encoding: 'utf8' })
        try {
            const connectonConfig: ConnnetionConfig = JSON.parse(configContent)
            await GlobalState.update(CacheKey.DATBASE_CONECTIONS, connectonConfig.database.global);
            await WorkState.update(CacheKey.DATBASE_CONECTIONS, connectonConfig.database.workspace);
            await GlobalState.update(CacheKey.NOSQL_CONNECTION, connectonConfig.nosql.global);
            await WorkState.update(CacheKey.NOSQL_CONNECTION, connectonConfig.nosql.workspace);
            DbTreeDataProvider.refresh();
        } catch (error) {
            window.showErrorMessage("Parse connect config fail!")
        }
    }

    public openConfig() {

        const connectonConfig: ConnnetionConfig = {
            database: {
                global: GlobalState.get(CacheKey.DATBASE_CONECTIONS),
                workspace: WorkState.get(CacheKey.DATBASE_CONECTIONS),
            },
            nosql: {
                global: GlobalState.get(CacheKey.NOSQL_CONNECTION),
                workspace: WorkState.get(CacheKey.NOSQL_CONNECTION),
            }
        };

        FileManager.record("config.json", JSON.stringify(connectonConfig, this.trim, 2), FileModel.WRITE).then(filePath => {
            FileManager.show(filePath)
        })

    }

    public trim(key: string, value: any): any {
        switch (key) {
            case "iconPath":
            case "contextValue":
            case "parent":
            case "key":
            case "label":
            case "id":
            case "resourceUri":
            case "pattern":
            case "level":
            case "tooltip":
            case "descriptionz":
            case "collapsibleState":
            case "terminalService":
            case "forwardService":
            case "file":
            case "parentName":
            case "connectionKey":
            case "sshConfig":
            case "fullPath":
            case "uid":
            case "command":
            case "dialect":
            case "provider":
            case "context":
            case "isGlobal":
                return undefined;
        }
        return value;
    }

}