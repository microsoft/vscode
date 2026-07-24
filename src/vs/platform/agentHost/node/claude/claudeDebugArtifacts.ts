/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { buildClaudeDebugArtifacts, buildClaudeDebugFilePath, buildClaudeTranscriptPath, CLAUDE_LOG_DIR, claudeDebugLogSessionToken, toFileTimestamp } from '../../common/agentHostLogNaming.js';
import { type IDebugArtifact } from '../../common/state/sessionState.js';

/**
 * Discovers a Claude session's debug artifacts (the SDK `--debug` log files plus
 * the session transcript JSONL) from disk. Kept separate from
 * {@link ClaudeAgentSession} so the disk I/O is unit-testable against an
 * in-memory {@link IFileService}.
 *
 * Stateless: {@link refresh} reads the two on-disk locations and returns the
 * projected set — the session owns publishing it into `_meta`. Depends only on
 * the two home URIs (not the environment service), so a test needs nothing more
 * than an in-memory file service and two paths.
 */
export class ClaudeDebugArtifacts {

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
	 * Read the two on-disk locations the host/SDK own for this session and return
	 * the projected artifact set via the pure, unit-tested
	 * {@link buildClaudeDebugArtifacts}. `cwd` is the session's working directory,
	 * used to address the transcript directly. Stateless: the truth lives on disk,
	 * so callers just re-read whenever the set might have changed.
	 */
	async refresh(cwd: URI): Promise<readonly IDebugArtifact[]> {
		const [logPaths, transcriptPath] = await Promise.all([this._readDebugLogPaths(), this._readTranscriptPath(cwd)]);
		return buildClaudeDebugArtifacts(logPaths, transcriptPath);
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
	 * The SDK session transcript JSONL, once written. The CLI stores it at a
	 * deterministic `~/.claude/projects/<slug>/<sessionId>.jsonl` derived from the
	 * cwd (see {@link buildClaudeTranscriptPath}), so this is a single `stat` — not
	 * a scan of every project directory. `undefined` until the first turn writes it
	 * (or if the cwd's resolved slug differs, e.g. a symlinked path — best-effort).
	 */
	private async _readTranscriptPath(cwd: URI): Promise<string | undefined> {
		try {
			const meta = await this._fileService.resolve(buildClaudeTranscriptPath(this._userHome, cwd.fsPath, this._sessionId), { resolveMetadata: true });
			return meta.isDirectory ? undefined : meta.resource.fsPath;
		} catch {
			return undefined; // Not written yet, or the cwd doesn't map to an on-disk project dir.
		}
	}
}
