import { Util } from "../../common/util";
import { ThemeColor, ThemeIcon } from "vscode";
import { ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { TableNode } from "./tableNode";

export class TableGroup extends Node {

    public iconPath=new ThemeIcon("list-flat")
    public contextValue: string = ModelType.TABLE_GROUP;
    constructor(readonly parent: Node) {
        super("Table")
        this.init(parent)
        if(Util.supportColorIcon){
            this.iconPath=new ThemeIcon("list-flat",new ThemeColor("terminal.ansiBlue"))
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = this.getChildCache();
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(this.dialect.showTables(this.schema))
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new TableNode(table, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This schema has no table")];
                }
                this.setChildCache(tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.tableTemplate(), 'create-table-template.sql')

    }
}
