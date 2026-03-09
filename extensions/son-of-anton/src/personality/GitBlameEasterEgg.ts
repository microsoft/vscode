/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { exec } from 'child_process';

/**
 * Agent commit author patterns. Commits authored by agents typically
 * use one of these names or email prefixes.
 */
const AGENT_AUTHOR_PATTERNS = [
	'anton',
	'son-of-anton',
	'son of anton',
	'agent',
	'bot',
	'[bot]',
];

/**
 * Watches for git blame operations. If every line in a file was authored
 * by agents, shows a subtle status bar message.
 */
export class GitBlameEasterEgg implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly statusBarItem: vscode.StatusBarItem;
	private readonly checkedFiles = new Set<string>();

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			0,
		);

		// Check when the active editor changes
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(editor => {
				this.statusBarItem.hide();
				if (editor) {
					this.checkFile(editor.document.uri);
				}
			})
		);
	}

	private async checkFile(fileUri: vscode.Uri): Promise<void> {
		if (fileUri.scheme !== 'file') {
			return;
		}

		const filePath = fileUri.fsPath;

		// Only check each file once per session
		if (this.checkedFiles.has(filePath)) {
			return;
		}
		this.checkedFiles.add(filePath);

		const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
		if (!workspaceFolder) {
			return;
		}

		try {
			const authors = await this.getBlameAuthors(filePath, workspaceFolder.uri.fsPath);
			if (authors.length > 0 && authors.every(a => this.isAgentAuthor(a))) {
				this.statusBarItem.text = '$(hubot) This file was entirely written by machines. The future is now.';
				this.statusBarItem.show();
				setTimeout(() => this.statusBarItem.hide(), 8000);
			}
		} catch {
			// Git blame failed — file may not be tracked. Silently ignore.
		}
	}

	private getBlameAuthors(filePath: string, cwd: string): Promise<string[]> {
		return new Promise((resolve, reject) => {
			exec(
				`git blame --porcelain "${filePath}"`,
				{ cwd, maxBuffer: 1024 * 1024 },
				(error, stdout) => {
					if (error) {
						reject(error);
						return;
					}

					const authors = new Set<string>();
					for (const line of stdout.split('\n')) {
						if (line.startsWith('author ')) {
							authors.add(line.slice(7).trim().toLowerCase());
						}
					}
					resolve([...authors]);
				},
			);
		});
	}

	private isAgentAuthor(author: string): boolean {
		const lower = author.toLowerCase();
		return AGENT_AUTHOR_PATTERNS.some(
			pattern => lower.includes(pattern)
		);
	}

	dispose(): void {
		this.statusBarItem.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
