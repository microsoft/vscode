import { FileManager, FileModel } from "../../common/filesManager";
import * as vscode from "vscode";
import { ThemeIcon, TreeItem } from "vscode";

export class HistoryNode extends TreeItem {
    public iconPath = new ThemeIcon("history")
    constructor(public sql: string, public date: string, public costTime: number) {
        super(sql.replace("\n"," "))
        this.tooltip = `Date: ${date}`
        this.description = `${costTime}ms`
        this.command = {
            command: "mysql.history.view",
            title: "View History",
            arguments: [this, true],
        }
    }

    public async view() {
        const content = `/* ${this.date} [${this.costTime} ms] */\n${this.sql}`;
        const sqlDocument = await vscode.workspace.openTextDocument(await FileManager.record(`history_view.sql`, content, FileModel.WRITE))
        await vscode.window.showTextDocument(sqlDocument);
    }

}