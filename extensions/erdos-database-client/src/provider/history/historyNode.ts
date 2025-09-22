import { FileManager, FileModel } from "../../common/filesManager";
import * as vscode from "vscode";
import { ThemeIcon, TreeItem } from "vscode";

export class HistoryNode extends TreeItem {
    public iconPath = new ThemeIcon("history")
    constructor(public sql: string, public date: string, public costTime: number) {
        // Truncate long SQL for display
        const displaySql = sql.length > 50 
            ? sql.substring(0, 50).replace(/\s+/g, ' ').trim() + '...'
            : sql.replace(/\s+/g, ' ').trim();
        
        super(displaySql);
        
        this.tooltip = `${sql}\n\nExecuted: ${date}\nDuration: ${costTime}ms`;
        this.description = `${costTime}ms`;
        this.contextValue = 'historyItem';
        this.command = {
            command: "database.history.view",
            title: "View History",
            arguments: [this],
        };
    }

    public async view() {
        const content = `-- Query History Entry
-- Executed: ${this.date}
-- Duration: ${this.costTime}ms
-- 
${this.sql}`;
        
        const fileName = `history_${Date.now()}.sql`;
        const sqlDocument = await vscode.workspace.openTextDocument(
            await FileManager.record(fileName, content, FileModel.WRITE)
        );
        await vscode.window.showTextDocument(sqlDocument);
    }

}