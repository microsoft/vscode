import { Constants, ModelType, RedisType } from "../../common/constants";
import { Util } from "../../common/util";
import { ViewManager } from "../../common/viewManager";
import { Node } from "../interface/node";
import * as path from "path";
import { ThemeIcon, TreeItemCollapsibleState } from "vscode";
import RedisBaseNode from "./redisBaseNode";

export default class KeyNode extends RedisBaseNode {

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

        const client = await this.getClient();
        const type = await client.type(this.label)
        let content: any;
        switch (type) {
            case RedisType.string:
                content = await client.get(this.label)
                break;
            case RedisType.hash:
                const hall = await client.hgetall(this.label)
                content = Object.keys(hall).map(key => {
                    return { key, value: hall[key] }
                })
                break;
            case RedisType.list:
                content = await client.lrange(this.label, 0, await client.llen(this.label))
                break;
            case RedisType.set:
                content = await client.smembers(this.label)
                break;
            case RedisType.zset:
                content = await client.zrange(this.label, 0, await client.zcard(this.label))
                break;
        }
        const title = `${type}:${this.label}`;

        ViewManager.createWebviewPanel({
            path: "app", splitView: false, title, type: "Info", singlePage: true,
            iconPath: this.iconDetailPath,
            eventHandler: async (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'keyView')
                }).on("route-keyView", async () => {
                    handler.panel.title = title
                    handler.emit("detail", {
                        res: {
                            content, type, name: this.label,
                            ttl: await client.ttl(this.label)
                        }
                    })
                }).on("refresh", () => {
                    this.detail()
                }).on("update", async (content) => {
                    switch (content.key.type) {
                        case 'string':
                            await client.set(content.key.name, content.key.content)
                            handler.emit("msg", `Update key ${content.key.name} to new value success!`)
                            break;
                    }
                }).on("rename", async (content) => {
                    await client.rename(content.key.name, content.key.newName)
                    this.detail()
                }).on("del", async (content) => {
                    await client.del(content.key.name)
                }).on("ttl", async (content) => {
                    await client.expire(content.key.name, content.key.ttl)
                    handler.emit("msg", `Change TTL for key:${content.key.name} success!`)
                }).on("add", async content => {
                    switch (type) {
                        case RedisType.hash:
                            client.hset(this.label, content.key, content.value)
                            break;
                        case RedisType.list:
                            client.lpush(this.label, 0, content.value)
                            break;
                        case RedisType.set:
                            client.sadd(this.label, content.value)
                            break;
                        case RedisType.zset:
                            client.zadd(this.label, 0, content.value)
                            break;
                    }
                    handler.emit("refresh")
                }).on("deleteLine", async content => {
                    switch (type) {
                        case RedisType.hash:
                            client.hdel(this.label, content.key)
                            break;
                        case RedisType.list:
                            client.lrem(this.label, 0, content)
                            break;
                        case RedisType.set:
                            client.srem(this.label, content)
                            break;
                        case RedisType.zset:
                            client.zrem(this.label, content)
                            break;
                    }
                    handler.emit("refresh")
                })
            }
        })

    }

}