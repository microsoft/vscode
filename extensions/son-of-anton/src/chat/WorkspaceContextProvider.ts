/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'path';

export interface WorkspaceContext {
	/** Markdown-formatted context block, ready to prepend. Empty string if nothing useful. */
	readonly markdown: string;
	/** Estimated token cost (rough: characters / 4). For budgeting. */
	readonly estimatedTokens: number;
}

export interface CollectOptions {
	includeActiveSelection?: boolean;
}

const EMPTY_CONTEXT: WorkspaceContext = { markdown: '', estimatedTokens: 0 };

const MRU_CAPACITY = 20;
const RECENT_FILES_LIMIT = 5;

const SMALL_FILE_LINE_LIMIT = 200;
const SELECTION_INLINE_LINE_LIMIT = 200;
const README_LINE_LIMIT = 50;
const MAX_FILE_BYTES = 50 * 1024;

const SOFT_CHAR_BUDGET = 6000;
const HARD_CHAR_BUDGET = 12_000;

const SENSITIVE_PATTERNS: RegExp[] = [
	/\.env(\.|$)/,
	/credentials?\b/i,
	/secrets?\b/i,
	/\.(key|pem|pfx|p12)$/,
	/\bid_(rsa|dsa|ed25519|ecdsa)\b/,
	/\.son-of-anton\//,
	/node_modules\//,
	/\.git\//,
];

/**
 * Minimal shape of the Git extension's exported API used here. The full type
 * lives in the bundled `vscode.git.d.ts`; we only consume branch names so a
 * narrow inline interface keeps this provider self-contained and avoids
 * depending on a non-public typings file.
 */
interface GitExtensionApiShim {
	getAPI(version: 1): {
		repositories: Array<{
			rootUri: vscode.Uri;
			state: { HEAD?: { name?: string } };
		}>;
	};
}

/**
 * Collects a compact markdown summary of the user's workspace state to attach
 * to chat turns: active editor / selection, README overview, recent files,
 * workspace metadata.
 */
