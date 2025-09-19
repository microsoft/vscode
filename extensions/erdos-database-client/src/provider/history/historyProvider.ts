import { CacheKey } from "../../common/constants";
import { Global } from "../../common/global";
import { GlobalState } from "../../common/state";
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
        let globalHistories = GlobalState.get<Array<any>>(CacheKey.GLOBAL_HISTORY, []);
        return globalHistories.map(historyData => {
            return new HistoryNode(historyData.sql, historyData.date, historyData.costTime)
        });
    }
    getParent?(element: HistoryNode): vscode.ProviderResult<HistoryNode> {
        return null;
    }

    public static recordHistory(historyNode: HistoryNode) {
        let globalHistories = GlobalState.get<Array<any>>(CacheKey.GLOBAL_HISTORY, []);
        
        // Store only the essential data to avoid circular references
        const historyData = {
            sql: historyNode.sql,
            date: historyNode.date,
            costTime: historyNode.costTime
        };
        
        globalHistories.unshift(historyData);
        if (globalHistories.length > 100) {
            globalHistories = globalHistories.slice(0, 100); // Keep only first 100 items
        }
        GlobalState.update(CacheKey.GLOBAL_HISTORY, globalHistories);
        HistoryProvider._onDidChangeTreeData.fire(null)
    }

    public refresh(): void {
        HistoryProvider._onDidChangeTreeData.fire(null);
    }

    public static clearHistory(): void {
        GlobalState.update(CacheKey.GLOBAL_HISTORY, []);
        HistoryProvider._onDidChangeTreeData.fire(null);
    }

    public static deleteHistory(historyNode: HistoryNode) {
        let globalHistories = GlobalState.get<Array<any>>(CacheKey.GLOBAL_HISTORY, []);
        globalHistories = globalHistories.filter(historyData => 
            !(historyData.sql === historyNode.sql && historyData.date === historyNode.date)
        );
        GlobalState.update(CacheKey.GLOBAL_HISTORY, globalHistories);
        HistoryProvider._onDidChangeTreeData.fire(null);
    }

}