import { HistoryNode } from "../../provider/history/historyNode";
import { HistoryProvider } from "../../provider/history/historyProvider";
import { TextEditor, Selection } from "vscode";
import * as vscode from "vscode";
import { FileManager } from "../../common/filesManager";
export class HistoryRecorder {

    private preSql:string;

    public showHistory() {
        const historyPath = FileManager.getPath('history.sql');
        
        // Check if file exists and show message if empty
        const fs = require('fs');
        if (fs.existsSync(historyPath)) {
            const content = fs.readFileSync(historyPath, 'utf8');
            if (content.length < 10) {
                vscode.window.showInformationMessage('No query history yet. Execute some SQL queries to see them here.');
            }
        } else {
            vscode.window.showInformationMessage('No query history yet. Execute some SQL queries to see them here.');
        }
        
        // Wait a bit for the file operations to complete, then show the file
        setTimeout(() => {
            FileManager.show('history.sql').then((textEditor: TextEditor) => {
                const lineCount = textEditor.document.lineCount;
                const range = textEditor.document.lineAt(lineCount - 1).range;
                textEditor.selection = new Selection(range.end, range.end);
                textEditor.revealRange(range);
            });
        }, 500);
    }

    public recordHistory(sql: string, costTime: number) {
        if (!sql || sql==this.preSql) { 
            return; 
        }
        this.preSql=sql;
        
        const historyEntry = `/* ${this.getNowDate()} [${costTime} ms] */\n${sql}\n\n`;
        
        // Keep file-based recording for backup with improved format
        FileManager.record('history.sql', historyEntry);
        
        // Enable tree-based recording
        HistoryProvider.recordHistory(new HistoryNode(sql, this.getNowDate(), costTime));
    }

    private getNowDate(): string {
        const date = new Date();
        let month: string | number = date.getMonth() + 1;
        let strDate: string | number = date.getDate();

        if (month <= 9) {
            month = "0" + month;
        }

        if (strDate <= 9) {
            strDate = "0" + strDate;
        }

        return date.getFullYear() + "-" + month + "-" + strDate + " "
            + this.pad(date.getHours(), 2) + ":" + this.pad(date.getMinutes(), 2) + ":" + this.pad(date.getSeconds(), 2);
    }

    public clearHistory() {
        HistoryProvider.clearHistory();
    }

    public pad(n: any, width: number, z?: any): string {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

}