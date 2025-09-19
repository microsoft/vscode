import { ConfigKey, Constants, ModelType } from "../../common/constants";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { ViewManager } from "../../common/viewManager";
import { CommandKey, Node } from "../interface/node";
import { NodeUtil } from "../nodeUtil";
import * as path from "path";
import * as vscode from "vscode";
import { RedisFolderNode } from "./folderNode";
import RedisBaseNode from "./redisBaseNode";
import { sync as commandExistsSync } from 'command-exists';
import { RedisTerminalView } from "../../webview/redisTerminalView";
import { RedisStatusView } from "../../webview/redisStatusView";

export class RedisConnectionNode extends RedisBaseNode {
    private terminalView: RedisTerminalView | undefined;
    private statusView: RedisStatusView | undefined;

    contextValue = ModelType.REDIS_CONNECTION;
    iconPath: string | vscode.ThemeIcon = path.join(Constants.RES_PATH, `image/redis_connection.png`);

    constructor(readonly key: string, readonly parent: Node) {
        super(key)
        this.init(parent)
        this.label = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.port}`;
        if ( parent.name) {
            this.name = parent.name
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true)
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description = (this.description||'') + " closed"
            return;
        }
    }

    async getChildren(): Promise<RedisBaseNode[]> {
        const client = await this.getClient()
        let keys: string[] = await client.keys(this.pattern)
        return RedisFolderNode.buildChilds(this, keys)
    }
    async openTerminal(): Promise<any> {
        if (!this.password && commandExistsSync('redis-cli')) {
            super.openTerminal();
            return;
        }
        
        if (!this.terminalView) {
            this.terminalView = new RedisTerminalView(Global.context.extensionUri);
            this.terminalView.setRedisClient(await this.getClient(), NodeUtil.removeParent(this));
        } else {
            this.terminalView.reveal();
        }
    }

    async showStatus(): Promise<any> {
        if (!this.statusView) {
            this.statusView = new RedisStatusView(Global.context.extensionUri);
            this.statusView.setRedisClient(await this.getClient());
        } else {
            this.statusView.reveal();
        }
    }

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you sure you want to Delete Connection ${this.label} ? `, async () => {
            this.indent({ command: CommandKey.delete })
        })

    }

}

