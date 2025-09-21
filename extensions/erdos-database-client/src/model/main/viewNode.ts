import sqlFormatter from "../../service/format/sqlFormatter";
import * as vscode from "vscode";
import { ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { QueryUnit } from "../../service/queryUnit";
import { TableNode } from "./tableNode";

export class ViewNode extends TableNode {

    public contextValue: string = ModelType.VIEW;

    public async showSource(open = true) {
        const sourceResule = await this.execute<any[]>(this.dialect.showViewSource(this.schema, this.table))
        const sql = `DROP VIEW ${this.table};${sourceResule[0]['Create View']}`
        if(open){
            QueryUnit.showSQLTextDocument(this, sqlFormatter.format(sql));
        }
        return null;
    }

    public drop() {

        Util.confirm(`Are you sure you want to drop view ${this.table} ? `, async () => {
            this.execute(`DROP view ${this.wrap(this.table)}`).then(() => {
                this.parent.setChildCache(null)
                DbTreeDataProvider.refresh(this.parent);
            });
        })

    }

}