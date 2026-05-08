/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import type { CodeGraphController, CodeGraphState } from '../services/CodeGraphController';

/**
 * Status-bar entry that surfaces the bundled code-graph stack lifecycle.
 *
 * - Hidden until the controller transitions out of `unknown` (so the bar
 *   stays clean for users who never opt in).
 * - When `running`, shows `◇ Code Graph: Running` and clicks open a quick
 *   pick offering Stop / Restart / Logs.
 * - When `error` / `stopped`, shows the failure state and clicks try to
 *   start the stack again via `sota.enableCodeGraph`.
 */
export class CodeGraphStatusBarItem implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(controller: CodeGraphController) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
		this.item.command = 'sota.codeGraph.menu';
		this.render(controller.state);
		this.disposables.push(
			controller.onDidChangeState(state => this.render(state)),
		);
	}

	private render(state: CodeGraphState): void {
		switch (state) {
			case 'running':
				this.item.text = '$(circuit-board) Code Graph: Running';
				this.item.tooltip = 'Son of Anton — code graph running. Click for actions.';
				this.item.show();
				return;
			case 'starting':
				this.item.text = '$(sync~spin) Code Graph: Starting';
				this.item.tooltip = 'Son of Anton — starting code graph stack...';
				this.item.show();
				return;
			case 'error':
				this.item.text = '$(error) Code Graph: Error';
				this.item.tooltip = 'Son of Anton — code graph stack errored. Click to retry.';
				this.item.show();
				return;
			case 'stopped':
				this.item.text = '$(debug-stop) Code Graph: Stopped';
				this.item.tooltip = 'Son of Anton — code graph stopped. Click to restart.';
				this.item.show();
				return;
			case 'unavailable':
				this.item.text = '$(warning) Code Graph: Docker missing';
				this.item.tooltip = 'Docker is not on PATH. Install Docker Desktop to enable the code graph.';
				this.item.show();
				return;
			case 'unknown':
			default:
				this.item.hide();
				return;
		}
	}

	dispose(): void {
		this.item.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
