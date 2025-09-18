import { Constants, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { Node } from "../interface/node";
import * as path from "path";
import { ThemeColor, ThemeIcon } from "vscode";
import KeyNode from "./keyNode";
import RedisBaseNode from "./redisBaseNode";


export class RedisFolderNode extends RedisBaseNode {
    contextValue = ModelType.REDIS_FOLDER;
    readonly iconPath = path.join(Constants.RES_PATH, `image/redis_folder.svg`);
    // readonly iconPath =new ThemeIcon("folder")
    constructor(readonly label: string, readonly childens: string[], readonly parent: RedisBaseNode) {
        super(label)
        this.init(parent)
        this.pattern = label
        this.level = parent.hasOwnProperty('level') ? parent.level + 1 : 0
    }

    public async getChildren() {
        return RedisFolderNode.buildChilds(this, this.childens)
    }

    public static buildChilds(parent: RedisBaseNode, keys: string[]) {
        const prefixMap: { [key: string]: string[] } = {}
        for (const key of keys.sort()) {
            let prefix = key.split(":")[parent.level];
            if (!prefixMap[prefix]) prefixMap[prefix] = []
            prefixMap[prefix].push(key)
        }

        return Object.keys(prefixMap).map((prefix: string) => {
            if (prefixMap[prefix].length > 1) {
                return new RedisFolderNode(prefix, prefixMap[prefix], parent)
            } else {
                return new KeyNode(prefixMap[prefix][0], prefix, parent)
            }
        })
    }

    public async delete() {
        Util.confirm(`Are you sure you want to delete folder ${this.label} ? `, async () => {
            const client = await this.getClient();
            for (const child of this.childens) {
                await client.del(child) 
            }
            this.provider.reload()
        })
    }

}

