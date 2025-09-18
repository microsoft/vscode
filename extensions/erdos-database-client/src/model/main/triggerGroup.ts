import { Util } from "../../common/util";
import { ThemeColor, ThemeIcon } from "vscode";
import { ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { TriggerNode } from "./trigger";

export class TriggerGroup extends Node {

    public iconPath = new ThemeIcon("zap");
    public contextValue = ModelType.TRIGGER_GROUP

    constructor(readonly parent: Node) {
        super("Trigger")
        this.init(parent)
        if(Util.supportColorIcon){
            this.iconPath=new ThemeIcon("zap",new ThemeColor("terminal.ansiYellow"))
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = this.getChildCache();
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(this.dialect.showTriggers(this.schema))
            .then((tables) => {
                tableNodes = tables.map<TriggerNode>((table) => {
                    return new TriggerNode(table.TRIGGER_NAME, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This schema has no trigger")];
                }
                this.setChildCache(tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }


    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.triggerTemplate(), 'create-trigger-template.sql')

    }

}
