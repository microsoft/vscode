/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { AgentManager, AgentTask } from '../agents/AgentManager';

type TreeItem = AgentStatusCategory | AgentTaskItem;

type CategoryType = 'active' | 'pending' | 'recent';

class AgentStatusCategory extends vscode.TreeItem {
	constructor(
		public readonly categoryType: CategoryType,
		label: string,
		count: number,
	) {
		super(label, count > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
		this.description = `(${count})`;
	}
}

class AgentTaskItem extends vscode.TreeItem {
	constructor(public readonly task: AgentTask) {
		super(task.agentName, vscode.TreeItemCollapsibleState.None);

		this.description = task.description;
		this.tooltip = `${task.agentName}: ${task.description}\nState: ${task.state}`;

		switch (task.state) {
			case 'running':
				this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
				break;
			case 'pending':
				this.iconPath = new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
				break;
			case 'completed':
				this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
				if (task.completedAt) {
					this.description += ` (${this.timeAgo(task.completedAt)})`;
				}
				break;
			case 'failed':
				this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
				if (task.error) {
					this.tooltip += `\nError: ${task.error}`;
				}
				break;
		}

		// Click to show trace
		this.command = {
			command: 'sota.showTraces',
			title: 'Show Traces',
		};
	}

	private timeAgo(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) {
			return `${seconds}s ago`;
		}
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) {
			return `${minutes} min ago`;
		}
		const hours = Math.floor(minutes / 60);
		return `${hours}h ago`;
	}
}

/**
 * Tree data provider for the Agent Status sidebar view.
 * Shows active, pending, and recent agent tasks.
 */
export class AgentStatusProvider implements vscode.TreeDataProvider<TreeItem> {
	private readonly agentManager: AgentManager;

	private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(agentManager: AgentManager) {
		this.agentManager = agentManager;
		this.agentManager.onDidChangeTasks(() => this.refresh());
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: TreeItem): TreeItem[] {
		if (!element) {
			// Root level: categories
			const active = this.agentManager.getActiveTasks();
			const pending = this.agentManager.getPendingTasks();
			const recent = this.agentManager.getRecentTasks();

			return [
				new AgentStatusCategory('active', 'Active Agents', active.length),
				new AgentStatusCategory('pending', 'Pending', pending.length),
				new AgentStatusCategory('recent', 'Recent Tasks', recent.length),
			];
		}

		if (element instanceof AgentStatusCategory) {
			let tasks: AgentTask[];
			switch (element.categoryType) {
				case 'active':
					tasks = this.agentManager.getActiveTasks();
					break;
				case 'pending':
					tasks = this.agentManager.getPendingTasks();
					break;
				case 'recent':
					tasks = this.agentManager.getRecentTasks();
					break;
			}
			return tasks.map(t => new AgentTaskItem(t));
		}

		return [];
	}
}
