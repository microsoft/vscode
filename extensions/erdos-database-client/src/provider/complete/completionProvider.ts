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

        console.log(`[CompletionProvider] Starting completion for document: ${document.uri.toString()}, position: ${position.line}:${position.character}`);
        console.log(`[CompletionProvider] Document text length: ${document.getText().length}, language: ${document.languageId}`);
        
        const context = ComplectionContext.build(document, position);
        console.log(`[CompletionProvider] Built context: ${JSON.stringify(context, null, 2)}`);
        
        let completionItemList = [];
        for (const chain of this.completeChain()) {
            console.log(`[CompletionProvider] Processing chain: ${chain.constructor.name}`);
            try {
                const tempComplection = await chain.getComplection(context);
                if (tempComplection != null) {
                    console.log(`[CompletionProvider] Chain ${chain.constructor.name} returned ${tempComplection.length} items`);
                    completionItemList = completionItemList.concat(tempComplection);
                    if (chain.stop()) {
                        console.log(`[CompletionProvider] Chain ${chain.constructor.name} requested stop`);
                        break;
                    }
                }
            } catch (err) {
                console.log(`[CompletionProvider] Error in chain ${chain.constructor.name}: ${err}`);
                Console.log(err)
            }
        }

        return completionItemList;
    }

    public resolveCompletionItem?(item: vscode.CompletionItem): vscode.ProviderResult<vscode.CompletionItem> {

        return item;
    }

}
