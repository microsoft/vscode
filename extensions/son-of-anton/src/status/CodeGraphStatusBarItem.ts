/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { CodeGraphBackend, CodeGraphBackendState } from '../codeGraph/CodeGraphBackend';

const STATUS_COMMAND = 'sota.codeGraph.statusMenu';

/**
 * Status-bar entry surfacing the embedded code-graph backend state. Mirrors
 * the shape of `HarnessStatusBarItem` — click opens a quick-pick offering
 * Restart / Use Docker stack / Use embedded backend / Open docs.
 *
 * Visual states:
 *   $(database) code-graph ●           — embedded server healthy
 *   $(database) code-graph (docker) ●  — legacy Docker stack detected
 *   $(database) code-graph ○           — off, starting, or failed
 *
 * Distinct from the older `sidebar/CodeGraphStatusBarItem` which surfaces
 * the FalkorDB+Qdrant docker compose stack — that one stays for users on
 * the new docker path; this one represents the unified backend lifecycle.
 */
export class CodeGraphStatusBarItem implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly backend: CodeGraphBackend;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(backend: CodeGraphBackend) {
		this.backend = backend;
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 92);
		this.item.command = STATUS_COMMAND;
		this.item.show();
		this.render(backend.currentState);

		this.disposables.push(
			backend.onDidChangeState(state => this.render(state)),
			vscode.commands.registerCommand(STATUS_COMMAND, () => this.handleClick()),
		);
	}

	private render(state: CodeGraphBackendState): void {
		switch (state) {
			case 'embedded':
				this.item.text = '$(database) code-graph $(circle-filled)';
				this.item.tooltip = this.buildTooltip('embedded server healthy');
				return;
			case 'docker':
				this.item.text = '$(database) code-graph (docker) $(circle-filled)';
				this.item.tooltip = this.buildTooltip('legacy Docker stack detected');
				return;
			case 'starting':
				this.item.text = '$(database) code-graph $(sync~spin)';
				this.item.tooltip = this.buildTooltip('starting...');
				return;
			case 'failed':
				this.item.text = '$(database) code-graph $(circle-outline)';
				this.item.tooltip = this.buildTooltip(
					`failed${this.backend.failureReason ? `: ${this.backend.failureReason}` : ''}`,
				);
				return;
			case 'off':
			default:
				this.item.text = '$(database) code-graph $(circle-outline)';
				this.item.tooltip = this.buildTooltip('off');
				return;
		}
	}

	private buildTooltip(stateLine: string): vscode.MarkdownString {
		const tip = new vscode.MarkdownString(undefined, true);
		tip.isTrusted = true;
		tip.appendMarkdown(`**Son of Anton — code graph**\n\n`);
		tip.appendMarkdown(`State: ${stateLine}\n\n`);
		if (this.backend.lastIndexedAt) {
			const when = new Date(this.backend.lastIndexedAt).toLocaleTimeString();
			tip.appendMarkdown(
				`Last index: ${when} (${this.backend.fileCount ?? '?'} files, ${this.backend.symbolCount ?? '?'} symbols)\n\n`,
			);
		}
		tip.appendMarkdown(`Click for actions.`);
		return tip;
	}

	private async handleClick(): Promise<void> {
		interface PickItem extends vscode.QuickPickItem {
			readonly action: 'restart' | 'use-docker' | 'use-embedded' | 'open-logs' | 'open-docs' | 'show-status';
		}
		const items: PickItem[] = [
			{
				label: '$(refresh) Restart',
				description: 'Tear down + respawn the embedded server',
				action: 'restart',
			},
			{
				label: '$(output) Open logs',
				description: 'Show child process stdout / stderr',
				action: 'open-logs',
			},
			{
				label: '$(info) Show status',
				description: 'Backend state, last index time, symbol count',
				action: 'show-status',
			},
			{
				label: '$(server) Use Docker stack',
				description: "Set sota.codeGraph.backend = 'docker'",
				action: 'use-docker',
			},
			{
				label: '$(rocket) Use embedded backend',
				description: "Set sota.codeGraph.backend = 'embedded'",
				action: 'use-embedded',
			},
			{
				label: '$(link-external) Open docs',
				description: 'services/code-graph/README.md',
				action: 'open-docs',
			},
		];

		const choice = await vscode.window.showQuickPick(items, {
			placeHolder: 'Son of Anton — code graph actions',
		});
		if (!choice) {
			return;
		}
		switch (choice.action) {
			case 'restart':
				await vscode.commands.executeCommand('sota.codeGraph.restart');
				return;
			case 'open-logs':
				await vscode.commands.executeCommand('sota.codeGraph.openLogs');
				return;
			case 'show-status':
				await vscode.commands.executeCommand('sota.codeGraph.showStatus');
				return;
			case 'use-docker':
				await vscode.workspace
					.getConfiguration('sota.codeGraph')
					.update('backend', 'docker', vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage(
					'Son of Anton: code graph backend set to docker. Restart applied.',
				);
				await vscode.commands.executeCommand('sota.codeGraph.restart');
				return;
			case 'use-embedded':
				await vscode.workspace
					.getConfiguration('sota.codeGraph')
					.update('backend', 'embedded', vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage(
					'Son of Anton: code graph backend set to embedded. Restart applied.',
				);
				await vscode.commands.executeCommand('sota.codeGraph.restart');
				return;
			case 'open-docs':
				await vscode.env.openExternal(
					vscode.Uri.parse('https://github.com/CodeHalwell/Son-Of-Anton/blob/main/services/code-graph/README.md'),
				);
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
