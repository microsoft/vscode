/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

interface DecomposedTask {
	id: string;
	name: string;
	description: string;
	type: string;
	depends_on: string[];
	selected_platform: string | null;
	estimated_duration: string | null;
	estimated_cost: number;
}

interface DecompositionResult {
	tasks: DecomposedTask[];
	dag: Record<string, string[]>;
	parallel_groups: string[][];
	execution_order: string[];
}

export class TaskTreeProvider implements vscode.TreeDataProvider<TaskItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | null>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private tasks: DecomposedTask[] = [];
	private dag: Record<string, string[]> = {};
	private executionOrder: string[] = [];

	setDecomposition(result: DecompositionResult): void {
		this.tasks = result.tasks;
		this.dag = result.dag;
		this.executionOrder = result.execution_order;
		this._onDidChangeTreeData.fire(undefined);
	}

	clear(): void {
		this.tasks = [];
		this.dag = {};
		this.executionOrder = [];
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: TaskItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: TaskItem): TaskItem[] {
		if (element) {
			// Flat execution plan: no nested children (DAG is not a tree)
			return [];
		}

		// Root: one row per task in backend execution_order (matches chat panel)
		const ordered = this.sortByExecutionOrder([...this.tasks]);
		const total = ordered.length;
		return ordered.map((t, i) => this.createTaskItem(t, i + 1, total));
	}

	private sortByExecutionOrder(tasks: DecomposedTask[]): DecomposedTask[] {
		return tasks.sort((a, b) => {
			const indexA = this.executionOrder.indexOf(a.id);
			const indexB = this.executionOrder.indexOf(b.id);
			const rankA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
			const rankB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
			return rankA - rankB;
		});
	}

	private createTaskItem(task: DecomposedTask, step: number, total: number): TaskItem {
		const depHint =
			task.depends_on.length > 0 ? `after ${task.depends_on.join(', ')}` : 'no deps';
		const platform = task.selected_platform || task.type;

		return new TaskItem(
			task.id,
			task.name,
			task.description,
			task.type,
			task.selected_platform,
			task.estimated_duration,
			task.estimated_cost,
			step,
			total,
			depHint,
			vscode.TreeItemCollapsibleState.None
		);
	}

	getTaskCount(): number {
		return this.tasks.length;
	}
}

class TaskItem extends vscode.TreeItem {
	constructor(
		public readonly taskId: string,
		public readonly name: string,
		public readonly taskDescription: string,
		public readonly taskType: string,
		public readonly platform: string | null,
		public readonly duration: string | null,
		public readonly cost: number,
		public readonly step: number,
		public readonly total: number,
		public readonly depHint: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(`${taskId}: ${name}`, collapsibleState);

		const platformLabel = platform || taskType;
		this.description = `${step}/${total} · ${platformLabel} · ${depHint}`;
		this.tooltip = this.buildTooltip();
		this.iconPath = this.getIconForTaskType(taskType);
		this.contextValue = 'nexoraTask';
	}

	private buildTooltip(): string {
		const lines = [
			`Execution step: ${this.step} of ${this.total}`,
			`Task: ${this.name}`,
			`ID: ${this.taskId}`,
			`Type: ${this.taskType}`,
			`Platform: ${this.platform || 'Not selected'}`,
			`Dependencies: ${this.depHint}`
		];

		if (this.taskDescription) {
			lines.push(`Description: ${this.taskDescription}`);
		}
		if (this.duration) {
			lines.push(`Duration: ${this.duration}`);
		}
		if (this.cost > 0) {
			lines.push(`Cost: $${this.cost.toFixed(2)}`);
		}

		return lines.join('\n');
	}

	private getIconForTaskType(taskType: string): vscode.ThemeIcon {
		const iconMap: Record<string, string> = {
			'UI_GENERATION': 'layout',
			'CODE_GENERATION': 'code',
			'DATABASE_SETUP': 'database',
			'AUTH_SETUP': 'lock',
			'PAYMENT_INTEGRATION': 'credit-card',
			'API_CREATION': 'plug',
			'DEPLOYMENT': 'cloud-upload',
			'TESTING': 'beaker',
			'CONFIGURATION': 'settings-gear',
			'FILE_OPERATION': 'file'
		};

		const iconName = iconMap[taskType] || 'circle-outline';
		return new vscode.ThemeIcon(iconName);
	}
}
