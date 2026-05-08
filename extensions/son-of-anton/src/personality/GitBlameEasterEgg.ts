/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { getQuoteByCharacter, formatQuoteShort, type SVCharacter } from 'son-of-anton-core/personality/siliconValleyQuotes';
import { isPersonalityEnabled } from './personalityConfig';

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
 * Map of founder-name patterns to the matching Silicon Valley character.
 * If a recent commit author matches any of these substrings (case
 * insensitive), we briefly surface a quote from that character.
 */
const FOUNDER_NAME_PATTERNS: ReadonlyArray<{ pattern: string; character: SVCharacter }> = [
	{ pattern: 'richard', character: 'Richard' },
	{ pattern: 'gilfoyle', character: 'Gilfoyle' },
	{ pattern: 'dinesh', character: 'Dinesh' },
	{ pattern: 'jared', character: 'Jared' },
	{ pattern: 'donald', character: 'Jared' }, // Jared's real name is Donald
	{ pattern: 'erlich', character: 'Erlich' },
	{ pattern: 'gavin', character: 'Gavin' },
	{ pattern: 'belson', character: 'Gavin' },
	{ pattern: 'big head', character: 'Big_Head' },
	{ pattern: 'bighead', character: 'Big_Head' },
	{ pattern: 'nelson', character: 'Big_Head' },
];

const FIX_COMMIT_PATTERNS = [/\bfix\b/i, /\btodo\s+removed\b/i];

const STATUS_BAR_DURATION_MS = 3000;
const ALL_AGENT_DURATION_MS = 8000;

/**
 * On active editor changes, runs `git blame` for the newly focused file
 * (once per file per session). Surfaces three different easter eggs based
 * on what the blame turns up:
 *
 *   1. If every line in the file was authored by agents, shows the
 *      classic "the future is now" status-bar tagline.
 *   2. If the most recent commit author matches a Silicon Valley
 *      character name (e.g. "Richard"), surfaces a quote from that
 *      character for ~3s.
 *   3. If the most recent commit message contains "fix" or
 *      "TODO removed", shows the "It's not magic, it's talent and sweat"
 *      tagline.
 *
 * All easter eggs respect `sota.personality.enabled`.
 */
export class GitBlameEasterEgg implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly statusBarItem: vscode.StatusBarItem;
	private readonly checkedFiles = new Set<string>();
	private hideTimer: NodeJS.Timeout | undefined;

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
		if (!isPersonalityEnabled()) {
			return;
		}

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

		const cwd = workspaceFolder.uri.fsPath;

		try {
			const blame = await this.getBlameDetails(filePath, cwd);

			// Priority 1: all-agent-authored file -> classic tagline.
			if (blame.authors.length > 0 && blame.authors.every(a => this.isAgentAuthor(a))) {
				this.showStatusBar(
					'$(hubot) This file was entirely written by machines. The future is now.',
					ALL_AGENT_DURATION_MS,
				);
				return;
			}

			// Priority 2: most recent commit message mentions fix / TODO removed.
			if (blame.recentMessage && FIX_COMMIT_PATTERNS.some(p => p.test(blame.recentMessage!))) {
				this.showStatusBar(
					'$(sparkle) It\'s not magic. It\'s talent and sweat.',
					STATUS_BAR_DURATION_MS,
				);
				return;
			}

			// Priority 3: most recent commit author looks like a Silicon
			// Valley founder -> show a quote from that character.
			if (blame.recentAuthor) {
				const character = this.matchFounderCharacter(blame.recentAuthor);
				if (character) {
					const quote = getQuoteByCharacter(character);
					if (quote) {
						this.showStatusBar(
							`$(quote) ${formatQuoteShort(quote)}`,
							STATUS_BAR_DURATION_MS,
						);
					}
				}
			}
		} catch {
			// Git blame failed -- file may not be tracked. Silently ignore.
		}
	}

	private showStatusBar(text: string, durationMs: number): void {
		this.statusBarItem.text = text;
		this.statusBarItem.show();
		if (this.hideTimer) {
			clearTimeout(this.hideTimer);
		}
		this.hideTimer = setTimeout(() => this.statusBarItem.hide(), durationMs);
	}

	private getBlameDetails(filePath: string, cwd: string): Promise<{
		authors: string[];
		recentAuthor?: string;
		recentMessage?: string;
	}> {
		return new Promise((resolve, reject) => {
			execFile(
				'git',
				['blame', '--porcelain', filePath],
				{ cwd, maxBuffer: 1024 * 1024 },
				(error, stdout) => {
					if (error) {
						reject(error);
						return;
					}

					const authors = new Set<string>();
					let recentAuthor: string | undefined;
					let recentMessage: string | undefined;
					let recentTime = -Infinity;
					let currentAuthor: string | undefined;
					let currentSummary: string | undefined;
					let currentTime: number | undefined;

					const flushBlock = (): void => {
						if (currentAuthor !== undefined) {
							authors.add(currentAuthor);
							if (currentTime !== undefined && currentTime > recentTime) {
								recentTime = currentTime;
								recentAuthor = currentAuthor;
								recentMessage = currentSummary;
							}
						}
						currentAuthor = undefined;
						currentSummary = undefined;
						currentTime = undefined;
					};

					for (const line of stdout.split('\n')) {
						if (line.startsWith('author ')) {
							currentAuthor = line.slice(7).trim().toLowerCase();
						} else if (line.startsWith('author-time ')) {
							currentTime = Number(line.slice(12).trim());
						} else if (line.startsWith('summary ')) {
							currentSummary = line.slice(8).trim();
						} else if (line.startsWith('\t')) {
							// Source line marks the end of a header block.
							flushBlock();
						}
					}
					flushBlock();

					resolve({
						authors: [...authors],
						recentAuthor,
						recentMessage,
					});
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

	private matchFounderCharacter(author: string): SVCharacter | undefined {
		const lower = author.toLowerCase();
		for (const { pattern, character } of FOUNDER_NAME_PATTERNS) {
			if (lower.includes(pattern)) {
				return character;
			}
		}
		return undefined;
	}

	dispose(): void {
		if (this.hideTimer) {
			clearTimeout(this.hideTimer);
			this.hideTimer = undefined;
		}
		this.statusBarItem.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
