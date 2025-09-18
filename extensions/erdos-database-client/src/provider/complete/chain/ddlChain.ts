import { ModelType } from "../../../common/constants";
import * as vscode from "vscode";
import { CompletionItem } from "vscode";
import { ComplectionContext } from "../complectionContext";
import { BaseChain } from "./baseChain";

export class DDLChain extends BaseChain {

    private keywordComplectionItems: vscode.CompletionItem[] = this.strToComplection(["Table", "Procedure", "View", "Function", "Trigger"])
    private typeList: vscode.CompletionItem[] = this.strToComplection(["INTEGER", "CHAR", "VARCHAR", "DECIMAL", "SMALLINT", "TINYINT", "MEDIUMINT", "BIGINT", "CHARACTER",
        "NUMERIC", "BIT", "INT", "FLOAT", "DOUBLE", "TEXT", "SET", "BLOB", "TIMESTAMP", "DATE", "TIME", "YEAR", "DATETIME"], vscode.CompletionItemKind.Variable);

    async getComplection(complectionContext: ComplectionContext): Promise<CompletionItem[]> {

        const firstToken = complectionContext.tokens[0] && complectionContext.tokens[0].content && complectionContext.tokens[0].content.toLowerCase()
        if (!firstToken) return []
        const secondToken = complectionContext.tokens[1] && complectionContext.tokens[1].content && complectionContext.tokens[1].content.toLowerCase()

        const isCreate = firstToken == 'create';
        const isAlter = firstToken == 'alter';
        const isDrop = firstToken == 'drop';
        if (['create', 'alter', 'drop'].indexOf(firstToken) == -1) {
            return []
        }

        this.needStop = true;
        if (!secondToken) {
            return this.keywordComplectionItems;
        }

        if (isCreate) {
            switch (secondToken) {
                case 'table':
                    return this.strToComplection(["AUTO_INCREMENT", "NULL", "NOT", "PRIMARY", "CURRENT_TIME", "REFERENCES",
                        "DEFAULT", "COMMENT", "UNIQUE", "KEY", "FOREIGN", "CASCADE", "RESTRICT", "UNSIGNED", "CURRENT_TIMESTAMP"]).concat(this.typeList)
            }
        } else {
            let modelType: ModelType;
            switch (secondToken) {
                case 'table':
                    modelType = ModelType.TABLE;
                    break;
                case 'procedure':
                    modelType = ModelType.PROCEDURE;
                    break;
                case 'function':
                    modelType = ModelType.FUNCTION;
                    break;
                case 'view':
                    modelType = ModelType.VIEW;
                    break;
                case 'trigger':
                    modelType = ModelType.TRIGGER;
                    break;
            }
            if (modelType) {
                if (isAlter) {
                    return (await this.findNodes(null, null, vscode.CompletionItemKind.Function, modelType)).concat(
                        await this.findNodes(null, null, vscode.CompletionItemKind.Folder, ModelType.SCHEMA)
                    ).concat(this.typeList)
                } else {
                    return (await this.findNodes(null, null, vscode.CompletionItemKind.Function, modelType)).concat(
                        await this.findNodes(null, null, vscode.CompletionItemKind.Folder, ModelType.SCHEMA)
                    )
                }
            }
        }


        return [];
    }

}