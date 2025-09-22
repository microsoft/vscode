import * as vscode from "vscode";
import { ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";


export class ProcedureNode extends Node {

    public contextValue: string = ModelType.PROCEDURE;
    public iconPath =new vscode.ThemeIcon("gear")
    constructor(readonly name: string, readonly parent: Node) {
        super(name)
        this.init(parent)
        this.command = {
            command: "database.show.procedure",
            title: "Show Procedure Create Source",
            arguments: [this, true]
        }
    }

    public async showSource() {
        this.execute<any[]>(this.dialect.showProcedureSource(this.schema, this.name))
            .then((procedDtails) => {
                const procedDtail = procedDtails[0]
                QueryUnit.showSQLTextDocument(this, `DROP PROCEDURE IF EXISTS ${this.name};\n${procedDtail['Create Procedure']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {

        Util.confirm(`Are you sure you want to drop procedure ${this.name} ? `, async () => {
            this.execute(`DROP procedure ${this.wrap(this.name)}`).then(() => {
                this.parent.setChildCache(null)
                DbTreeDataProvider.refresh(this.parent)
            })
        })

    }

}
