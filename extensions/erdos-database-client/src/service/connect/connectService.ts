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
import { ConnectionConfig } from "./config/connnetionConfig";
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
        // Open connection editor via command - now handled by contrib module
        vscode.commands.executeCommand('erdos.openConnectionEditor', {
            connection: node,
            isEdit: !!connectionNode
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
            const connectionConfig: ConnectionConfig = JSON.parse(configContent)
            
            const globalConnections = connectionConfig.connections.global || {};
            const workspaceConnections = connectionConfig.connections.workspace || {};
            
            await GlobalState.update(CacheKey.CONNECTIONS, globalConnections);
            await WorkState.update(CacheKey.CONNECTIONS, workspaceConnections);
            DbTreeDataProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage("Parse connect config fail!")
        }
    }

    public openConfig() {

        // Get all connections from unified storage
        const allGlobalConnections = GlobalState.get(CacheKey.CONNECTIONS, {});
        const allWorkspaceConnections = WorkState.get(CacheKey.CONNECTIONS, {});
        
        // Export all connections in the new unified format
        const connectionConfig: ConnectionConfig = {
            connections: {
                global: allGlobalConnections,
                workspace: allWorkspaceConnections,
            }
        };

        FileManager.record("config.json", JSON.stringify(connectionConfig, this.trim, 2), FileModel.WRITE).then(filePath => {
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