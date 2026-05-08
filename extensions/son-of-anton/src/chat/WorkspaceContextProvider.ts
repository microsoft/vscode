/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'path';
import { fetchUrlAsText } from 'son-of-anton-core/util/urlFetch';
import { AgentsMdLoader, ProjectContext } from '../agents/AgentsMdLoader';
import { TerminalCaptureBuffer } from './TerminalCaptureBuffer';

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
const SHRUNK_FILE_LINE_LIMIT = 100;
const SELECTION_INLINE_LINE_LIMIT = 200;
const README_LINE_LIMIT = 50;
const SHRUNK_README_LINE_LIMIT = 30;
const MAX_FILE_BYTES = 50 * 1024;

/**
 * The project-context excerpt embedded in the chat turn is capped here. The
 * full file (up to the loader's 8KB cap) is still available; this trims the
 * inline preview so very large CLAUDE.md / AGENTS.md files do not crowd out
 * the rest of the workspace context. Roughly ~1000 tokens.
 */
const PROJECT_CONTEXT_INLINE_BYTE_CAP = 4 * 1024;
const PROJECT_CONTEXT_INLINE_LINE_LIMIT = 50;

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
	private readonly agentsMdLoader: AgentsMdLoader;
	private readonly terminalCapture: TerminalCaptureBuffer;

	constructor() {
		this.agentsMdLoader = new AgentsMdLoader();
		this.disposables.push(this.agentsMdLoader);
		this.terminalCapture = new TerminalCaptureBuffer();
		this.disposables.push(this.terminalCapture);

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

	/**
	 * Snapshot the current workspace diagnostics as a markdown section,
	 * suitable for prepending to a chat turn when the user `@problems`-mentions
	 * the workspace. Caps the output at 8KB so a noisy build doesn't drown
	 * the prompt budget. Severity filter: errors and warnings only —
	 * info/hint diagnostics are skipped.
	 *
	 * Output shape:
	 * ```
	 * ## Diagnostics
	 *
	 * ### <relative file path>
	 * - [error] line 42, col 5: <message>
	 * - [warning] line 102, col 1: <message>
	 *
	 * ### <other file>
	 * - [error] line 12, col 1: <message>
	 * ```
	 */
	async getProblems(): Promise<string> {
		return resolveProblemsMention();
	}

	/**
	 * Resolve a `@url <link>` mention into a markdown block containing the
	 * fetched page's plain-text content. Delegates to the shared
	 * {@link fetchUrlAsText} helper so the LLM-initiated `fetch_url` tool and
	 * the user-initiated chip use identical capping and HTML stripping.
	 */
	async resolveUrlMention(url: string): Promise<string> {
		const result = await fetchUrlAsText(url);
		if (!result.ok) {
			return `## URL: ${url}\n\n[fetch failed: ${result.error ?? 'unknown error'}]\n`;
		}
		return `## URL: ${url}\n\n${result.text ?? ''}\n`;
	}

	/**
	 * Resolve `@terminal` into a markdown block containing the active
	 * terminal's most recently completed command and output. Requires shell
	 * integration to be enabled — without it, VS Code's stable API exposes no
	 * way to read terminal scrollback, and we surface a placeholder so the
	 * LLM understands why the context is missing.
	 */
	async resolveTerminalMention(): Promise<string> {
		const terminal = vscode.window.activeTerminal;
		if (!terminal) {
			return '## Terminal\n\n[no active terminal]\n';
		}
		const integration = terminal.shellIntegration;
		if (!integration) {
			return '## Terminal\n\n[shell integration disabled — enable terminal.integrated.shellIntegration.enabled in settings to capture terminal output]\n';
		}
		const captured = this.terminalCapture.lastOutputFor(terminal);
		if (!captured) {
			return '## Terminal\n\n[no command has run in this terminal yet — once you run something, @terminal will surface its output]\n';
		}
		const header = captured.commandLine
			? `## Terminal: ${captured.commandLine}`
			: '## Terminal';
		const body = captured.output.trim().length > 0
			? captured.output
			: '[command produced no output]';
		return `${header}\n\n${body}\n`;
	}

	async collect(opts?: CollectOptions): Promise<WorkspaceContext> {
		const enabled = vscode.workspace
			.getConfiguration('sota.chat')
			.get<boolean>('includeWorkspaceContext', true);
		if (!enabled) {
			return EMPTY_CONTEXT;
		}

		const includeSelection = opts?.includeActiveSelection !== false;

		const projectContext = await this.agentsMdLoader.load();
		const hasProjectContext = projectContext.source !== 'none' && projectContext.contents.trim().length > 0;
		const readmeLineLimit = hasProjectContext ? SHRUNK_README_LINE_LIMIT : README_LINE_LIMIT;
		const activeFileLineLimit = hasProjectContext ? SHRUNK_FILE_LINE_LIMIT : SMALL_FILE_LINE_LIMIT;

		const meta = await this.getWorkspaceMeta();
		const active = await this.getActiveEditorContext(includeSelection, activeFileLineLimit);
		const readme = await this.getReadmeOverview(readmeLineLimit);
		const recent = this.getRecentFiles();

		// Order matches the prompt-readability we want: orient the model
		// before showing it the active editor.
		//   1. Workspace meta (project name, branch)
		//   2. Project Overview (README excerpt)
		//   3. Project Context (CLAUDE.md / AGENTS.md excerpt) — between the
		//      README and the active file so the LLM has the project rules
		//      loaded before it inspects code.
		//   4. Active File
		//   5. Recently Open
		const sections: string[] = ['## Workspace Context'];
		if (meta) {
			sections.push(meta);
		}
		if (readme) {
			sections.push(readme);
		}
		const projectContextSection = formatProjectContextSection(projectContext);
		if (projectContextSection) {
			sections.push(projectContextSection);
		}
		if (active) {
			sections.push(active);
		}
		if (recent.length > 0) {
			const list = recent.map(p => `\`${p}\``).join(', ');
			sections.push(`**Recently Open:** ${list}`);
		}

		if (sections.length <= 1) {
			return EMPTY_CONTEXT;
		}

		let markdown = sections.join('\n\n');

		// Budget enforcement, in increasing order of severity:
		//   1. Drop the README first (lowest-value when project context is
		//      present, since CLAUDE.md / AGENTS.md is more direct guidance).
		//   2. If still over hard budget, trim the active-file fenced body —
		//      project context is the highest-value chunk for LLM grounding
		//      and is preserved as long as possible.
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

	private async getActiveEditorContext(
		includeSelection: boolean,
		smallFileLineLimit: number = SMALL_FILE_LINE_LIMIT,
	): Promise<string> {
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
		} else if (totalLines <= smallFileLineLimit) {
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

	private async getReadmeOverview(lineLimit: number = README_LINE_LIMIT): Promise<string> {
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
				const overview = extractOverview(text, lineLimit);
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

/**
 * Walk every workspace diagnostic, emit a `## Diagnostics` section grouped
 * by file, and cap at 8KB. Errors and warnings only — info/hint are
 * skipped. Each entry is `- [<sev>] line N, col M: <message>`.
 *
 * Exported as a free function so the resolver layer can call it without
 * needing a `WorkspaceContextProvider` instance (e.g. in unit tests).
 */
export async function resolveProblemsMention(): Promise<string> {
	const allDiagnostics: Array<[vscode.Uri, vscode.Diagnostic[]]> = vscode.languages.getDiagnostics();
	const sections: string[] = [];
	let totalCount = 0;
	for (const [uri, diags] of allDiagnostics) {
		const filtered = diags.filter(d =>
			d.severity === vscode.DiagnosticSeverity.Error
			|| d.severity === vscode.DiagnosticSeverity.Warning,
		);
		if (filtered.length === 0) {
			continue;
		}
		const relPath = vscode.workspace.asRelativePath(uri, false);
		const lines = filtered.map(d => {
			const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning';
			const message = (d.message || '').split(/\r?\n/)[0];
			return `- [${sev}] line ${d.range.start.line + 1}, col ${d.range.start.character + 1}: ${message}`;
		});
		sections.push(`### ${relPath}\n${lines.join('\n')}`);
		totalCount += filtered.length;
	}
	if (sections.length === 0) {
		return '## Diagnostics\n\n(no errors or warnings)\n';
	}

	const PROBLEMS_BYTE_CAP = 8 * 1024;
	const full = `## Diagnostics\n\n${sections.join('\n\n')}\n`;
	if (Buffer.byteLength(full, 'utf8') <= PROBLEMS_BYTE_CAP) {
		return full;
	}
	// Truncate by walking sections in order and stopping once we'd exceed
	// the budget; tally the remaining diagnostics so the LLM knows how
	// many were dropped.
	const kept: string[] = [];
	let bytes = Buffer.byteLength('## Diagnostics\n\n', 'utf8');
	let keptCount = 0;
	for (const section of sections) {
		const segment = (kept.length === 0 ? section : '\n\n' + section);
		const segmentBytes = Buffer.byteLength(segment, 'utf8');
		if (bytes + segmentBytes > PROBLEMS_BYTE_CAP) {
			break;
		}
		kept.push(section);
		bytes += segmentBytes;
		keptCount += section.split('\n').length - 1;
	}
	const remaining = totalCount - keptCount;
	const body = kept.length > 0 ? kept.join('\n\n') : sections[0].slice(0, PROBLEMS_BYTE_CAP);
	return `## Diagnostics\n\n${body}\n\n[truncated — ${remaining} more diagnostics]\n`;
}

/** @internal exported for unit tests; treat as private to this module. */
export function isSensitivePath(p: string): boolean {
	const normalised = p.replace(/\\/g, '/');
	return SENSITIVE_PATTERNS.some(rx => rx.test(normalised));
}

/**
 * Prefer the body of an `## Overview` or `## Description` section if present,
 * otherwise return the first `lineLimit` non-blank lines as a blockquote.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export function extractOverview(readme: string, lineLimit: number = README_LINE_LIMIT): string {
	const lines = readme.split(/\r?\n/);
	const sectionRx = /^##+\s+(overview|description)\b/i;
	const anySectionRx = /^##+\s+/;

	for (let i = 0; i < lines.length; i++) {
		if (sectionRx.test(lines[i])) {
			const body: string[] = [];
			for (let j = i + 1; j < lines.length && body.length < lineLimit; j++) {
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

	const head = lines.slice(0, lineLimit).join('\n').trim();
	return head ? blockquote(head) : '';
}

function blockquote(text: string): string {
	return text
		.split(/\r?\n/)
		.map(line => `> ${line}`)
		.join('\n');
}

/**
 * Render a `**Project Context** (from <source>): …` section from a loaded
 * `ProjectContext`. Returns the empty string when no context file was found
 * — callers should drop the section in that case rather than emit a "no
 * project context" line.
 *
 * The body is capped further than the loader's 8KB ceiling: the inline
 * preview is at most {@link PROJECT_CONTEXT_INLINE_BYTE_CAP} bytes / the
 * first {@link PROJECT_CONTEXT_INLINE_LINE_LIMIT} lines so a long context
 * file doesn't crowd out the rest of the workspace context. A pointer to
 * the absolute path is appended when truncation occurs.
 *
 * @internal exported for unit tests; treat as private to this module.
 */
export function formatProjectContextSection(ctx: ProjectContext): string {
	if (ctx.source === 'none') {
		return '';
	}
	const body = (ctx.contents ?? '').trim();
	if (!body) {
		return '';
	}

	const allLines = body.split(/\r?\n/);
	const previewLines = allLines.slice(0, PROJECT_CONTEXT_INLINE_LINE_LIMIT);
	let preview = previewLines.join('\n');
	let inlineTruncated = previewLines.length < allLines.length;
	if (preview.length > PROJECT_CONTEXT_INLINE_BYTE_CAP) {
		preview = preview.slice(0, PROJECT_CONTEXT_INLINE_BYTE_CAP);
		inlineTruncated = true;
	}

	const header = `**Project Context** (from ${ctx.source}):`;
	const quoted = blockquote(preview);
	const truncated = ctx.truncated || inlineTruncated;
	if (!truncated) {
		return `${header}\n${quoted}`;
	}
	const pointer = ctx.path
		? `_(truncated to 8KB; full file at ${ctx.path})_`
		: '_(truncated)_';
	return `${header}\n${quoted}\n${pointer}`;
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
