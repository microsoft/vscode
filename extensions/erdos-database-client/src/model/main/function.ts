import * as vscode from "vscode";
import { ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";

export class FunctionNode extends Node {

    public contextValue: string = ModelType.FUNCTION;
    public iconPath = new vscode.ThemeIcon("symbol-function")
    constructor(readonly name: string, readonly parent: Node) {
        super(name)
        this.init(parent)
        this.command = {
            command: "mysql.show.function",
            title: "Show Function Create Source",
            arguments: [this, true],
        }
    }

    public async showSource() {
        this.execute<any[]>( this.dialect.showFunctionSource(this.schema,this.name))
            .then((procedDtails) => {
                const procedDtail = procedDtails[0];
                QueryUnit.showSQLTextDocument(this,`DROP FUNCTION IF EXISTS ${this.name};\n${procedDtail['Create Function']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {

        Util.confirm(`Are you sure you want to drop function ${this.name} ?`, async () => {
            this.execute( `DROP function ${this.wrap(this.name)}`).then(() => {
                this.parent.setChildCache(null)
                DbTreeDataProvider.refresh(this.parent);
                vscode.window.showInformationMessage(`Drop function ${this.name} success!`);
            });
        })

    }

}
