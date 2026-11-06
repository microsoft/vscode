/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { homedir } from 'os';
import { CancellationToken, FileType, Range, Terminal, TerminalLink, TerminalLinkContext, TerminalLinkProvider, Uri, window, workspace } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { getCopilotHome } from '../copilotcli/node/cliHelpers';

const UNTRUSTED_COPILOT_HOME_MESSAGE = l10n.t('The Copilot home directory is not trusted. Please trust the directory to open this file.');

/**
 *
 * We keep parsing in two phases to mirror VS Code's shape:
 * 1) detect suffixes (e.g. :12:3, (12, 3)) and resolve the path before them
 * 2) detect path-only links (no suffix)
 */
const EXCLUDED_PATH_CHARS = '[^\\0<>\\?\\s!`&*()\'":;\\\\]';
const EXCLUDED_START_PATH_CHARS = '[^\\0<>\\?\\s!`&*()\\[\\]\'":;\\\\]';
const EXCLUDED_STANDALONE_CHARS = '[^\\0<>\\?\\s!`&*()\'":;\\\\/]';
const EXCLUDED_START_STANDALONE_CHARS = '[^\\0<>\\?\\s!`&*()\\[\\]\'":;\\\\/]';

const MAX_NESTED_LOOKUP_DIRS = 400;
const MAX_NESTED_LOOKUP_ENTRIES = 10000;

const PATH_WITH_SEPARATOR_CLAUSE = '(?:(?:\\.\\.?|~)|(?:' + EXCLUDED_START_PATH_CHARS + EXCLUDED_PATH_CHARS + '*))?(?:[\\\\/](?:' + EXCLUDED_PATH_CHARS + ')+)+';
const STANDALONE_DOTTED_FILENAME_CLAUSE = '(?:' + EXCLUDED_START_STANDALONE_CHARS + EXCLUDED_STANDALONE_CHARS + '*\\.[^\\0<>\\?\\s!`&*()\'":;\\\\/.]+' + EXCLUDED_STANDALONE_CHARS + '*)';
const PATH_CLAUSE = '(?<path>(?:' + PATH_WITH_SEPARATOR_CLAUSE + ')|(?:' + STANDALONE_DOTTED_FILENAME_CLAUSE + '))';

const PATH_REGEX = new RegExp(PATH_CLAUSE, 'g');
const PATH_BEFORE_SUFFIX_REGEX = new RegExp(PATH_CLAUSE + '$');
const LINK_SUFFIX_REGEX = /(?::(?<line>\d+)(?::(?<col>\d+))?|\((?<parenLine>\d+),\s*(?<parenCol>\d+)\))/g;

interface DetectedLinkCandidate {
	startIndex: number;
	length: number;
	pathText: string;
	line?: number;
	col?: number;
}

interface CopilotCLITerminalLink extends TerminalLink {
	uri?: Uri;
	terminal: Terminal;
	pathText: string;
	line?: number;
	col?: number;
}

/**
 * Returns session-state directories to try for a terminal.
 */
export type SessionDirResolver = (terminal: Terminal) => Promise<Uri[]>;

/**
 * Resolves relative file links in Copilot CLI terminal output.
 *
 * Copilot CLI paths are relative to the session-state directory, not the
 * workspace root. VS Code's built-in detector cannot resolve that context.
 */
export class CopilotCLITerminalLinkProvider implements TerminalLinkProvider<CopilotCLITerminalLink> {

	private readonly _copilotTerminals = new WeakSet<Terminal>();
	private readonly _terminalSessionDirs = new WeakMap<Terminal, Uri>();
	private _sessionDirResolver: SessionDirResolver | undefined;

	constructor(
		private readonly logService: ILogService,
		private readonly workspaceService?: IWorkspaceService,
	) { }

	/**
	 * Marks a terminal as a Copilot CLI terminal.
	 */
	registerTerminal(terminal: Terminal): void {
		this._copilotTerminals.add(terminal);
	}

	/**
	 * Sets a terminal's session-state directory for relative path resolution.
	 */
	setSessionDir(terminal: Terminal, sessionDir: Uri): void {
		this._terminalSessionDirs.set(terminal, sessionDir);
	}

	/**
	 * Sets a resolver used when no session directory is cached.
	 */
	setSessionDirResolver(resolver: SessionDirResolver): void {
		this._sessionDirResolver = resolver;
	}

