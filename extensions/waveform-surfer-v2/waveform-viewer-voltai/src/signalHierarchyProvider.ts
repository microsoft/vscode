// src/signalHierarchyProvider.ts
// Tree data provider for signal hierarchy

import * as vscode from 'vscode';
import { WaveformDocument } from './waveformEditorProvider';

export class SignalHierarchyProvider implements vscode.TreeDataProvider<HierarchyItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HierarchyItem | undefined | null | void> = new vscode.EventEmitter<HierarchyItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HierarchyItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private document: WaveformDocument | undefined;
    private hierarchyData: HierarchyItem[] = [];

    setDocument(document: WaveformDocument): void {
        this.document = document;
        this.loadHierarchy();
    }

    private async loadHierarchy(): Promise<void> {
        if (!this.document) {
            return;
        }

        // TODO: Load hierarchy from WASM
        // For now, create mock data
        this.hierarchyData = [
            new HierarchyItem('testbench', 'scope', undefined, [
                new HierarchyItem('clock', 'signal', 1),
                new HierarchyItem('reset', 'signal', 2),
                new HierarchyItem('cpu', 'scope', undefined, [
                    new HierarchyItem('pc', 'signal', 3),
                    new HierarchyItem('instruction', 'signal', 4),
                ])
            ])
        ];

        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HierarchyItem): vscode.TreeItem {
        const item = new vscode.TreeItem(
            element.label,
            element.children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        item.contextValue = element.type;
        item.id = element.id?.toString();

        if (element.type === 'signal') {
            item.iconPath = new vscode.ThemeIcon('pulse');
            item.command = {
                command: 'waveformSurfer.addSignal',
                title: 'Add Signal',
                arguments: [element]
            };
        } else {
            item.iconPath = new vscode.ThemeIcon('folder');
        }

        return item;
    }

    getChildren(element?: HierarchyItem): Thenable<HierarchyItem[]> {
        if (!element) {
            return Promise.resolve(this.hierarchyData);
        }
        return Promise.resolve(element.children || []);
    }

    getParent(element: HierarchyItem): vscode.ProviderResult<HierarchyItem> {
        return element.parent;
    }
}

export class HierarchyItem {
    constructor(
        public readonly label: string,
        public readonly type: 'scope' | 'signal',
        public readonly id?: number,
        public readonly children?: HierarchyItem[],
        public readonly parent?: HierarchyItem
    ) {
        // Set parent for children
        if (children) {
            children.forEach(child => {
                (child as any).parent = this;
            });
        }
    }
}