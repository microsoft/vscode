import { Constants, ModelType } from "../../common/constants";
import { FileManager } from "../../common/filesManager";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { QueryUnit } from "../../service/queryUnit";
import { readFileSync, renameSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TreeItemCollapsibleState } from "vscode";
import { Node } from "../interface/node";

export class QueryNode extends Node {
    public contextValue = ModelType.QUERY;
    public iconPath = new vscode.ThemeIcon("code")
    constructor(public name: string, readonly parent: Node) {
        super(name)
        this.init(parent)
        this.collapsibleState = TreeItemCollapsibleState.None
        this.command = {
            command: "mysql.query.open",
            title: "Open Query",
            arguments: [this, true],
        }
    }

    public async run() {
        const content = readFileSync(this.getFilePath(),'utf8')
        QueryUnit.runQuery(content, this, { recordHistory: true })
    }

    public async open() {
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(this.getFilePath())
        );
    }

    public async rename() {
        vscode.window.showInputBox({ placeHolder: "Input new name" }).then(newName => {
            if (newName) {
                renameSync(this.getFilePath(), this.getFilePath(newName))
                DbTreeDataProvider.refresh(this.parent)
            }
        })
    }

    private getFilePath(newName?: string): string {
        return `${FileManager.storagePath}/query/${this.getConnectId({ withSchema: true })}/${newName || this.name}.sql`;
    }


}