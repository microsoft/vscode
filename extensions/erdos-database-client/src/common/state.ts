import { Global } from "./global";
import * as vscode from "vscode";

export class GlobalState {
    public static update(key: string, value: any): Thenable<void> {
        key = getKey(key)
        return Global.context.globalState.update(key, value)
    }

    public static get<T>(key: string, defaultValue?: T): T {
        key = getKey(key)
        return Global.context.globalState.get(key, defaultValue)
    }
}

export class WorkState {

    public static update(key: string, value: any): Thenable<void> {
        key = getKey(key)
        return Global.context.workspaceState.update(key, value)
    }

    public static get<T>(key: string, defaultValue?: T): T {
        key = getKey(key)
        return Global.context.workspaceState.get(key, defaultValue)
    }

}
export function getKey(key: string): string {

    if (vscode.env.remoteName == "ssh-remote" && key.indexOf("ssh-remote") == -1) {
        return key + "ssh-remote";
    }

    return key;
}

