import { Cursor } from "../../common/constants";
import * as vscode from "vscode";
import { QueryUnit } from "../../service/queryUnit";
import { SQLBlock, SQLToken } from "../parser/sqlBlcok";
import { SQLParser } from "../parser/sqlParser";

export interface ComplectionChain {
    getComplection(context: ComplectionContext): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]>;

    stop(): boolean;
}

export class ComplectionContext {

    public currentSql: string;
    public position: vscode.Position;
    public previousToken: SQLToken;
    public currentToken: SQLToken;
    public tokens: SQLToken[];
    public sqlBlock: SQLBlock;

    public static build(document: vscode.TextDocument, position: vscode.Position): ComplectionContext {

        const context = new ComplectionContext();
        const currentSql = this.obtainCursorSql(document, position).trim();
        context.position = position;
        context.sqlBlock = SQLParser.parseBlockSingle(document, position)
        context.tokens = context.sqlBlock.tokens
        for (let i = 0; i < context.tokens.length; i++) {
            const token = context.tokens[i];
            if (token.range.contains(position) || token.range.start.isAfter(position)) {
                context.currentToken = token;
                if (context.tokens[i - 1]) {
                    context.previousToken = context.tokens[i - 1];
                }
                break;
            }
        }
        if (!context.previousToken && context.tokens.length > 0) {
            context.previousToken = context.tokens[context.tokens.length - 1]
        }
        if (!context.sqlBlock.sql.trim()) { return context; }

        context.currentSql = currentSql.trim();
        return context;
    }

    public static obtainCursorSql(document: vscode.TextDocument, current: vscode.Position, content?: string, delimiter?: string) {
        if (!content) { content = document.getText(new vscode.Range(new vscode.Position(0, 0), current)); }
        if (delimiter) {
            content = content.replace(new RegExp(delimiter, 'g'), ";")
        }
        const sqlList = content.match(/(?:[^;"']+|["'][^"']*["'])+/g);
        if (!sqlList) return "";
        if (sqlList.length == 1) return sqlList[0];

        const trimSqlList = []
        const docCursor = document.getText(Cursor.getRangeStartTo(current)).length;
        let index = 0;
        for (let i = 0; i < sqlList.length; i++) {
            const sql = sqlList[i];
            const trimSql = sql.trim();
            if (trimSql) {
                trimSqlList.push(trimSql)
            }
            index += (sql.length + 1);
            if (docCursor < index) {
                if (!trimSql && sqlList.length > 1) { return sqlList[i - 1]; }
                return trimSql;
            }
        }

        return trimSqlList[trimSqlList.length - 1];
    }

}
