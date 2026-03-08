/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { AgentManager } from '../agents/AgentManager';

/**
 * Manages the status bar item that shows agent activity.
 * Displays a spinner when agents are active, idle icon when not.
 */
export class StatusBarManager implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(agentManager: AgentManager) {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		this.statusBarItem.command = 'sota.openChat';
		this.statusBarItem.tooltip = 'Son of Anton';
		this.update(agentManager.hasActiveAgents());
		this.statusBarItem.show();

		this.disposables.push(
			agentManager.onDidChangeTasks(() => {
				this.update(agentManager.hasActiveAgents());
			})
		);
	}

	private update(hasActiveAgents: boolean): void {
		if (hasActiveAgents) {
			this.statusBarItem.text = '$(sync~spin) Son of Anton';
			this.statusBarItem.tooltip = 'Son of Anton — agents running';
		} else {
			this.statusBarItem.text = '$(hubot) Son of Anton';
			this.statusBarItem.tooltip = 'Son of Anton — idle';
		}
	}

	dispose(): void {
		this.statusBarItem.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
