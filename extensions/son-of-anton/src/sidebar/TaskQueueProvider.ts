/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { AgentManager, AgentTask } from '../agents/AgentManager';

class TaskQueueItem extends vscode.TreeItem {
	constructor(task: AgentTask, index: number) {
		super(`${index + 1}. ${task.agentName}`, vscode.TreeItemCollapsibleState.None);
		this.description = task.description;

		switch (task.state) {
			case 'running':
				this.iconPath = new vscode.ThemeIcon('sync~spin');
				break;
			case 'pending':
				this.iconPath = new vscode.ThemeIcon('circle-outline');
				break;
			case 'completed':
				this.iconPath = new vscode.ThemeIcon('pass-filled');
				break;
			case 'failed':
				this.iconPath = new vscode.ThemeIcon('error');
				break;
		}

		this.contextValue = task.state;
	}
}

/**
 * Tree data provider for the Task Queue sidebar view.
 * Shows all tasks in queue order.
 */
export class TaskQueueProvider implements vscode.TreeDataProvider<TaskQueueItem> {
	private readonly agentManager: AgentManager;

	private readonly _onDidChangeTreeData = new vscode.EventEmitter<TaskQueueItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<TaskQueueItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(agentManager: AgentManager) {
		this.agentManager = agentManager;
		this.agentManager.onDidChangeTasks(() => this.refresh());
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TaskQueueItem): vscode.TreeItem {
		return element;
	}

	getChildren(): TaskQueueItem[] {
		const tasks = this.agentManager.getAllTasks();
		// Show running first, then pending, then completed/failed
		const sorted = [...tasks].sort((a, b) => {
			const order: Record<string, number> = { running: 0, pending: 1, completed: 2, failed: 3 };
			return (order[a.state] ?? 4) - (order[b.state] ?? 4);
		});
		return sorted.map((task, i) => new TaskQueueItem(task, i));
	}
}
