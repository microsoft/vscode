/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { IObservable, observableValueOpts } from '../../../../base/common/observable.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { buildClaudeDebugArtifacts, buildClaudeDebugFilePath, CLAUDE_LOG_DIR, claudeDebugLogSessionToken, toFileTimestamp } from '../../common/agentHostLogNaming.js';
import { type IDebugArtifact } from '../../common/state/sessionState.js';

/**
 * Owns discovery + publishing of a Claude session's debug artifacts (the SDK
 * `--debug` log files plus the session transcript JSONL). Kept separate from
 * {@link ClaudeAgentSession} so the disk I/O is unit-testable against an
 * in-memory {@link IFileService}, and so the session holds no artifact state of
 * its own beyond bridging {@link artifacts} into `_meta`.
 *
 * {@link artifacts} is the single source of truth and a pure projection of what
 * is on disk: {@link refresh} re-reads both locations and republishes, and its
 * structural equality means a refresh that finds nothing new does not fire.
 *
 * Depends only on the two home URIs (not the environment service) so a test
 * needs nothing more than an in-memory file service and two paths.
 */
export class ClaudeDebugArtifacts {

	private readonly _artifacts = observableValueOpts<readonly IDebugArtifact[]>({ equalsFn: structuralEquals }, []);

	/** The advertised artifact set, rebuilt from disk truth by {@link refresh}. */
	readonly artifacts: IObservable<readonly IDebugArtifact[]> = this._artifacts;

	constructor(
		private readonly _sessionId: string,
		private readonly _logsHome: URI,
		private readonly _userHome: URI,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) { }

	/**
	 * Create `<logsHome>/claude/` and compute the per-run debug-log path handed to
	 * the SDK's `Options.debugFile` (which implicitly enables `--debug`). Every
	 * materialize/rematerialize points the SDK at its own
	 * `<logsHome>/claude/claude-<timestamp>-<sessionId>.log`.
	 *
	 * Only prepares the path — the file is advertised later by {@link refresh},
	 * once `sdk.startup()` has actually written it, so an aborted startup never
	 * advertises a log the SDK never produced.
	 *
	 * Best-effort: a folder-create failure warn-logs and returns `undefined` so a
	 * logging problem never blocks session startup.
	 */
	async prepareDebugFile(): Promise<string | undefined> {
		try {
			const { dir, file } = buildClaudeDebugFilePath(this._logsHome, this._sessionId, toFileTimestamp(new Date()));
			await this._fileService.createFolder(dir);
			return file.fsPath;
		} catch (err) {
			this._logService.warn(`[Claude] session ${this._sessionId}: failed to prepare debug log file`, err);
			return undefined;
		}
	}

	/**
	 * Re-read the two on-disk locations the host/SDK own for this session and
	 * republish the projected artifact set via the pure, unit-tested
	 * {@link buildClaudeDebugArtifacts}. No cached state: the truth lives on disk
	 * and {@link artifacts} dedupes redundant refreshes structurally.
	 */
	async refresh(): Promise<void> {
		const [logPaths, transcriptPath] = await Promise.all([this._readDebugLogPaths(), this._readTranscriptPath()]);
		this._artifacts.set(buildClaudeDebugArtifacts(logPaths, transcriptPath), undefined);
	}

	/** This session's debug-log files (current + prior runs). The host owns `<logsHome>/claude/`, so scanning it is not cross-component path-guessing. */
	private async _readDebugLogPaths(): Promise<string[]> {
		// Match the exact `claude-<timestamp>-<token>.log` shape emitted by
		// buildClaudeDebugFilePath. A substring `includes(token)` check would also
		// match another session whose id merely contains this token (e.g. `sess-abc`
		// vs `sess-abc-extra`); debug logs can hold sensitive content, so exporting
		// a sibling session's log would be an unsafe cross-session leak. The leading
		// `-` in the suffix keeps the token boundary exact.
		const suffix = `-${claudeDebugLogSessionToken(this._sessionId)}.log`;
		try {
			const stat = await this._fileService.resolve(joinPath(this._logsHome, CLAUDE_LOG_DIR));
			return (stat.children ?? []).filter(c => !c.isDirectory && c.name.startsWith('claude-') && c.name.endsWith(suffix)).map(c => c.resource.fsPath);
		} catch {
			return []; // <logsHome>/claude may not exist yet.
		}
	}

	/**
	 * The SDK session transcript JSONL, once written. The SDK stores it at
	 * `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`; rather than replicate
	 * the cwd-encoding we glob the `projects/*` dirs for `<sessionId>.jsonl`,
	 * preferring the newest (the cwd can change mid-session, e.g. a worktree
	 * adoption). `undefined` until the first turn writes it.
	 */
	private async _readTranscriptPath(): Promise<string | undefined> {
		const fileName = `${this._sessionId}.jsonl`;
		let best: { path: string; mtime: number } | undefined;
		try {
			const stat = await this._fileService.resolve(joinPath(this._userHome, '.claude', 'projects'));
			for (const child of stat.children ?? []) {
				if (!child.isDirectory) {
					continue;
				}
				try {
					const meta = await this._fileService.resolve(joinPath(child.resource, fileName), { resolveMetadata: true });
					if (!meta.isDirectory && (!best || (meta.mtime ?? 0) > best.mtime)) {
						best = { path: meta.resource.fsPath, mtime: meta.mtime ?? 0 };
					}
				} catch {
					// No transcript for this session under this project dir.
				}
			}
		} catch {
			// ~/.claude/projects may not exist yet.
		}
		return best?.path;
	}
}
