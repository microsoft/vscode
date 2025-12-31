/**
 * SWE Agent History View Provider
 *
 * Provides a tree view of recent SWE operations and their results.
 */

import * as vscode from 'vscode';

interface HistoryItem {
    id: string;
    timestamp: Date;
    operation: string;
    model: string;
    success: boolean;
    input: string;
    output: string;
    tokensUsed: number;
    latencyMs: number;
}

export class SWEHistoryProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryTreeItem | undefined | null | void> =
        new vscode.EventEmitter<HistoryTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _history: HistoryItem[] = [];
    private _maxItems = 50;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addItem(item: Omit<HistoryItem, 'id' | 'timestamp'>): void {
        const newItem: HistoryItem = {
            ...item,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
        };

        this._history.unshift(newItem);

        // Keep only last N items
        if (this._history.length > this._maxItems) {
            this._history = this._history.slice(0, this._maxItems);
        }

        this.refresh();
    }

    clearHistory(): void {
        this._history = [];
        this.refresh();
    }

    getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryTreeItem): Thenable<HistoryTreeItem[]> {
        if (!element) {
            // Root level - show history items grouped by day
            const grouped = this._groupByDay();
            return Promise.resolve(
                Object.keys(grouped).map(date =>
                    new HistoryTreeItem(
                        date,
                        vscode.TreeItemCollapsibleState.Expanded,
                        'date',
                        { date, items: grouped[date] }
                    )
                )
            );
        }

        if (element.contextValue === 'date') {
            // Show items for this date
            const items = element.data?.items || [];
            return Promise.resolve(
                items.map((item: HistoryItem) =>
                    new HistoryTreeItem(
                        `${item.operation} (${item.model})`,
                        vscode.TreeItemCollapsibleState.None,
                        'item',
                        { item }
                    )
                )
            );
        }

        return Promise.resolve([]);
    }

    private _groupByDay(): Record<string, HistoryItem[]> {
        const grouped: Record<string, HistoryItem[]> = {};

        for (const item of this._history) {
            const date = item.timestamp.toLocaleDateString();
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(item);
        }

        return grouped;
    }

    getItem(id: string): HistoryItem | undefined {
        return this._history.find(item => item.id === id);
    }
}

class HistoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly data?: any,
    ) {
        super(label, collapsibleState);

        if (contextValue === 'item' && data?.item) {
            const item = data.item as HistoryItem;
            this.description = `${item.tokensUsed} tokens, ${item.latencyMs}ms`;
            this.tooltip = new vscode.MarkdownString(
                `**${item.operation}** via ${item.model}\n\n` +
                `Input: ${item.input.substring(0, 100)}...\n\n` +
                `Time: ${item.timestamp.toLocaleTimeString()}\n` +
                `Tokens: ${item.tokensUsed}\n` +
                `Latency: ${item.latencyMs}ms`
            );
            this.iconPath = item.success
                ? new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'))
                : new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
        } else if (contextValue === 'date') {
            const count = data?.items?.length || 0;
            this.description = `${count} operations`;
            this.iconPath = new vscode.ThemeIcon('calendar');
        }
    }
}



