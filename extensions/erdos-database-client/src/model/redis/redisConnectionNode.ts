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

export class RedisConnectionNode extends RedisBaseNode {


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
        const client = await this.getClient()
        ViewManager.createWebviewPanel({
            splitView: true, title: `${this.host}@${this.port}`, preserveFocus: false,
            iconPath: {
                light: Util.getExtPath("image", "terminal_light.png"),
                dark: Util.getExtPath("image", "terminal_dark.svg"),
            }, path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'terminal')
                }).on("route-terminal", async () => {
                    handler.emit("config", NodeUtil.removeParent(this))
                }).on("exec", async (content) => {
                    if (!content) {
                        return;
                    }
                    const splitCommand: string[] = content.replace(/ +/g, " ").split(' ')
                    const command = splitCommand.shift()
                    const reply = await client.send_command(command, splitCommand)
                    handler.emit("result", reply)
                }).on("exit", () => {
                    handler.panel.dispose()
                })
            }
        })
    }

    async showStatus(): Promise<any> {
        const client = await this.getClient()
        client.info((err, reply) => {
            ViewManager.createWebviewPanel({
                title: "Redis Server Status", splitView: false,
                path: "app",
                eventHandler: (handler) => {
                    handler.on("init", () => {
                        handler.emit("route", 'redisStatus')
                    }).on("route-redisStatus", async () => {
                        handler.emit("info", reply)
                    })
                }
            })
        })
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