export class WorkspaceContextProvider implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly mru: string[] = [];

	constructor() {
		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument(doc => this.recordOpened(doc.uri)),
		);
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(editor => {
				if (editor) {
					this.recordOpened(editor.document.uri);
				}
			}),
		);

		const active = vscode.window.activeTextEditor;
		if (active) {
			this.recordOpened(active.document.uri);
		}
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}

	async collect(opts?: CollectOptions): Promise<WorkspaceContext> {
		const enabled = vscode.workspace
			.getConfiguration('sota.chat')
			.get<boolean>('includeWorkspaceContext', true);
		if (!enabled) {
			return EMPTY_CONTEXT;
		}

		const includeSelection = opts?.includeActiveSelection !== false;

		const meta = await this.getWorkspaceMeta();
		const active = await this.getActiveEditorContext(includeSelection);
		const readme = await this.getReadmeOverview();
		const recent = this.getRecentFiles();

		const sections: string[] = ['## Workspace Context'];
		if (meta) {
			sections.push(meta);
		}
		if (active) {
			sections.push(active);
		}
		if (readme) {
			sections.push(readme);
		}
		if (recent.length > 0) {
			const list = recent.map(p => `\`${p}\``).join(', ');
			sections.push(`**Recently Open:** ${list}`);
		}

		if (sections.length <= 1) {
			return EMPTY_CONTEXT;
		}

		let markdown = sections.join('\n\n');

		// Budget enforcement: drop the README first (largest non-active
		// section), then trim the active-file fenced body if still over.
		if (markdown.length > SOFT_CHAR_BUDGET) {
			if (readme) {
				const without = sections.filter(s => s !== readme).join('\n\n');
				markdown = without;
			}
			if (markdown.length > HARD_CHAR_BUDGET) {
				markdown = trimFencedActiveFile(markdown, HARD_CHAR_BUDGET);
			}
		}

		return {
			markdown,
			estimatedTokens: Math.ceil(markdown.length / 4),
		};
	}

	private recordOpened(uri: vscode.Uri): void {
		if (uri.scheme !== 'file') {
			return;
		}
		const key = uri.fsPath;
		const existing = this.mru.indexOf(key);
		if (existing !== -1) {
			this.mru.splice(existing, 1);
		}
		this.mru.unshift(key);
		if (this.mru.length > MRU_CAPACITY) {
			this.mru.length = MRU_CAPACITY;
		}
	}

	private async getActiveEditorContext(includeSelection: boolean): Promise<string> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return '';
		}
		const doc = editor.document;
		if (doc.uri.scheme !== 'file') {
			return '';
		}

		const relPath = vscode.workspace.asRelativePath(doc.uri, false);
		const language = doc.languageId || '';
		const sensitive = isSensitivePath(relPath);

		const selection = editor.selection;
		const hasSelection = includeSelection && !selection.isEmpty;
		const startLine = selection.start.line + 1;
		const endLine = selection.end.line + 1;

		let header: string;
		if (hasSelection) {
			header = `**Active File:** \`${relPath}\` (${language || 'plain'}, lines ${startLine}-${endLine} selected)`;
		} else {
			header = `**Active File:** \`${relPath}\` (${language || 'plain'}, line ${selection.active.line + 1})`;
		}

		// Sensitive files: include the path/language/range hint but never the
		// body so a stray credential file open in the editor doesn't leak.
		if (sensitive) {
			return header;
		}

		const totalLines = doc.lineCount;

		let body = '';
		if (hasSelection) {
			const selLines = endLine - startLine + 1;
			if (selLines <= SELECTION_INLINE_LINE_LIMIT) {
				body = doc.getText(selection);
			}
		} else if (totalLines <= SMALL_FILE_LINE_LIMIT) {
			body = doc.getText();
		}

		if (!body) {
			return header;
		}

		if (body.length > MAX_FILE_BYTES) {
			body = body.slice(0, MAX_FILE_BYTES) + '\n…(truncated)';
		}

		const fenceLang = language || '';
		return `${header}\n\n\`\`\`${fenceLang}\n${body}\n\`\`\``;
	}

	private async getReadmeOverview(): Promise<string> {
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			return '';
		}

		const candidates = ['README.md', 'README', 'README.txt', 'readme.md'];
		for (const name of candidates) {
			const uri = vscode.Uri.joinPath(folder.uri, name);
			try {
				const stat = await vscode.workspace.fs.stat(uri);
				if (stat.size > MAX_FILE_BYTES) {
					continue;
				}
				const bytes = await vscode.workspace.fs.readFile(uri);
				const text = new TextDecoder('utf-8').decode(bytes);
				const overview = extractOverview(text);
				if (!overview) {
					return '';
				}
				return `**Project Overview** (from ${name}):\n${overview}`;
			} catch {
				// Try next candidate; absent README is the common case.
			}
		}
		return '';
	}

	private getRecentFiles(): string[] {
		const active = vscode.window.activeTextEditor?.document.uri.fsPath;
		const result: string[] = [];
		for (const fsPath of this.mru) {
			if (fsPath === active) {
				continue;
			}
			const rel = vscode.workspace.asRelativePath(vscode.Uri.file(fsPath), false);
			if (isSensitivePath(rel)) {
				continue;
			}
			result.push(rel);
			if (result.length >= RECENT_FILES_LIMIT) {
				break;
			}
		}
		return result;
	}

	private async getWorkspaceMeta(): Promise<string> {
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			return '';
		}

		const parts: string[] = [`**Project:** ${folder.name}`];

		const branch = getGitBranch(folder.uri);
		if (branch) {
			parts.push(`branch: \`${branch}\``);
		}

		const counts = countOpenDocsByLanguage();
		if (counts.length > 0) {
			parts.push(counts.join(', '));
		}

		if (parts.length === 1) {
			return parts[0];
		}
		return parts.join(' · ');
	}
}

