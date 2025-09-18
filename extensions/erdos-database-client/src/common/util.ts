
import { join } from "path";
import * as vscode from "vscode";
import { Position, TextDocument } from "vscode";
import { Confirm, Constants, DatabaseType } from "./constants";
import { exec } from "child_process";
import { wrapByDb } from "./wrapper.js";
import { GlobalState } from "./state";
import { Console } from "./console";

export class Util {

    public static getTableName(sql: string, tablePattern: string): string {

        const tableMatch = new RegExp(tablePattern, 'img').exec(sql)
        if (tableMatch) {
            return tableMatch[0].replace(/\bfrom|join|update|into\b/i, "") // remove keyword
                .replace(/`|"|'/g, "")// trim tableName
                .replace(/^\s*\[(.+)\]$/, "$1") // trim tableName again
                .trim()
        }

        return null;
    }

    /**
     * wrap origin with ` if is unusual identifier
     * @param origin any string
     */
    public static wrap(origin: string, databaseType?: DatabaseType) {
        return wrapByDb(origin, databaseType)
    }

    public static trim(origin: any): any {

        if (origin) {
            const originType = typeof origin
            if (originType == "string") {
                return origin.trim()
            }
            if (originType == "object") {
                for (const key in origin) {
                    origin[key] = this.trim(origin[key])
                }
            }
        }

        return origin
    }

    /**
     * trim array, got from SO.
     * @param origin origin array
     * @param attr duplicate check attribute
     */
    public static trimArray<T>(origin: T[], attr: string): T[] {
        const seen = new Set();
        return origin.filter((item) => {
            const temp = item[attr];
            return seen.has(temp) ? false : seen.add(temp);
        });
    }

    public static getDocumentLastPosition(document: TextDocument): Position {
        const lastLine = document.lineCount - 1;
        return new Position(lastLine, document.lineAt(lastLine).text.length);
    }

    public static copyToBoard(content: string) {
        vscode.env.clipboard.writeText(content)
    }

    public static confirm(placeHolder: string, callback: () => void) {
        vscode.window.showQuickPick([Confirm.YES, Confirm.NO], { placeHolder }).then((res) => {
            if (res == Confirm.YES) {
                callback()
            }
        })
    }

    public static async(callback: (res, rej) => void): Promise<any> {
        return new Promise((resolve, reject) => callback(resolve, reject))
    }

    public static process(title: string, task: (done) => void) {
        vscode.window.withProgress({ title, location: vscode.ProgressLocation.Notification }, () => {
            return new Promise(async (resolve) => {
                try {
                    task(resolve)
                } catch (error) {
                    vscode.window.showErrorMessage(error.message)
                }
            })
        })
    }

    public static getExtPath(...paths: string[]) {

        return vscode.Uri.file(join(Constants.RES_PATH, ...paths))
    }

    public static getStore(key: string): any {
        return GlobalState.get(key);
    }
    public static store(key: string, object: any) {
        GlobalState.update(key, object)
    }

    public static is(object: any, type: string): boolean {
        if (!object) return false;
        return object.__proto__.constructor.name == type;
    }


    private static supportColor: boolean = null;
    /**
     * Check current vscode treeitem support ref theme icon with color.
     */
    public static supportColorIcon(): boolean {

        if (this.supportColor === null) {
            try {
                new vscode.ThemeIcon("key", new vscode.ThemeColor('charts.yellow'));
                this.supportColor = true;
            } catch (error) {
                this.supportColor = false;
            }
        }

        return this.supportColor;
    }

    public static execute(command: string): Promise<void> {
        return new Promise((res, rej) => {
            let hasTrigger = false;
            exec(command, (err, stdout, stderr) => {
                if (hasTrigger) return;
                if (err) {
                    rej(err)
                } else if (stderr) {
                    rej(stderr)
                } else if(!hasTrigger){
                    hasTrigger = true;
                    res(null)
                }
            }).on("exit", (code) => {
                if (!hasTrigger && code===0){
                    hasTrigger = true;
                    res(null)
                };
            })
        })
    }

}