	async provideTerminalLinks(context: TerminalLinkContext, token: CancellationToken): Promise<CopilotCLITerminalLink[]> {
		const line = context.line;
		// Match VS Code's built-in MaxLineLength limit (terminalLocalLinkDetector.ts).
		if (!line.trim() || line.length > 2000) {
			return [];
		}

		const sessionDirs = await this._getSessionDirs(context.terminal);
		if (!this._copilotTerminals.has(context.terminal) && sessionDirs.length === 0) {
			return [];
		}
		const links: CopilotCLITerminalLink[] = [];
		for (const candidate of this._detectLinkCandidates(line)) {
			// Match VS Code's built-in MaxResolvedLinksInLine (terminalLocalLinkDetector.ts).
			if (token.isCancellationRequested || links.length >= 10) {
				break;
			}

			let pathText = candidate.pathText;
			if (!pathText || pathText.length < 3) {
				continue;
			}

			// Strip trailing punctuation that is unlikely part of the path.
			// Mirrors VS Code's specialEndCharRegex (terminalLocalLinkDetector.ts).
			let trimmed = 0;
			while (pathText.length > 1 && /[\[\]"'.]$/.test(pathText)) {
				pathText = pathText.slice(0, -1);
				trimmed++;
			}

			// Skip URLs.
			if (pathText.includes('://')) {
				continue;
			}

			if (this._looksLikeNumericVersion(pathText)) {
				continue;
			}

			const lineNum = candidate.line;
			const colNum = candidate.col;

			// Tilde paths: expand ~ to home directory (~/... or ~\... on Windows).
			if (pathText.startsWith('~/') || pathText.startsWith('~\\')) {
				const absoluteUri = Uri.file(homedir() + pathText.substring(1));
				links.push({
					startIndex: candidate.startIndex,
					length: candidate.length - trimmed,
					tooltip: absoluteUri.toString(true),
					uri: absoluteUri,
					terminal: context.terminal,
					pathText,
					line: lineNum,
					col: colNum,
				});
				continue;
			}

			// Skip absolute paths; the built-in detector handles them.
			// Unix: /foo, Windows: C:\foo or \Users\foo
			if (pathText.startsWith('/') || pathText.startsWith('\\') || /^[a-zA-Z]:[/\\]/.test(pathText)) {
				continue;
			}

			const resolved = await this._resolvePath(pathText, sessionDirs, token);
			if (!resolved) {
				continue;
			}

			links.push({
				startIndex: candidate.startIndex,
				length: candidate.length - trimmed,
				tooltip: resolved.toString(true),
				uri: resolved,
				terminal: context.terminal,
				pathText,
				line: lineNum,
				col: colNum,
			});
		}

		return links;
	}

	async handleTerminalLink(link: CopilotCLITerminalLink): Promise<void> {
		try {
			const sessionDirs = await this._getSessionDirs(link.terminal);
			const resolvedCandidates = await this._resolveAllPaths(link.pathText, sessionDirs);
			let uriToOpen = link.uri
				?? resolvedCandidates[0]
				?? this._getFallbackUri(link.pathText, sessionDirs);

			if (resolvedCandidates.length > 1) {
				const pick = await window.showQuickPick(
					resolvedCandidates.map(uri => ({
						label: this._labelCandidate(uri, sessionDirs),
						description: this._describeCandidate(uri, sessionDirs),
						uri,
					})),
					{ placeHolder: l10n.t("Select which '{0}' to open", link.pathText) }
				);
				if (!pick) {
					return;
				}
				uriToOpen = pick.uri;
			}

			if (!uriToOpen) {
				return;
			}

			if (this.workspaceService && this._isInCopilotHome(uriToOpen)) {
				const trusted = await this.workspaceService.requestResourceTrust({
					uri: Uri.file(getCopilotHome()),
					message: UNTRUSTED_COPILOT_HOME_MESSAGE,
				});
				if (!trusted) {
					return;
				}
			}

			await window.showTextDocument(uriToOpen, {
				selection: link.line !== undefined
					? new Range(
						link.line - 1,
						(link.col ?? 1) - 1,
						link.line - 1,
						(link.col ?? 1) - 1
					)
					: undefined,
			});
		} catch (e) {
			this.logService.error('Failed to open terminal link', e);
		}
	}

	/**
	 * Returns candidate session directories for a terminal.
	 *
	 * Resolver results (from active sessions) are tried first because the
	 * resolver can order them by terminal affinity — sessions that belong to
	 * THIS terminal come before unrelated sessions. A cached dir from
	 * {@link setSessionDir} is appended only as a last-resort fallback when it
	 * is no longer among the active sessions (i.e. the session ended but its
	 * files may still be on disk). See https://github.com/microsoft/vscode/issues/301594.
	 */
	private _isInCopilotHome(uri: Uri): boolean {
		return extUriBiasedIgnorePathCase.isEqualOrParent(uri, Uri.file(getCopilotHome()));
	}

	private async _getSessionDirs(terminal: Terminal): Promise<Uri[]> {
		const cached = this._terminalSessionDirs.get(terminal);

		if (this._sessionDirResolver) {
			const resolved = await this._sessionDirResolver(terminal);
			const cachedFsPath = cached?.fsPath;
			// Resolver results are already ordered by terminal affinity.
			const dirs = [...resolved];
			// If the cached dir is not among the active sessions it is stale
			// (the session ended). Append it as a fallback instead of
			// putting it first where it would shadow the current session.
			if (cached && !resolved.some(dir => dir.fsPath === cachedFsPath)) {
				dirs.push(cached);
			}
			return dirs;
		}

		return cached ? [cached] : [];
	}

	/**
	 * Resolves a relative path to the first existing file on disk. Used by
	 * {@link provideTerminalLinks} on hover where we only need to know that a
	 * match exists to underline the text. Returns early on first hit.
	 *
	 * Search order must stay consistent with {@link _resolveAllPaths}:
	 * 1. Each session-state directory (e.g., `~/.copilot/session-state/{uuid}/`)
	 * 2. Workspace folders
	 * 3. `files/` under each session dir (non-bare paths only)
	 */
	private async _resolvePath(pathText: string, sessionDirs: readonly Uri[], token?: CancellationToken): Promise<Uri | undefined> {
		const isBareFilename = !pathText.includes('/') && !pathText.includes('\\');
		const isDotRelative = pathText.startsWith('./') || pathText.startsWith('.\\') || pathText.startsWith('../') || pathText.startsWith('..\\');
		const alreadyFilesRelative = pathText.startsWith('files/') || pathText.startsWith('files\\');
		const shouldTryFilesFallback = !isBareFilename && !isDotRelative && !alreadyFilesRelative;

		// Session-state directories first; CLI paths are relative to them.
		for (const sessionDir of sessionDirs) {
			if (token?.isCancellationRequested) {
				return undefined;
			}

			if (await this._exists(Uri.joinPath(sessionDir, pathText))) {
				return Uri.joinPath(sessionDir, pathText);
			}
			if (isBareFilename && await this._exists(Uri.joinPath(sessionDir, 'files', pathText))) {
				return Uri.joinPath(sessionDir, 'files', pathText);
			}
			if (isBareFilename) {
				const nested = await this._findNestedBareFilenameInSessionDir(sessionDir, pathText, token);
				if (nested) {
					return nested;
				}
			}
		}

		// Workspace folders.
		for (const folder of workspace.workspaceFolders ?? []) {
			if (token?.isCancellationRequested) {
				return undefined;
			}
			if (await this._exists(Uri.joinPath(folder.uri, pathText))) {
				return Uri.joinPath(folder.uri, pathText);
			}
		}

		// files/<path> under session dirs for non-bare paths (the CLI sometimes
		// emits workspace-relative paths that actually live under the session's
		// files/ mirror).
		if (shouldTryFilesFallback) {
			for (const sessionDir of sessionDirs) {
				if (token?.isCancellationRequested) {
					return undefined;
				}
				if (await this._exists(Uri.joinPath(sessionDir, 'files', pathText))) {
					return Uri.joinPath(sessionDir, 'files', pathText);
				}
			}
		}

		return undefined;
	}

	/**
	 * Resolves a relative path to every existing file on disk. Used by
	 * {@link handleTerminalLink} on click to populate a picker when the path
	 * is ambiguous (e.g. `plan.md` exists in both the session-state directory
	 * and the workspace root).
	 *
	 * Same search order as {@link _resolvePath} but collects all hits.
	 */
	private async _resolveAllPaths(pathText: string, sessionDirs: readonly Uri[]): Promise<Uri[]> {
		const isBareFilename = !pathText.includes('/') && !pathText.includes('\\');
		const isDotRelative = pathText.startsWith('./') || pathText.startsWith('.\\') || pathText.startsWith('../') || pathText.startsWith('..\\');
		const alreadyFilesRelative = pathText.startsWith('files/') || pathText.startsWith('files\\');
		const shouldTryFilesFallback = !isBareFilename && !isDotRelative && !alreadyFilesRelative;

		const resolved: Uri[] = [];
		const seen = new Set<string>();
		const addIfExists = async (candidate: Uri): Promise<void> => {
			if (seen.has(candidate.fsPath)) {
				return;
			}
			seen.add(candidate.fsPath);
			if (await this._exists(candidate)) {
				resolved.push(candidate);
			}
		};

		// Session-state directories first; CLI paths are relative to them.
		for (const sessionDir of sessionDirs) {
			await addIfExists(Uri.joinPath(sessionDir, pathText));
			if (isBareFilename) {
				await addIfExists(Uri.joinPath(sessionDir, 'files', pathText));
				const nested = await this._findNestedBareFilenameInSessionDir(sessionDir, pathText);
				if (nested && !seen.has(nested.fsPath)) {
					seen.add(nested.fsPath);
					resolved.push(nested);
				}
			}
		}

		// Workspace folders.
		for (const folder of workspace.workspaceFolders ?? []) {
			await addIfExists(Uri.joinPath(folder.uri, pathText));
		}

		// files/<path> under session dirs for non-bare paths.
		if (shouldTryFilesFallback) {
			for (const sessionDir of sessionDirs) {
				await addIfExists(Uri.joinPath(sessionDir, 'files', pathText));
			}
		}

		return resolved;
	}

	private async _exists(uri: Uri): Promise<boolean> {
		try {
			await workspace.fs.stat(uri);
			return true;
		} catch {
			return false;
		}
	}

	private _labelCandidate(uri: Uri, sessionDirs: readonly Uri[]): string {
		return this._relativeTo(uri, sessionDirs)
			?? this._relativeTo(uri, workspace.workspaceFolders?.map(f => f.uri) ?? [])
			?? uri.fsPath.split(/[\\/]/).pop()
			?? uri.fsPath;
	}

	private _describeCandidate(uri: Uri, sessionDirs: readonly Uri[]): string {
		const normalizedCandidatePath = uri.fsPath.replace(/\\/g, '/');
		for (const sessionDir of sessionDirs) {
			const normalizedSessionPath = sessionDir.fsPath.replace(/\\/g, '/').replace(/\/$/, '');
			if (normalizedCandidatePath.startsWith(`${normalizedSessionPath}/`)) {
				const sessionId = normalizedSessionPath.split('/').pop();
				return `session-state/${sessionId}`;
			}
		}

		if (this._relativeTo(uri, workspace.workspaceFolders?.map(f => f.uri) ?? [])) {
			return 'workspace';
		}

		return 'resolved path';
	}

	/**
	 * Returns the path of `uri` relative to the first matching base directory,
	 * or `undefined` if `uri` is not inside any of them. Compares with
	 * normalized separators.
	 */
	private _relativeTo(uri: Uri, baseDirs: readonly Uri[]): string | undefined {
		const normalizedCandidatePath = uri.fsPath.replace(/\\/g, '/');
		for (const baseDir of baseDirs) {
			const normalizedBasePath = baseDir.fsPath.replace(/\\/g, '/').replace(/\/$/, '');
			const prefix = `${normalizedBasePath}/`;
			if (normalizedCandidatePath.startsWith(prefix)) {
				return normalizedCandidatePath.slice(prefix.length);
			}
		}
		return undefined;
	}

	private async _findNestedBareFilenameInSessionDir(sessionDir: Uri, basename: string, token?: CancellationToken): Promise<Uri | undefined> {
		const queue: Uri[] = [sessionDir];
		const matches: Uri[] = [];
		const visited = new Set<string>();
		let scannedDirCount = 0;
		let scannedEntryCount = 0;

		for (let i = 0; i < queue.length; i++) {
			if (token?.isCancellationRequested || scannedDirCount >= MAX_NESTED_LOOKUP_DIRS || scannedEntryCount >= MAX_NESTED_LOOKUP_ENTRIES) {
				break;
			}

			const dir = queue[i];
			const normalizedDir = dir.fsPath.replace(/\\/g, '/');
			if (visited.has(normalizedDir)) {
				continue;
			}
			visited.add(normalizedDir);
			scannedDirCount++;

			let entries: [string, FileType][];
			try {
				entries = await workspace.fs.readDirectory(dir);
			} catch {
				continue;
			}

			for (const [name, type] of entries) {
				scannedEntryCount++;
				if (token?.isCancellationRequested || scannedEntryCount >= MAX_NESTED_LOOKUP_ENTRIES) {
					break;
				}

				const candidate = Uri.joinPath(dir, name);
				if ((type & FileType.File) !== 0 && name === basename) {
					matches.push(candidate);
					continue;
				}

				if ((type & FileType.Directory) !== 0 && (type & FileType.SymbolicLink) === 0) {
					queue.push(candidate);
				}
			}
		}

		if (matches.length === 0) {
			return undefined;
		}

		const normalizedSessionPath = sessionDir.fsPath.replace(/\\/g, '/').replace(/\/$/, '');
		const sessionPathPrefix = `${normalizedSessionPath}/`;
		matches.sort((a, b) => {
			const pathA = a.fsPath.replace(/\\/g, '/');
			const pathB = b.fsPath.replace(/\\/g, '/');
			const relA = pathA.startsWith(sessionPathPrefix) ? pathA.slice(sessionPathPrefix.length) : pathA;
			const relB = pathB.startsWith(sessionPathPrefix) ? pathB.slice(sessionPathPrefix.length) : pathB;

			const scoreA = this._nestedBareFilenameScore(relA, basename);
			const scoreB = this._nestedBareFilenameScore(relB, basename);
			if (scoreA !== scoreB) {
				return scoreA - scoreB;
			}

			return relA.localeCompare(relB);
		});

		return matches[0];
	}

	private _looksLikeNumericVersion(pathText: string): boolean {
		// Avoid false-positive links for version-like tokens such as 1.2.
		if (pathText.includes('/') || pathText.includes('\\')) {
			return false;
		}

		return /^\d+(?:\.\d+)+$/.test(pathText);
	}

	private _nestedBareFilenameScore(relativePath: string, basename: string): number {
		if (relativePath === `files/${basename}`) {
			return 0;
		}

		if (relativePath === basename) {
			return 1;
		}

		if (relativePath.startsWith('files/')) {
			return 2;
		}

		return 10 + relativePath.split('/').length;
	}

	private _getFallbackUri(pathText: string, sessionDirs: readonly Uri[]): Uri | undefined {
		const sessionDir = sessionDirs[0];
		if (sessionDir) {
			return Uri.joinPath(sessionDir, pathText);
		}

		const workspaceFolder = workspace.workspaceFolders?.[0];
		if (workspaceFolder) {
			return Uri.joinPath(workspaceFolder.uri, pathText);
		}

		return undefined;
	}

	private _detectLinkCandidates(line: string): DetectedLinkCandidate[] {
		const candidates: DetectedLinkCandidate[] = [];

		// Phase 1: Detect suffixes and resolve a path directly before each suffix.
		const suffixRegex = new RegExp(LINK_SUFFIX_REGEX.source, LINK_SUFFIX_REGEX.flags);
		for (const match of line.matchAll(suffixRegex)) {
			const suffixStartIndex = match.index;
			if (suffixStartIndex === undefined) {
				continue;
			}

			const beforeSuffix = line.slice(0, suffixStartIndex);
			const pathMatch = beforeSuffix.match(PATH_BEFORE_SUFFIX_REGEX);
			const pathText = pathMatch?.groups?.['path'];
			if (!pathText) {
				continue;
			}

			const startIndex = suffixStartIndex - pathText.length;
			const length = pathText.length + match[0].length;
			const lineText = match.groups?.['line'] ?? match.groups?.['parenLine'];
			const colText = match.groups?.['col'] ?? match.groups?.['parenCol'];

			candidates.push({
				startIndex,
				length,
				pathText,
				line: lineText ? parseInt(lineText, 10) : undefined,
				col: colText ? parseInt(colText, 10) : undefined,
			});
		}

		// Phase 2: Detect path-only links and merge non-overlapping ranges.
		const pathRegex = new RegExp(PATH_REGEX.source, PATH_REGEX.flags);
		for (const match of line.matchAll(pathRegex)) {
			const startIndex = match.index;
			const pathText = match.groups?.['path'];
			if (startIndex === undefined || !pathText) {
				continue;
			}

			const endIndex = startIndex + pathText.length;
			if (candidates.some(candidate => this._rangesOverlap(startIndex, endIndex, candidate.startIndex, candidate.startIndex + candidate.length))) {
				continue;
			}

			candidates.push({
				startIndex,
				length: pathText.length,
				pathText,
			});
		}

		candidates.sort((a, b) => a.startIndex - b.startIndex);
		return candidates;
	}

	private _rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
		return startA < endB && startB < endA;
	}
}
