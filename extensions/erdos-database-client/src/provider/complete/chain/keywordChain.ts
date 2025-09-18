import * as vscode from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class KeywordChain implements ComplectionChain {

    private keywordList: string[] = ["SCHEMA","JOIN", "AND", "OR", "SELECT", "SET", "UPDATE", "DELETE", "TABLE", "INSERT", "INTO", "VALUES", "FROM", "WHERE", "IS","NULL","DATABASE",
        "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "ALTER", "CREATE", "DROP", "FUNCTION", "CASE", "PROCEDURE", "TRIGGER", "INDEX", "CHANGE", "COLUMN", "BETWEEN","RLIKE",
        "ADD", 'SHOW', "PRIVILEGES", "IDENTIFIED", "VIEW", "CURSOR", "EXPLAIN", "ROLLBACK", "COMMENT", "COMMIT", "BEGIN", "DELIMITER", "CALL", "REPLACE","TEMPORARY",
        "REFERENCES", "USING", "END", "BEFORE", "AFTER", "GRANT", "RETURNS", "SOME", "ANY", "ASC", "DESC", "UNIQUE", "UNION", "ALL", "ON","REGEXP",
        "OUTER", "INNER", "EXEC", "EXISTS", "NOT", "FOREIGN", "FULL", "LIKE", "IN", "PRIMARY", "KEY", "RIGHT", "LEFT", "TRUNCATE", "IGNORE", "DISTINCT","SOURCE"];
    private keywordComplectionItems: vscode.CompletionItem[] = [];

    constructor() {
        this.keywordList.forEach((keyword) => {
            const keywordComplectionItem = new vscode.CompletionItem(keyword);
            keywordComplectionItem.kind = vscode.CompletionItemKind.Keyword;
            this.keywordComplectionItems.push(keywordComplectionItem);
        });

    }

    public getComplection(complectionContext: ComplectionContext): vscode.CompletionItem[] {
        return this.keywordComplectionItems;
    }

    public stop(): boolean {
        return true;
    }
}
