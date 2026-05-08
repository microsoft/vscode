/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import * as vscode from 'vscode';

const STATUS_COMMAND = 'sota.cli.openMenu';

/**
 * Status-bar entry for the bundled `sota` CLI. Visible whenever the user is
 * in a Son of Anton workspace, regardless of whether `sota` is on PATH. The
 * tooltip + quick-pick distinguishes the cases:
 *
 *  - `sota` resolves on PATH → click offers "Open sota chat in terminal" and
 *    "Open documentation".
 *  - `sota` doesn't resolve → click opens a step-by-step guide explaining
 *    `npm i -g son-of-anton-cli` (Phase CLI7's binary-bundling work will
 *    replace this with a one-click installer).
 *
 * The detection runs once on construction and again whenever the user clicks
 * the item, so the status reflects the live PATH without polling.
 */
export class CliStatusBarItem implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];
	private detected: { ok: boolean; resolvedPath?: string } = { ok: false };

	constructor() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
		this.item.command = STATUS_COMMAND;
		this.item.text = '$(terminal) sota';
		this.item.tooltip = 'Son of Anton CLI — click for actions';
		this.item.show();

		void this.detectSota().then(() => this.refresh());

		this.disposables.push(
			vscode.commands.registerCommand(STATUS_COMMAND, () => this.handleClick()),
		);
	}

	private async handleClick(): Promise<void> {
		await this.detectSota();
		this.refresh();

		const installed = this.detected.ok;
		const items: ReadonlyArray<vscode.QuickPickItem & { id: string }> = installed
			? [
				{ id: 'chat', label: '$(terminal) Open sota chat in terminal', description: 'Launches `sota chat` in the integrated terminal' },
				{ id: 'resume', label: '$(history) sota resume — list saved conversations', description: 'Lists the file-backed CLI conversation store' },
				{ id: 'docs', label: '$(book) Open CLI documentation', description: 'docs/cli-upgrade-plan.md' },
			]
			: [
				{ id: 'install', label: '$(cloud-download) Install sota CLI…', description: 'npm i -g son-of-anton-cli' },
				{ id: 'docs', label: '$(book) Open CLI documentation', description: 'docs/cli-upgrade-plan.md' },
			];

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: installed ? `sota detected at ${this.detected.resolvedPath}` : 'sota not detected on PATH',
		});
		if (!picked) {
			return;
		}
		if (picked.id === 'chat') {
			await vscode.commands.executeCommand('sota.openCliHere');
		} else if (picked.id === 'resume') {
			await vscode.commands.executeCommand('sota.openCliHere', { args: 'resume' });
		} else if (picked.id === 'docs') {
			await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(`${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''}/docs/cli-upgrade-plan.md`));
		} else if (picked.id === 'install') {
			const term = vscode.window.createTerminal({ name: 'sota CLI install' });
			term.show();
			term.sendText('npm i -g son-of-anton-cli');
		}
	}

	/**
	 * Resolve `sota` on PATH using `which` (Unix) or `where` (Windows). Times
	 * out after 1.5s so a slow shell init doesn't block the status bar.
	 */
	private detectSota(): Promise<void> {
		return new Promise(resolve => {
			const isWindows = process.platform === 'win32';
			const cmd = isWindows ? 'where' : 'which';
			execFile(cmd, ['sota'], { timeout: 1500, windowsHide: true }, (err, stdout) => {
				if (err || !stdout) {
					this.detected = { ok: false };
				} else {
					this.detected = { ok: true, resolvedPath: stdout.trim().split('\n')[0] };
				}
				resolve();
			});
		});
	}

	private refresh(): void {
		if (this.detected.ok) {
			this.item.text = '$(terminal) sota';
			this.item.tooltip = `Son of Anton CLI — installed at ${this.detected.resolvedPath}\nClick for actions.`;
		} else {
			this.item.text = '$(terminal) sota$(circle-slash)';
			this.item.tooltip = 'Son of Anton CLI is not installed. Click for setup.';
		}
	}

	dispose(): void {
		this.item.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
