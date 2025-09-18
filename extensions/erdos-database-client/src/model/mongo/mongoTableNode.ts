import { ModelType } from "../../common/constants";
import { TableMeta } from "../../common/typeDef";
import { MongoConnection } from "../../service/connect/mongoConnection";
import { ConnectionManager } from "../../service/connectionManager";
import { MongoClient } from "mongodb";
import { TreeItemCollapsibleState } from "vscode";
import { TableNode } from "../main/tableNode";

export class MongoTableNode extends TableNode {
    contextValue = ModelType.MONGO_TABLE;
    collapsibleState=TreeItemCollapsibleState.None;
    public async getChildren() {
        return [];
    }


    public async getClient(): Promise<MongoClient> {
        const redis = (await ConnectionManager.getConnection(this)) as MongoConnection
        return new Promise(res => { redis.run(res) })
    }


}