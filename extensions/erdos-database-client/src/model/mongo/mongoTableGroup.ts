import { ModelType } from "../../common/constants";
import { TableMeta } from "../../common/typeDef";
import { ThemeIcon } from "vscode";
import { Node } from "../interface/node";
import { TableNode } from "../main/tableNode";
import { MonggoBaseNode } from "./mongoBaseNode";
import { MongoTableNode } from "./mongoTableNode";

export class MongoTableGroup extends MonggoBaseNode {

    contextValue = ModelType.TABLE_GROUP;
    public iconPath = new ThemeIcon("list-flat")
    constructor(readonly parent: Node) {
        super("COLLECTION")
        this.uid = `${parent.getConnectId()}_${parent.database}_${ModelType.TABLE_GROUP}`;
        this.init(parent)
    }


    public async getChildren() {

        const client = await this.getClient()

        try {
            const tables = await client.db(this.database).listCollections().toArray()

            const tableNodes = tables.map<TableNode>((table) => {
                const mongoNode: TableNode = new MongoTableNode({ name: table.name } as TableMeta, this);
                mongoNode.schema = mongoNode.database
                return mongoNode;
            });
            return tableNodes;
        } catch (error) {
            client.close()
            throw error;
        }
    }


}