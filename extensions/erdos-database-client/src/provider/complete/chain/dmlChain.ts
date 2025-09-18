import { ModelType } from "../../../common/constants";
import * as vscode from "vscode";
import { ComplectionContext } from "../complectionContext";
import { NodeFinder } from "../nodeFinder";
import { BaseChain } from "./baseChain";

export class DMLChain extends BaseChain {

    public async getComplection(context: ComplectionContext) {
        const firstToken = context.tokens[0] && context.tokens[0].content && context.tokens[0].content.toLowerCase()
        if (!firstToken || ['select', 'insert', 'update', 'delete', 'call'].indexOf(firstToken) == -1) {
            return null;
        }
        const previous = context.previousToken && context.previousToken.content && context.previousToken.content.toLowerCase()
        if (previous && previous.match(/into|from|update|table|join/i)) {
            this.requestStop()
            return (await this.findNodes(null, null, vscode.CompletionItemKind.Folder, ModelType.SCHEMA)).concat(
                await this.findNodes(null, null, vscode.CompletionItemKind.Function, ModelType.TABLE, ModelType.VIEW, ModelType.FUNCTION)
            );
        }

        if (context.currentToken && context.currentToken.content === ".") {
            return;
        }

        switch (firstToken) {
            case 'select':
                return this.functionList;
            case 'update':
                return this.functionList;
            case 'delete':
                // delete from [table] where $1
                if (context.sqlBlock.tokens.find(token => token.content == 'where' && context.position.isAfter(token.range.end))) {
                    return this.functionList;
                }
            case 'call':
                return (await this.findNodes(null, null, vscode.CompletionItemKind.Folder, ModelType.SCHEMA)).concat(
                    await this.findNodes(null, null, vscode.CompletionItemKind.Function, ModelType.PROCEDURE)
                );
            case 'insert':
                if (firstToken == 'insert') {
                    // insert into [table] ($1)
                    if (context.sqlBlock.scopes.find(scope => scope.contains(context.position))) {
                        const tables = context.sqlBlock.tokens.filter(token => token.type == 'table');
                        if (tables.length == 0) return null;
                        this.requestStop()
                        return Promise.all(tables.map(async tableToken => {
                            return this.nodeToComplection(await NodeFinder.findNodes(null, tableToken.content, ModelType.COLUMN), vscode.CompletionItemKind.Field)
                        })).then(nodes => nodes.flat())
                    }
                    // insert into [table] ([columns]) values ($1)
                    if (context.sqlBlock.tokens.find(token => token.content == 'values' && context.position.isAfter(token.range.end))) {
                        this.requestStop()
                        return this.functionList;
                    }
                }
                break;
        }

        return null;
    }

}

