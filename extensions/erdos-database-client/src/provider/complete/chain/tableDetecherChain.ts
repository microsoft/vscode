import * as vscode from "vscode";
import { ComplectionChain, ComplectionContext } from "../complectionContext";
import { Pattern } from "../../../common/constants";

export class TableDetecherChain implements ComplectionChain {

    public getComplection(context: ComplectionContext): vscode.CompletionItem[] | Promise<vscode.CompletionItem[]> {

        const tableMatch = new RegExp(Pattern.TABLE_PATTERN + " *((\\w)*)?", 'ig');
        if (context.previousToken && context.previousToken.content && context.previousToken.content.match(/\b(select|HAVING|\(|on|where|and|,|=|<|>)\b/ig)
            || (context.currentToken && context.currentToken.content && context.currentToken.content.match(/(<|>|,|=)$/))
        ) {
            const completionItem = [];
            let result = tableMatch.exec(context.sqlBlock.sql);
            while (result != null) {
                const alias = result[4];
                if (alias) {
                    completionItem.push(new vscode.CompletionItem(alias, vscode.CompletionItemKind.Interface));
                } else {
                    const tableName = result[2].replace(/\w*?\./, "");
                    completionItem.push(new vscode.CompletionItem(tableName, vscode.CompletionItemKind.Interface));
                }
                result = tableMatch.exec(context.sqlBlock.sql);
            }

            return completionItem;
        }

        return null;
    }

    public stop(): boolean {
        return true;
    }



}