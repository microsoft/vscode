import { GlobalState, WorkState } from "../common/state";
import { CatalogNode } from "../model/database/catalogNode";
import { EsConnectionNode } from "../model/es/model/esConnectionNode";
import { FTPConnectionNode } from "../model/ftp/ftpConnectionNode";
import { InfoNode } from "../model/other/infoNode";
import { RedisConnectionNode } from "../model/redis/redisConnectionNode";
import { SSHConnectionNode } from "../model/ssh/sshConnectionNode";
import * as vscode from "vscode";
import { CacheKey, DatabaseType } from "../common/constants";
import { ConnectionNode } from "../model/database/connectionNode";
import { SchemaNode } from "../model/database/schemaNode";
import { UserGroup } from "../model/database/userGroup";
import { CommandKey, Node } from "../model/interface/node";
import { DatabaseCache } from "../service/common/databaseCache";
import { ConnectionManager } from "../service/connectionManager";

export class DbTreeDataProvider implements vscode.TreeDataProvider<Node> {

    public _onDidChangeTreeData: vscode.EventEmitter<Node> = new vscode.EventEmitter<Node>();
    public readonly onDidChangeTreeData: vscode.Event<Node> = this._onDidChangeTreeData.event;
    public static instances: DbTreeDataProvider[] = []

    constructor(protected context: vscode.ExtensionContext, public connectionKey: string) {
        DbTreeDataProvider.instances.push(this)
    }

    public getTreeItem(element: Node): Promise<vscode.TreeItem> | vscode.TreeItem {
        return element;
    }

    public getParent(element?: Node) {
        return element && element.parent;
    }

    public async getChildren(element?: Node): Promise<Node[]> {
        return new Promise(async (res, rej) => {
            if (!element) {
                res(this.getConnectionNodes())
                return;
            }
            try {
                let mark = setTimeout(() => {
                    res([new InfoNode(`Connect time out!`)])
                    mark = null;
                }, element.connectTimeout || 5000);
                const children = await element.getChildren();
                if (mark) {
                    clearTimeout(mark)
                    for (const child of children) {
                        child.parent = element;
                    }
                    res(children);
                } else {
                    this.reload(element)
                }
            } catch (error) {
                res([new InfoNode(error)])
            }
        })
    }

    public async openConnection(connectionNode: ConnectionNode) {
        connectionNode.disable = false;
        connectionNode.indent({ command: CommandKey.update })
    }

    public async disableConnection(connectionNode: ConnectionNode) {
        connectionNode.disable = true;
        connectionNode.indent({ command: CommandKey.update })
    }

    public async addConnection(node: Node) {

        const newKey = this.getKeyByNode(node)
        node.context = node.global ? this.context.globalState : this.context.workspaceState

        const isGlobal = "isGlobal" in node && (node as {isGlobal?: boolean}).isGlobal;
        const configNotChange = newKey == node.connectionKey && isGlobal == node.global
        if (configNotChange) {
            await node.indent({ command: CommandKey.update })
            return;
        }

        // config has change, remove old connection.
        if (isGlobal != null) {
            node.context = isGlobal ? this.context.globalState : this.context.workspaceState
            await node.indent({ command: CommandKey.delete, connectionKey: node.connectionKey, refresh: false })
            node.context = node.global ? this.context.globalState : this.context.workspaceState
        }

        node.connectionKey = newKey
        await node.indent({ command: CommandKey.add, connectionKey: newKey })

    }

    private getKeyByNode(connectionNode: Node): string {
        const dbType = connectionNode.dbType;
        if (dbType == DatabaseType.ES || dbType == DatabaseType.REDIS || dbType == DatabaseType.SSH || dbType == DatabaseType.FTP || dbType == DatabaseType.MONGO_DB) {
            return CacheKey.NOSQL_CONNECTION;
        }
        return CacheKey.DATBASE_CONECTIONS;
    }