/** @internal exported for unit tests; treat as private to this module. */
export function isSensitivePath(p: string): boolean {
	const normalised = p.replace(/\\/g, '/');
	return SENSITIVE_PATTERNS.some(rx => rx.test(normalised));
}

/**
 * Prefer the body of an `## Overview` or `## Description` section if present,
 * otherwise return the first ~50 non-blank lines as a blockquote.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export function extractOverview(readme: string): string {
	const lines = readme.split(/\r?\n/);
	const sectionRx = /^##+\s+(overview|description)\b/i;
	const anySectionRx = /^##+\s+/;

	for (let i = 0; i < lines.length; i++) {
		if (sectionRx.test(lines[i])) {
			const body: string[] = [];
			for (let j = i + 1; j < lines.length && body.length < README_LINE_LIMIT; j++) {
				if (anySectionRx.test(lines[j])) {
					break;
				}
				body.push(lines[j]);
			}
			const trimmed = body.join('\n').trim();
			if (trimmed) {
				return blockquote(trimmed);
			}
		}
	}

	const head = lines.slice(0, README_LINE_LIMIT).join('\n').trim();
	return head ? blockquote(head) : '';
}

function blockquote(text: string): string {
	return text
		.split(/\r?\n/)
		.map(line => `> ${line}`)
		.join('\n');
}

/**
 * Walk currently-open text documents and bucket by languageId. Coarse hint
 * only — counting all workspace files would be far too expensive per turn.
 */
function countOpenDocsByLanguage(): string[] {
	const counts = new Map<string, number>();
	for (const doc of vscode.workspace.textDocuments) {
		if (doc.uri.scheme !== 'file') {
			continue;
		}
		const lang = doc.languageId || 'plaintext';
		counts.set(lang, (counts.get(lang) ?? 0) + 1);
	}
	const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
	return sorted.map(([lang, n]) => `${n} ${lang} file${n === 1 ? '' : 's'}`);
}

function getGitBranch(rootUri: vscode.Uri): string | undefined {
	try {
		const ext = vscode.extensions.getExtension('vscode.git');
		if (!ext || !ext.isActive) {
			return undefined;
		}
		const api = (ext.exports as GitExtensionApiShim).getAPI(1);
		const root = rootUri.fsPath;
		// Match the repository whose root contains the workspace root (or vice
		// versa) so submodules and nested workspaces still resolve a branch.
		const repo = api.repositories.find(r => {
			const repoRoot = r.rootUri.fsPath;
			return root === repoRoot || root.startsWith(repoRoot + path.sep) || repoRoot.startsWith(root + path.sep);
		}) ?? api.repositories[0];
		return repo?.state.HEAD?.name;
	} catch {
		return undefined;
	}
}

/**
 * Last-resort trim: locate the active-file fenced code block and shrink it
 * until the whole markdown fits under `limit` characters.
 */
function trimFencedActiveFile(markdown: string, limit: number): string {
	const fenceMatch = /\n```[a-zA-Z0-9_+-]*\n([\s\S]*?)\n```/.exec(markdown);
	if (!fenceMatch) {
		return markdown.length > limit ? markdown.slice(0, limit) + '\n…(truncated)' : markdown;
	}
	const overshoot = markdown.length - limit;
	if (overshoot <= 0) {
		return markdown;
	}
	const body = fenceMatch[1];
	const keep = Math.max(0, body.length - overshoot - 32);
	const trimmed = body.slice(0, keep) + '\n…(truncated)';
	const start = fenceMatch.index;
	const end = start + fenceMatch[0].length;
	const fenceFirstLine = fenceMatch[0].split('\n')[1];
	const newFence = `\n\`\`\`${fenceFirstLine.slice(3)}\n${trimmed}\n\`\`\``;
	const result = markdown.slice(0, start) + newFence + markdown.slice(end);
	return result.length > limit ? result.slice(0, limit) + '\n…(truncated)' : result;
}
