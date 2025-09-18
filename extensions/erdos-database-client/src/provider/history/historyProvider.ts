import { CacheKey } from "../../common/constants";
import { Global } from "../../common/global";
import { GlobalState } from "../../common/state";
import { NodeUtil } from "../../model/nodeUtil";
import * as vscode from "vscode";
import { HistoryNode } from "./historyNode";

export class HistoryProvider implements vscode.TreeDataProvider<HistoryNode>{

    public static _onDidChangeTreeData: vscode.EventEmitter<HistoryNode> = new vscode.EventEmitter<HistoryNode>();
    public readonly onDidChangeTreeData: vscode.Event<HistoryNode> = HistoryProvider._onDidChangeTreeData.event;
    constructor(protected context: vscode.ExtensionContext) {
    }

    getTreeItem(element: HistoryNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    getChildren(element?: HistoryNode): vscode.ProviderResult<HistoryNode[]> {
        let globalHistories = GlobalState.get<Array<HistoryNode>>(CacheKey.GLOBAL_HISTORY, []);
        return globalHistories.map(history => {
            return new HistoryNode(history.sql, history.date, history.costTime)
        })
    }
    getParent?(element: HistoryNode): vscode.ProviderResult<HistoryNode> {
        return null;
    }

    public static recordHistory(historyNode: HistoryNode) {
        let glboalHistoryies = GlobalState.get<Array<HistoryNode>>(CacheKey.GLOBAL_HISTORY, []);
        glboalHistoryies.unshift(historyNode)
        if (glboalHistoryies.length > 100) {
            glboalHistoryies = glboalHistoryies.splice(-1, 1)
        }
        GlobalState.update(CacheKey.GLOBAL_HISTORY, NodeUtil.removeParent(glboalHistoryies));
        HistoryProvider._onDidChangeTreeData.fire(null)
    }

}