import { Constants, ModelType } from "../../common/constants";
import { FileManager } from "../../common/filesManager";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { QueryNode } from "./queryNode";

export class QueryGroup extends Node {
    public contextValue = ModelType.QUERY_GROUP;
    public iconPath = new vscode.ThemeIcon("code")
    private storePath: string;
    constructor(readonly parent: Node) {
        super("Query")
        this.init(parent)
        this.storePath = `${FileManager.storagePath}/query/${this.getConnectId({ withSchema: true })}`;
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        const dirResult = this.readdir(this.storePath);
        const queries = dirResult && dirResult.map(fileName => new QueryNode(fileName.replace(/\.[^/.]+$/, ""), this));
        if (!queries || queries.length == 0) {
            return [new InfoNode("There is no saved query.")]
        }
        return queries
    }

    readdir(path: string): string[] {
        try {
            return readdirSync(path)
        } catch (error) {
            return null;
        }
    }

    public add() {
        if (!existsSync(this.storePath)) {
            mkdirSync(this.storePath, { recursive: true });
        }
        vscode.window.showInputBox({ placeHolder: "queryName" }).then(res => {
            if (res) {
                const sqlPath = `${this.storePath}/${res}.sql`
                writeFileSync(sqlPath, '')
                DbTreeDataProvider.refresh(this)
            }
        })
    }

}