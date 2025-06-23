// src/displayedSignalsProvider.ts
// Tree data provider for displayed signals

import * as vscode from 'vscode';
import { WaveformDocument } from './waveformEditorProvider';

export class DisplayedSignalsProvider implements vscode.TreeDataProvider<DisplayedSignalItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DisplayedSignalItem | undefined | null | void> = new vscode.EventEmitter<DisplayedSignalItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DisplayedSignalItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private document: WaveformDocument | undefined;
    private displayedSignals: DisplayedSignalItem[] = [];

    setDocument(document: WaveformDocument): void {
        this.document = document;
        this.loadDisplayedSignals();
    }

    private async loadDisplayedSignals(): Promise<void> {
        if (!this.document) {
            return;
        }

        // TODO: Load displayed signals from document
        // For now, start with empty list
        this.displayedSignals = [];
        this.refresh();
    }

    addSignal(signalId: number, name: string, path: string): void {
        const signal = new DisplayedSignalItem(name, path, signalId);
        this.displayedSignals.push(signal);
        this.refresh();
    }

    removeSignal(signalId: number): void {
        this.displayedSignals = this.displayedSignals.filter(signal => signal.id !== signalId);
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DisplayedSignalItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);

        item.contextValue = 'displayedSignal';
        item.id = element.id.toString();
        item.iconPath = new vscode.ThemeIcon('pulse');
        item.tooltip = element.path;
        item.description = `ID: ${element.id}`;

        return item;
    }

    getChildren(element?: DisplayedSignalItem): Thenable<DisplayedSignalItem[]> {
        if (!element) {
            return Promise.resolve(this.displayedSignals);
        }
        return Promise.resolve([]);
    }

    getParent(element: DisplayedSignalItem): vscode.ProviderResult<DisplayedSignalItem> {
        return undefined;
    }
}

export class DisplayedSignalItem {
    constructor(
        public readonly label: string,
        public readonly path: string,
        public readonly id: number
    ) {}
}