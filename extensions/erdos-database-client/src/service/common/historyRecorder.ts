import { HistoryNode } from "../../provider/history/historyNode";
import { HistoryProvider } from "../../provider/history/historyProvider";
import { TextEditor, Selection } from "vscode";
import { FileManager } from "../../common/filesManager";
export class HistoryRecorder {

    private preSql:string;

    public showHistory() {
        FileManager.show('history.sql').then((textEditor: TextEditor) => {
            const lineCount = textEditor.document.lineCount;
            const range = textEditor.document.lineAt(lineCount - 1).range;
            textEditor.selection = new Selection(range.end, range.end);
            textEditor.revealRange(range);
        })
    }

    public recordHistory(sql: string, costTime: number) {
        if (!sql || sql==this.preSql) { return; }
        this.preSql=sql;
        FileManager.record('history.sql', `/* ${this.getNowDate()} [${costTime} ms] */ ${sql.replace(/[\r\n]/g, " ")}\n`);
        // HistoryProvider.recordHistory(new HistoryNode(sql,this.getNowDate(),costTime))
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

    public pad(n: any, width: number, z?: any): string {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

}