import { Node } from "../../../model/interface/node";
import { TableGroup } from "../../../model/main/tableGroup";
import { ViewGroup } from "../../../model/main/viewGroup";
import * as vscode from "vscode";
import { DatabaseType, ModelType } from "../../../common/constants";
import { TableNode } from "../../../model/main/tableNode";
import { ConnectionManager } from "../../../service/connectionManager";
import { ComplectionChain, ComplectionContext } from "../complectionContext";

export class TableChain implements ComplectionChain {

    public async getComplection(context: ComplectionContext): Promise<vscode.CompletionItem[]> {
        
        const current = context.currentToken && context.currentToken.content
        if (current == ".") {
            const previous = context.previousToken && context.previousToken.content;
            const temp = await this.generateTableComplectionItem(previous);
            if (temp.length > 0) {
                return temp;
            }
        }
        return null;
    }

    public stop(): boolean {
        return true;
    }

    private async generateTableComplectionItem(inputWord?: string): Promise<vscode.CompletionItem[]> {
        const nodeList = await this.getNodeList(inputWord);
        return nodeList.map<vscode.CompletionItem>((tableNode: TableNode) => {
            const completionItem = new vscode.CompletionItem(tableNode.table);
            if (tableNode.description) {
                completionItem.detail = tableNode.description
            }
            if (tableNode.dbType == DatabaseType.MSSQL && tableNode.schema != inputWord) {
                completionItem.insertText = `${tableNode.wrap(tableNode.schema)}.${tableNode.wrap(tableNode.table)}`;
            } else {
                completionItem.insertText = tableNode.wrap(tableNode.table);
            }
            switch (tableNode.contextValue) {
                case ModelType.TABLE:
                    completionItem.kind = vscode.CompletionItemKind.Function;
                    break;
                case ModelType.VIEW:
                    completionItem.kind = vscode.CompletionItemKind.Module;
                    break;
            }
            return completionItem;
        });
    }

    private async getNodeList(inputWord: string) {

        let lcp = ConnectionManager.tryGetConnection();
        if (!lcp) return [];

        // If has input, try find schema of current catalog.
        if (inputWord) {
            const connectcionid = lcp && lcp.getConnectId({ schema: inputWord, withSchema: true });
            lcp = Node.nodeCache[connectcionid]
            if (!lcp) return []
        }

        // Get current schema view and table childrens.
        const groupNodes = await lcp.getChildren();
        let nodeList = []
        for (const groupNode of groupNodes) {
            if (groupNode instanceof TableGroup || groupNode instanceof ViewGroup) {
                nodeList.push(...await groupNode.getChildren());
            }
        }
        return nodeList;
    }

}