    public reload(element?: Node) {
        this._onDidChangeTreeData.fire(element);
    }

    /**
     * refresh treeview context
     */
    public static refresh(element?: Node): void {
        for (const instance of this.instances) {
            instance._onDidChangeTreeData.fire(element);
        }
    }

    public static getInstnace() {
        return this.instances;
    }

    public async getConnectionNodes(): Promise<Node[]> {

        const connetKey = this.connectionKey;
        let globalConnections = GlobalState.get<{ [key: string]: Node }>(connetKey, {});
        let workspaceConnections = WorkState.get<{ [key: string]: Node }>(connetKey, {});

        return Object.keys(workspaceConnections).map(key => this.getNode(workspaceConnections[key], key, false, connetKey)).concat(
            Object.keys(globalConnections).map(key => this.getNode(globalConnections[key], key, true, connetKey))
        )
    }

    private getNode(connectInfo: Node, key: string, global: boolean, connectionKey: string) {
        // Compatible with old version connection info
        if (!connectInfo.dbType) connectInfo.dbType = DatabaseType.MYSQL
        let node: Node;
        if (connectInfo.dbType == DatabaseType.ES) {
            node = new EsConnectionNode(key, connectInfo);
        } else if (connectInfo.dbType == DatabaseType.REDIS) {
            node = new RedisConnectionNode(key, connectInfo)
        } else if (connectInfo.dbType == DatabaseType.SSH) {
            connectInfo.ssh.key = connectInfo.key
            node = new SSHConnectionNode(key, connectInfo, connectInfo.ssh, connectInfo.name)
        } else if (connectInfo.dbType == DatabaseType.FTP) {
            node = new FTPConnectionNode(key, connectInfo)
        } else {
            node = new ConnectionNode(key, connectInfo)
        }
        node.connectionKey = connectionKey;
        node.provider = this
        node.global = global;
        node.context = node.global ? this.context.globalState : this.context.workspaceState;
        if (!node.global) {
            node.description = `${node.description || ''} workspace`
        }
        return node;
    }

    public async activeDb() {

        const node = ConnectionManager.getByActiveFile()
        if (node) {
            vscode.window.showErrorMessage("Query file can not change active database.")
            return;
        }

        const dbIdList: string[] = [];
        const dbIdMap = new Map<string, Node>();
        const connectionNodes = await this.getConnectionNodes()
        for (const cNode of connectionNodes) {
            if (cNode.dbType == DatabaseType.SQLITE) {
                const uid = cNode.label;
                dbIdList.push(uid)
                dbIdMap.set(uid, cNode)
                continue;
            }

            let schemaList: Node[];
            if (cNode.dbType == DatabaseType.MSSQL || cNode.dbType == DatabaseType.PG) {
                const tempList = DatabaseCache.getSchemaListOfConnection(cNode.uid);
                schemaList = [];
                for (const catalogNode of tempList) {
                    if (catalogNode instanceof UserGroup) continue;
                    schemaList.push(...(await catalogNode.getChildren()))
                }
            } else {
                schemaList = DatabaseCache.getSchemaListOfConnection(cNode.uid)
            }

            for (const schemaNode of schemaList) {
                if (schemaNode instanceof UserGroup || schemaNode instanceof CatalogNode) { continue }
                let uid = `${cNode.label}#${schemaNode.schema}`
                if (cNode.dbType == DatabaseType.PG || cNode.dbType == DatabaseType.MSSQL) {
                    uid = `${cNode.label}#${schemaNode.database}#${schemaNode.schema}`
                }
                dbIdList.push(uid)
                dbIdMap.set(uid, schemaNode)
            }

        }

        if (dbIdList.length == 0) {
            return;
        }

        vscode.window.showQuickPick(dbIdList).then(async (dbId) => {
            if (dbId) {
                const dbNode = dbIdMap.get(dbId);
                ConnectionManager.changeActive(dbNode)
            }
        })

    }

}
