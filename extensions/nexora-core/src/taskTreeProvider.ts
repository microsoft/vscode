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
		if (!element) {
			// Root level - show tasks with no dependencies first (in execution order)
			const rootTasks = this.tasks.filter(t => t.depends_on.length === 0);
			return this.sortByExecutionOrder(rootTasks).map(t => this.createTaskItem(t));
		}

		// Show tasks that depend on this task
		const dependentTasks = this.tasks.filter(t =>
			t.depends_on.includes(element.taskId)
		);
		return this.sortByExecutionOrder(dependentTasks).map(t => this.createTaskItem(t));
	}

	private sortByExecutionOrder(tasks: DecomposedTask[]): DecomposedTask[] {
		return tasks.sort((a, b) => {
			const indexA = this.executionOrder.indexOf(a.id);
			const indexB = this.executionOrder.indexOf(b.id);
			return indexA - indexB;
		});
	}

	private createTaskItem(task: DecomposedTask): TaskItem {
		const hasDependents = this.tasks.some(t => t.depends_on.includes(task.id));

		return new TaskItem(
			task.id,
			task.name,
			task.description,
			task.type,
			task.selected_platform,
			task.estimated_duration,
			task.estimated_cost,
			hasDependents
				? vscode.TreeItemCollapsibleState.Collapsed
				: vscode.TreeItemCollapsibleState.None
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
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(name, collapsibleState);

		this.description = platform || taskType;
		this.tooltip = this.buildTooltip();
		this.iconPath = this.getIconForTaskType(taskType);
		this.contextValue = 'nexoraTask';
	}

	private buildTooltip(): string {
		const lines = [
			`Task: ${this.name}`,
			`ID: ${this.taskId}`,
			`Type: ${this.taskType}`,
			`Platform: ${this.platform || 'Not selected'}`
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
