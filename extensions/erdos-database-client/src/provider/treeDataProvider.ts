import { GlobalState, WorkState } from "../common/state";
import { CatalogNode } from "../model/database/catalogNode";
import { EsConnectionNode } from "../model/es/model/esConnectionNode";
import { FTPConnectionNode } from "../model/ftp/ftpConnectionNode";
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

/**
 * Backend data provider - provides tree data to the workbench contribution system.
 * No longer implements VS Code TreeDataProvider interface since it's not registered as a tree view.
 */
export class DbTreeDataProvider {
    public static instances: DbTreeDataProvider[] = []

    constructor(protected context: vscode.ExtensionContext) {
        DbTreeDataProvider.instances.push(this)
    }

    public async openConnection(connectionNode: ConnectionNode) {        
        connectionNode.disable = false;
        connectionNode.indent({ command: CommandKey.update })
        
        // Also update the VSCode configuration to trigger contrib system refresh
        if (connectionNode.key) {
            try {
                await vscode.commands.executeCommand('erdos.disableConnection', connectionNode.getConnectId(), false);
            } catch (error) {
                console.warn('[DbTreeDataProvider] Failed to update VSCode configuration for connection enable:', error);
            }
        } else {
            console.warn('[DbTreeDataProvider] No connection key available for openConnection');
        }
    }

    public async disableConnection(connectionNode: ConnectionNode) {        
        connectionNode.disable = true;
        connectionNode.indent({ command: CommandKey.update })
        await vscode.commands.executeCommand('erdos.disableConnection', connectionNode.getConnectId(), true);
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
        // All connections now use the same storage key
        return CacheKey.CONNECTIONS;
    }


    public reload(element?: Node) {
        // Refresh the workbench contribution tree instead of extension tree
        this.refreshWorkbenchTree();
    }

    /**
     * refresh treeview context - now refreshes workbench contribution tree
     */
    public static refresh(element?: Node): void {
        // Refresh the workbench contribution tree
        Promise.resolve(vscode.commands.executeCommand('erdos.database.refresh')).catch(err => {
            console.warn('[DbTreeDataProvider] Failed to refresh workbench tree:', err);
        });
    }

    private refreshWorkbenchTree(): void {
        // Refresh the workbench contribution tree
        Promise.resolve(vscode.commands.executeCommand('erdos.database.refresh')).catch(err => {
            console.warn('[DbTreeDataProvider] Failed to refresh workbench tree:', err);
        });
    }

    public async getConnectionNodes(): Promise<Node[]> {
        // Read from the unified connections storage
        let globalConnections = GlobalState.get<{ [key: string]: Node }>(CacheKey.CONNECTIONS, {});
        let workspaceConnections = WorkState.get<{ [key: string]: Node }>(CacheKey.CONNECTIONS, {});
        
        const workspaceNodes = Object.keys(workspaceConnections).map(key => {
            const connectionKey = this.getKeyByNode(workspaceConnections[key]);
            return this.getNode(workspaceConnections[key], key, false, connectionKey);
        });
        const globalNodes = Object.keys(globalConnections).map(key => {
            const connectionKey = this.getKeyByNode(globalConnections[key]);
            return this.getNode(globalConnections[key], key, true, connectionKey);
        });
        
        const allNodes = workspaceNodes.concat(globalNodes);
        return allNodes;
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
                const tempList = DatabaseCache.getSchemaListOfConnection(cNode.getConnectId());
                schemaList = [];
                for (const catalogNode of tempList) {
                    if (catalogNode instanceof UserGroup) continue;
                    schemaList.push(...(await catalogNode.getChildren()))
                }
            } else {
                schemaList = DatabaseCache.getSchemaListOfConnection(cNode.getConnectId())
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
