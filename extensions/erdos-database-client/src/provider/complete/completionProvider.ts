import * as vscode from "vscode";
import { Console } from "../../common/console";
import { ColumnChain } from "./chain/columnChain";
import { DDLChain } from "./chain/ddlChain";
import { DMLChain } from "./chain/dmlChain";
import { KeywordChain } from "./chain/keywordChain";
import { TableChain } from "./chain/tableChain";
import { TableDetecherChain } from "./chain/tableDetecherChain";
import { ComplectionContext } from "./complectionContext";

export class CompletionProvider implements vscode.CompletionItemProvider {

    /**
     * The chain is orderly
     * @returns 
     */
    private completeChain() {
        return [
            new DDLChain(),
            new DMLChain(),
            new TableChain(),
            new ColumnChain(),
            new TableDetecherChain(),
            new KeywordChain(),
        ];
    }

    /**
     * Main function
     * @param document
     * @param position
     */
    public async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {

        const context = ComplectionContext.build(document, position);
        let completionItemList = [];
        for (const chain of this.completeChain()) {
            try {
                const tempComplection = await chain.getComplection(context);
                if (tempComplection != null) {
                    completionItemList = completionItemList.concat(tempComplection);
                    if (chain.stop()) {
                        break;
                    }
                }
            } catch (err) {
                Console.log(err)
            }
        }

        return completionItemList;
    }

    public resolveCompletionItem?(item: vscode.CompletionItem): vscode.ProviderResult<vscode.CompletionItem> {

        return item;
    }

}
