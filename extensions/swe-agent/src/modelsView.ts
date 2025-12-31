/**
 * SWE Agent Models View Provider
 *
 * Provides a tree view of available SWE D3N models and their status.
 */

import * as vscode from 'vscode';

interface ModelInfo {
    id: string;
    name: string;
    description: string;
    status: 'ready' | 'loading' | 'error' | 'offline';
    latencyP50?: number;
    latencyP99?: number;
    requestCount?: number;
}

export class SWEModelsProvider implements vscode.TreeDataProvider<ModelTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ModelTreeItem | undefined | null | void> =
        new vscode.EventEmitter<ModelTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ModelTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _models: ModelInfo[] = [
        { id: 'codex-01', name: 'Codex-01', description: 'General code generation', status: 'ready' },
        { id: 'debug-01', name: 'Debug-01', description: 'Bug fixing and debugging', status: 'ready' },
        { id: 'review-01', name: 'Review-01', description: 'Code review', status: 'ready' },
        { id: 'test-01', name: 'Test-01', description: 'Test generation', status: 'ready' },
        { id: 'sql-01', name: 'SQL-01', description: 'Text-to-SQL', status: 'ready' },
        { id: 'shell-01', name: 'Shell-01', description: 'Shell commands', status: 'ready' },
        { id: 'git-01', name: 'Git-01', description: 'Git operations', status: 'ready' },
        { id: 'infra-01', name: 'Infra-01', description: 'Infrastructure as Code', status: 'ready' },
        { id: 'api-01', name: 'API-01', description: 'API design', status: 'ready' },
        { id: 'docs-01', name: 'Docs-01', description: 'Documentation', status: 'ready' },
        { id: 'mobile-01', name: 'Mobile-01', description: 'Mobile development', status: 'ready' },
        { id: 'json-01', name: 'JSON-01', description: 'Structured output', status: 'ready' },
        { id: 'agent-01', name: 'Agent-01', description: 'Agentic workflows', status: 'ready' },
        { id: 'diagram-01', name: 'Diagram-01', description: 'Diagram generation', status: 'ready' },
        { id: 'ui-01', name: 'UI-01', description: 'UI components', status: 'ready' },
    ];

    constructor(private readonly _sweAgent: any) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async fetchStatus(): Promise<void> {
        try {
            const response = await this._sweAgent.getModels();
            if (response.models) {
                for (const model of response.models) {
                    const existing = this._models.find(m => m.id === model.id);
                    if (existing) {
                        existing.status = model.status;
                        existing.latencyP50 = model.latency_p50;
                        existing.latencyP99 = model.latency_p99;
                        existing.requestCount = model.request_count;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch model status:', error);
        }

        this.refresh();
    }

    getTreeItem(element: ModelTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ModelTreeItem): Thenable<ModelTreeItem[]> {
        if (!element) {
            // Group models by category
            const categories = [
                { name: 'Core', models: ['codex-01', 'debug-01', 'review-01', 'test-01'] },
                { name: 'Data', models: ['sql-01', 'json-01'] },
                { name: 'DevOps', models: ['shell-01', 'git-01', 'infra-01'] },
                { name: 'Frontend', models: ['ui-01', 'mobile-01', 'diagram-01'] },
                { name: 'Specialized', models: ['api-01', 'docs-01', 'agent-01'] },
            ];

            return Promise.resolve(
                categories.map(cat =>
                    new ModelTreeItem(
                        cat.name,
                        vscode.TreeItemCollapsibleState.Expanded,
                        'category',
                        { modelIds: cat.models }
                    )
                )
            );
        }

        if (element.contextValue === 'category') {
            const modelIds = element.data?.modelIds || [];
            const models = this._models.filter(m => modelIds.includes(m.id));

            return Promise.resolve(
                models.map(model =>
                    new ModelTreeItem(
                        model.name,
                        vscode.TreeItemCollapsibleState.None,
                        'model',
                        { model }
                    )
                )
            );
        }

        return Promise.resolve([]);
    }
}

class ModelTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly data?: any,
    ) {
        super(label, collapsibleState);

        if (contextValue === 'model' && data?.model) {
            const model = data.model as ModelInfo;
            this.description = model.description;

            const statusIcon = {
                'ready': new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
                'loading': new vscode.ThemeIcon('sync~spin'),
                'error': new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')),
                'offline': new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.yellow')),
            };

            this.iconPath = statusIcon[model.status];

            let tooltip = `**${model.name}**\n\n${model.description}\n\nStatus: ${model.status}`;
            if (model.latencyP50) {
                tooltip += `\nP50 Latency: ${model.latencyP50}ms`;
            }
            if (model.latencyP99) {
                tooltip += `\nP99 Latency: ${model.latencyP99}ms`;
            }
            if (model.requestCount) {
                tooltip += `\nTotal Requests: ${model.requestCount}`;
            }

            this.tooltip = new vscode.MarkdownString(tooltip);

            // Add command to use this model
            this.command = {
                command: 'sweAgent.selectModel',
                title: 'Select Model',
                arguments: [model.id],
            };
        } else if (contextValue === 'category') {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}



