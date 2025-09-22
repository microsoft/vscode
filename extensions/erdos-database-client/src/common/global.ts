"use strict";
import * as vscode from "vscode";
import { Node } from "../model/interface/node";
import { Constants } from "./constants";
import { join } from "path";

export class Global {

    public static context: vscode.ExtensionContext;
    private static mysqlStatusBarItem: vscode.StatusBarItem;

    public static getExtPath(...paths: string[]) {
        return join(Global.context.extensionPath, ...paths)
    }

    public static updateStatusBarItems(activeConnection: Node) {
        if (Global.mysqlStatusBarItem) {
            Global.mysqlStatusBarItem.text = Global.getStatusBarItemText(activeConnection);
        } else {
            Global.mysqlStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
            Global.mysqlStatusBarItem.command='database.db.active'
            Global.mysqlStatusBarItem.text = Global.getStatusBarItemText(activeConnection);
            Global.mysqlStatusBarItem.show();
        }
    }

    private static getStatusBarItemText(activeConnection: Node): string {
        return `$(server) ${activeConnection.getHost()}` + (activeConnection.schema ? ` $(schema) ${activeConnection.schema}` : "");
    }

    /**
     * get configuration from vscode setting.
     * @param key config key
     */
    public static getConfig<T>(key: string,defaultValue?:any): T {
        return vscode.workspace.getConfiguration(Constants.CONFIG_PREFIX).get<T>(key,defaultValue);
    }

    /**
     * update mysql config for vscode.
     * @param name  config name
     * @param value config value 
     */
    public static async updateConfig(name: string, value: any) {
        await vscode.workspace.getConfiguration(Constants.CONFIG_PREFIX).update(name, value, true)
    }

}