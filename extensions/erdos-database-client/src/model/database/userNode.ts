import * as vscode from "vscode";
import { DatabaseType, ModelType } from "../../common/constants";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { QueryUnit } from "../../service/queryUnit";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";

export class UserNode extends Node implements CopyAble {

    public contextValue = ModelType.USER;
    public iconPath = new vscode.ThemeIcon("person")
    constructor(readonly username: string, readonly host: string, readonly parent: Node) {
        super(username)
        this.init(parent)
        this.command = {
            command: "mysql.user.sql",
            title: "Run User Detail Statement",
            arguments: [this, true],
        }
    }

    public copyName(): void {
        Util.copyToBoard(this.username)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        return [];
    }

    public async selectSqlTemplate() {
        if (this.dbType && this.dbType != DatabaseType.MYSQL) return;
        const sql = `SELECT USER 0USER,HOST 1HOST,Super_priv,Select_priv,Insert_priv,Update_priv,Delete_priv,Create_priv,Drop_priv,Index_priv,Alter_priv FROM mysql.user where user='${this.username.split("@")[0]}';`;
        QueryUnit.runQuery(sql, this, { recordHistory: true });
    }

    public drop() {

        Util.confirm(`Are you sure you want to drop user ${this.username} ?`, async () => {
            this.execute(`DROP user ${this.username}`).then(() => {
                this.parent.setChildCache(null)
                DbTreeDataProvider.refresh(this.parent);
            });
        })
    }

    public grandTemplate() {
        QueryUnit.showSQLTextDocument(this, `GRANT ALL PRIVILEGES ON *.* to '${this.username}'@'%' `.replace(/^\s/, ""));
    }

    public changePasswordTemplate() {
        QueryUnit.showSQLTextDocument(this, `update
    mysql.user
set
    password = PASSWORD("newPassword")
where
    User = '${this.username}';
FLUSH PRIVILEGES;
-- since mysql version 5.7, password column need change to authentication_string=PASSWORD("test")`
            .replace(/^\s/, ""));
    }

}
