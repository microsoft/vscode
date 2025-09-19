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
import { ConnectionView } from "../../webview/connectionView";
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
    private connectionView: ConnectionView | undefined;

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
        if (!this.connectionView) {
            this.connectionView = new ConnectionView(Global.context.extensionUri);
        } else {
            this.connectionView.reveal();
        }
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