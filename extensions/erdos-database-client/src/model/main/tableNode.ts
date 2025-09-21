import { ColumnMeta, TableMeta } from "../../common/typeDef";
import { Hanlder, ViewManager } from "../../common/viewManager";
import * as vscode from "vscode";
import { ConfigKey, DatabaseType, ModelType, Template } from "../../common/constants";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ConnectionManager } from "../../service/connectionManager";
import { QueryUnit } from "../../service/queryUnit";
import { DesignView } from "../../webview/designView";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { ColumnNode } from "../other/columnNode";
import { InfoNode } from "../other/infoNode";

export class TableNode extends Node implements CopyAble {
    private designView: DesignView | undefined;

    public iconPath = new vscode.ThemeIcon("split-horizontal")
    public contextValue: string = ModelType.TABLE;
    public table: string;

    constructor(readonly meta: TableMeta, readonly parent: Node) {
        super(`${meta.name}`)
        this.table = meta.name
        this.description = `${meta.comment || ''} ${(meta.rows != null) ? `Rows ${meta.rows}` : ''}`
        if (Util.supportColorIcon) {
            // this.iconPath=new vscode.ThemeIcon("split-horizontal",new vscode.ThemeColor("problemsWarningIcon.foreground"))
        }
        this.init(parent)
        this.tooltip = this.getToolTipe(meta)
        this.cacheSelf()
        this.command = {
            command: "mysql.table.find",
            title: "Run Select Statement",
            arguments: [this, true],
        }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let columnNodes = this.getChildCache();
        if (columnNodes && !isRresh) {
            return columnNodes;
        }
        return this.execute<ColumnMeta[]>(this.dialect.showColumns(this.schema, this.table))
            .then((columns) => {
                columnNodes = columns.map<ColumnNode>((column, index) => {
                    return new ColumnNode(this.table, column, this, index);
                });
                this.setChildCache(columnNodes)
                return columnNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public addColumnTemplate() {
        QueryUnit.showSQLTextDocument(this, this.dialect.addColumn(this.wrap(this.table)), Template.alter);
    }


    public async showSource(open = true) {
        let sql: string;
        if (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.SQLITE) {
            const sourceResule = await this.execute<any[]>(this.dialect.showTableSource(this.schema, this.table))
            sql = sourceResule[0]['Create Table'];
            if (this.dbType == DatabaseType.SQLITE) {
                sql = sql.replace(/\\n/g, '\n');
            }
        } else {
            const childs = await this.getChildren();
            sql = `CREATE TABLE ${this.table}(\n`
            for (let i = 0; i < childs.length; i++) {
                const child: ColumnNode = childs[i] as ColumnNode;
                if (i == childs.length - 1) {
                    sql += `    ${child.column.name} ${child.type}${child.isPrimaryKey ? ' PRIMARY KEY' : ''}\n`
                } else {
                    sql += `    ${child.column.name} ${child.type}${child.isPrimaryKey ? ' PRIMARY KEY' : ''},\n`
                }
            }
            sql += ")"
        }
        if (open) {
            QueryUnit.showSQLTextDocument(this, sql);
        }
        return sql;
    }

    public dropTable() {

        Util.confirm(`Are you sure you want to drop table ${this.table} ? `, async () => {
            this.execute(`DROP TABLE ${this.wrap(this.table)}`).then(() => {
                this.parent.setChildCache(null)
                DbTreeDataProvider.refresh(this.parent);
                // Drop table success - silently
            });
        })

    }


    public truncateTable() {

        Util.confirm(`Are you sure you want to clear table ${this.table} all data ?`, async () => {
            const truncateSql = this.dbType == DatabaseType.SQLITE ? `DELETE FROM ${this.wrap(this.table)}` : `truncate table ${this.wrap(this.table)}`;
            this.execute(truncateSql).then(() => {
                // Clear table success - silently
            });
        })

    }



    public designTable() {
        if (!this.designView) {
            this.designView = new DesignView(Global.context.extensionUri);
            this.designView.setTable(this.table, this.schema);
        } else {
            this.designView.reveal();
        }
    }

    public async openInNew() {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.schema), this.wrap(this.table), pageSize);
        QueryUnit.runQuery(sql, this, { viewId: new Date().getTime(), recordHistory: true });
        ConnectionManager.changeActive(this)
    }

    public async openTable() {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.schema), this.wrap(this.table), pageSize);
        QueryUnit.runQuery(sql, this, { recordHistory: true });
        ConnectionManager.changeActive(this)
    }

    public getToolTipe(meta: TableMeta): string {
        if (this.dbType == DatabaseType.MYSQL && meta.data_length) {
            return `AUTO_INCREMENT : ${meta.auto_increment || 'null'}
ROW_FORMAT : ${meta.row_format}
`
        }

        return ''
    }

    public insertSqlTemplate(show: boolean = true): Promise<string> {
        return new Promise((resolve) => {
            this
                .getChildren()
                .then((children: Node[]) => {
                    const childrenNames = children.map((child: any) => "\n    " + this.wrap(child.column.name));
                    const childrenValues = children.map((child: any) => "\n    $" + child.column.name);
                    let sql = `insert into \n  ${this.wrap(this.table)} `;
                    sql += `(${childrenNames.toString().replace(/,/g, ", ")}\n  )\n`;
                    sql += "values\n  ";
                    sql += `(${childrenValues.toString().replace(/,/g, ", ")}\n  );`;
                    if (show) {
                        QueryUnit.showSQLTextDocument(this, sql, Template.table);
                    }
                    resolve(sql)
                });
        })
    }

    public async selectSqlTemplate() {
        const sql = `SELECT * FROM ${Util.wrap(this.table)}`;
        QueryUnit.showSQLTextDocument(this, sql, Template.table);

    }

    public deleteSqlTemplate(): any {
        this
            .getChildren()
            .then((children: Node[]) => {
                const keysNames = children.filter((child: any) => child.column.key).map((child: any) => child.column.name);

                const where = keysNames.map((name: string) => `${this.wrap(name)} = \$${name}`);

                let sql = `delete from \n  ${this.wrap(this.table)} \n`;
                sql += `where \n  ${where.toString().replace(/,/g, "\n  and")}`;
                QueryUnit.showSQLTextDocument(this, sql, Template.table);
            });
    }

    public updateSqlTemplate() {
        this
            .getChildren()
            .then((children: Node[]) => {
                const keysNames = children.filter((child: any) => child.column.key).map((child: any) => child.column.name);
                const childrenNames = children.filter((child: any) => !child.column.key).map((child: any) => child.column.name);

                const sets = childrenNames.map((name: string) => `${name} = ${name}`);
                const where = keysNames.map((name: string) => `${name} = '${name}'`);

                let sql = `update \n  ${this.wrap(this.table)} \nset \n  ${sets.toString().replace(/,/g, ",\n  ")}\n`;
                sql += `where \n  ${where.toString().replace(/,/g, "\n  and ")}`;
                QueryUnit.showSQLTextDocument(this, sql, Template.table);
            });
    }

    public async getMaxPrimary(): Promise<number> {

        // Mock functionality removed


        return Promise.resolve(0)
    }

    public copyName(): void {
        Util.copyToBoard(this.table);
    }


}
