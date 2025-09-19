import { Constants, ModelType, RedisType } from "../../common/constants";
import { Util } from "../../common/util";
import { ViewManager } from "../../common/viewManager";
import { Node } from "../interface/node";
import * as path from "path";
import { ThemeIcon, TreeItemCollapsibleState } from "vscode";
import RedisBaseNode from "./redisBaseNode";
import { RedisKeyView } from "../../webview/redisKeyView";
import { Global } from "../../common/global";

export default class KeyNode extends RedisBaseNode {
    private keyView: RedisKeyView | undefined;

    readonly contextValue = ModelType.REDIS_KEY;
    readonly iconPath = new ThemeIcon("key");
    readonly iconDetailPath = path.join(Constants.RES_PATH, `image/redis_connection.png`);
    constructor(readonly label: string, readonly prefix: string, readonly parent: Node) {
        super(label);
        this.init(parent)
        this.collapsibleState = TreeItemCollapsibleState.None
        if (Util.supportColorIcon()) {
            this.iconPath = new ThemeIcon("key", new ThemeIcon('charts.yellow'))
        }
        this.command = {
            title: 'View Key Detail',
            command: 'mysql.redis.key.detail',
            arguments: [this]
        }
    }

    async getChildren(): Promise<RedisBaseNode[]> {
        return [];
    }

    public async delete() {
        Util.confirm(`Are you sure you want to delete key ${this.label} ? `, async () => {
            const client = await this.getClient();
            await client.del(this.label)
            this.provider.reload()
        })
    }


    public async detail() {
        if (!this.keyView) {
            this.keyView = new RedisKeyView(Global.context.extensionUri);
            this.keyView.loadKey(this.label, await this.getClient());
        } else {
            this.keyView.reveal();
        }
    }

}