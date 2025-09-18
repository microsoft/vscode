import { ThemeIcon } from "vscode";
import { ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { ProcedureNode } from "./procedure";

export class ProcedureGroup extends Node {

    public contextValue = ModelType.PROCEDURE_GROUP
    public iconPath =new ThemeIcon("gear")
    constructor(readonly parent: Node) {
        super("Procedure")
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = this.getChildCache();
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(this.dialect.showProcedures(this.schema))
            .then((tables) => {
                tableNodes = tables.map<Node>((table) => {
                    return new ProcedureNode(table.ROUTINE_NAME, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This schema has no procedure")];
                }
                this.setChildCache(tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.procedureTemplate(), 'create-procedure-template.sql')

    }

}
