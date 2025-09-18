import { Util } from "../../common/util";
import { ThemeColor, ThemeIcon } from "vscode";
import { ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { TableNode } from "./tableNode";
import { ViewNode } from "./viewNode";

export class ViewGroup extends Node {

    public iconPath=new ThemeIcon("menu")
    public contextValue = ModelType.VIEW_GROUP
    constructor(readonly parent: Node) {
        super("View")
        this.init(parent)
        if(Util.supportColorIcon){
            this.iconPath=new ThemeIcon("menu",new ThemeColor("problemsWarningIcon.foreground"))
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = this.getChildCache();
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(
            this.dialect.showViews(this.schema))
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new ViewNode(table, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This schema has no views")];
                }
                this.setChildCache(tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.viewTemplate(), 'create-view-template.sql')

    }

}
