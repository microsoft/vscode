/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getBackendClient } from './services/backendClient';

interface Platform {
    id: string;
    name: string;
    category: string;
    description?: string;
    capabilities?: string[];
    api_type?: string;
    auth_type?: string;
    has_active_connector?: boolean;
    is_enabled?: boolean;
}

class PlatformItem extends vscode.TreeItem {
    constructor(public readonly platform: Platform) {
        super(platform.name, vscode.TreeItemCollapsibleState.None);
        this.description = platform.category;
        this.tooltip = this._getTooltip();
        this.iconPath = this._getIcon();
        this.contextValue = platform.has_active_connector ? 'connected' : 'available';
    }

    private _getTooltip(): string {
        const parts = [this.platform.name];
        if (this.platform.description) {
            parts.push(this.platform.description);
        }
        if (this.platform.capabilities && this.platform.capabilities.length > 0) {
            parts.push(`Capabilities: ${this.platform.capabilities.join(', ')}`);
        }
        if (this.platform.api_type) {
            parts.push(`API: ${this.platform.api_type}`);
        }
        return parts.join('\n');
    }

    private _getIcon(): vscode.ThemeIcon {
        if (this.platform.has_active_connector) {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        }
        if (!this.platform.is_enabled) {
            return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
        }
        return new vscode.ThemeIcon('circle-outline');
    }
}

class CategoryItem extends vscode.TreeItem {
    constructor(
        public readonly category: string,
        public readonly platforms: Platform[]
    ) {
        super(category, vscode.TreeItemCollapsibleState.Expanded);
        this.description = `(${platforms.length})`;
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

class LoadingItem extends vscode.TreeItem {
    constructor() {
        super('Loading platforms...', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('sync~spin');
    }
}

class ErrorItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
        this.description = 'Click refresh to retry';
    }
}

export class PlatformBrowserProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private platforms: Platform[] = [];
    private isLoading = false;
    private error: string | null = null;
    private backendConnected = false;

    constructor() {
        this.loadPlatforms();
    }

    async loadPlatforms(): Promise<void> {
        this.isLoading = true;
        this.error = null;
        this._onDidChangeTreeData.fire(undefined);

        try {
            const client = getBackendClient();

            const isHealthy = await client.checkHealth();
            this.backendConnected = isHealthy;

            const platformsData = await client.getPlatforms();
            this.platforms = platformsData.map((p: any) => ({
                id: p.id,
                name: p.name,
                category: p.category,
                description: p.description,
                capabilities: p.capabilities,
                api_type: p.api_type,
                auth_type: p.auth_type,
                has_active_connector: p.has_active_connector,
                is_enabled: p.is_enabled !== false
            }));

            if (!this.backendConnected && this.platforms.length > 0) {
                this.error = 'Using cached data (backend offline)';
            }
        } catch (e) {
            this.error = 'Failed to load platforms';
            this.platforms = [];
        } finally {
            this.isLoading = false;
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    refresh(): void {
        this.loadPlatforms();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (this.isLoading) {
            return [new LoadingItem()];
        }

        if (this.error && this.platforms.length === 0) {
            return [new ErrorItem(this.error)];
        }

        if (!element) {
            const items: vscode.TreeItem[] = [];

            if (this.error) {
                items.push(new ErrorItem(this.error));
            }

            const grouped = this._groupByCategory();
            const categoryItems = Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([cat, platforms]) => new CategoryItem(cat, platforms));

            return [...items, ...categoryItems];
        }

        if (element instanceof CategoryItem) {
            return element.platforms.map(p => new PlatformItem(p));
        }

        return [];
    }

    private _groupByCategory(): Record<string, Platform[]> {
        return this.platforms.reduce((acc, p) => {
            const cat = p.category || 'Other';
            if (!acc[cat]) {
                acc[cat] = [];
            }
            acc[cat].push(p);
            return acc;
        }, {} as Record<string, Platform[]>);
    }

    isBackendConnected(): boolean {
        return this.backendConnected;
    }

    getPlatformCount(): number {
        return this.platforms.length;
    }
}
