import * as vscode from 'vscode';

// Platform interface
interface Platform {
    id: string;
    name: string;
    category: string;
    status: 'available' | 'connected' | 'unavailable';
}

// Sample platforms - will come from backend in Week 3
const PLATFORMS: Platform[] = [
    { id: 'openai', name: 'OpenAI GPT-4', category: 'LLM', status: 'available' },
    { id: 'claude', name: 'Anthropic Claude', category: 'LLM', status: 'available' },
    { id: 'v0-dev', name: 'v0.dev', category: 'UI Generation', status: 'available' },
    { id: 'github', name: 'GitHub', category: 'Version Control', status: 'connected' },
    { id: 'vercel', name: 'Vercel', category: 'Deployment', status: 'available' },
    { id: 'supabase', name: 'Supabase', category: 'Database', status: 'available' },
    { id: 'stripe', name: 'Stripe', category: 'Payments', status: 'unavailable' },
    { id: 'crewai', name: 'CrewAI', category: 'Multi-Agent', status: 'available' },
];

// Tree item for platform
class PlatformItem extends vscode.TreeItem {
    constructor(public readonly platform: Platform) {
        super(platform.name, vscode.TreeItemCollapsibleState.None);
        this.description = platform.category;
        this.tooltip = `${platform.name} (${platform.status})`;
        this.iconPath = this._getIcon();
        this.contextValue = platform.status;
    }

    private _getIcon(): vscode.ThemeIcon {
        switch (this.platform.status) {
            case 'connected':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case 'available':
                return new vscode.ThemeIcon('circle-outline');
            case 'unavailable':
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }
}

// Tree item for category
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

export class PlatformBrowserProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (!element) {
            // Root: return categories
            const grouped = this._groupByCategory();
            return Object.entries(grouped).map(
                ([cat, platforms]) => new CategoryItem(cat, platforms)
            );
        }
        
        if (element instanceof CategoryItem) {
            // Category: return platforms
            return element.platforms.map(p => new PlatformItem(p));
        }
        
        return [];
    }

    private _groupByCategory(): Record<string, Platform[]> {
        return PLATFORMS.reduce((acc, p) => {
            if (!acc[p.category]) acc[p.category] = [];
            acc[p.category].push(p);
            return acc;
        }, {} as Record<string, Platform[]>);
    }
}
