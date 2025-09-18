import * as vscode from "vscode";
import { DatabaseType, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";

export class TriggerNode extends Node {

    public contextValue: string = ModelType.TRIGGER;
    public iconPath = new vscode.ThemeIcon("zap");
    constructor(readonly name: string, readonly parent: Node) {
        super(name)
        this.init(parent)
        this.command = {
            command: "mysql.show.trigger",
            title: "Show Trigger Create Source",
            arguments: [this, true]
        }
    }

    public async showSource() {
        this.execute(this.dialect.showTriggerSource(this.schema, this.name))
            .then((procedDtails) => {
                const procedDtail = procedDtails[0]
                QueryUnit.showSQLTextDocument(this, `${this.dialect.dropTriggerTemplate(this.wrap(this.name))};\n${procedDtail['SQL Original Statement']}`);
            });
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }


    public drop() {
        if (this.dbType == DatabaseType.PG) {
            vscode.window.showErrorMessage("This extension not support drop postgresql trigger.")
            return;
        }
        Util.confirm(`Are you sure you want to drop trigger ${this.name} ?`, async () => {
            this.execute(this.dialect.dropTriggerTemplate(this.wrap(this.name))).then(() => {
                this.parent.setChildCache(null)
                DbTreeDataProvider.refresh(this.parent)
                vscode.window.showInformationMessage(`Drop trigger ${this.name} success!`)
            })
        })

    }

}
