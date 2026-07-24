/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { type IDebugArtifact } from './state/sessionState.js';

/**
 * Subdirectory of the agent host's `logsHome` under which Claude SDK debug
 * logs are written (one file per session materialize), mirroring the sibling
 * `ahp/` directory used by {@link AhpJsonlLogger}.
 */
export const CLAUDE_LOG_DIR = 'claude';

/** Cap embedded id tokens so composed file names stay within FS limits (255 on ext4/APFS). */
const MAX_ID_TOKEN_LENGTH = 64;

/**
 * Formats a {@link Date} as a file-name-safe timestamp (`:`/`.` → `-`), e.g.
 * `2026-07-21T12-34-56-789Z`. Shared by the AHP JSONL logger and the Claude
 * debug-file naming so rotated/segmented files sort lexicographically.
 */
export function toFileTimestamp(date: Date): string {
	return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Sanitizes an arbitrary value (connection id, session id, …) for safe use as
 * part of a file name: any run of path/glob-hostile characters or whitespace
 * collapses to a single `-`, with leading/trailing dashes trimmed. Falls back
 * to `connection` when the input reduces to empty.
 */
export function sanitizeFilePart(value: string): string {
	return value.replace(/[\\/:\*\?"<>\|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'connection';
}

/**
 * The sanitized, length-capped token embedded in a Claude debug-log file name
 * to identify its owning session. Kept as a single helper so the write side
 * ({@link buildClaudeDebugFilePath}) and the export/read side filter agree on
 * the exact token.
 */
export function claudeDebugLogSessionToken(sessionId: string): string {
	return sanitizeFilePart(sessionId).slice(0, MAX_ID_TOKEN_LENGTH);
}

/**
 * Computes the `<logsHome>/claude/` directory and the per-session debug-log
 * file URI (`claude-<timestamp>-<sessionToken>.log`) for a Claude session
 * startup. `timestamp` is supplied by the caller (via {@link toFileTimestamp})
 * so this stays a pure, deterministic projection.
 *
 * The returned `file.fsPath` is passed to the SDK's `Options.debugFile`; the
 * caller should ensure `dir` exists first (`IFileService.createFolder`).
 */
export function buildClaudeDebugFilePath(logsHome: URI, sessionId: string, timestamp: string): { readonly dir: URI; readonly file: URI } {
	const dir = joinPath(logsHome, CLAUDE_LOG_DIR);
	const file = joinPath(dir, `claude-${timestamp}-${claudeDebugLogSessionToken(sessionId)}.log`);
	return { dir, file };
}

/**
 * Labels for a Claude session's advertised debug artifacts. Each label also
 * derives the export file name (via {@link sanitizeFilePart}), so debug logs are
 * numbered to keep those names unique per session.
 */
export const CLAUDE_DEBUG_LOG_LABEL = 'Claude debug log';
export const CLAUDE_TRANSCRIPT_LABEL = 'Claude transcript';

/**
 * Build the advertised {@link IDebugArtifact} list for a Claude session from its
 * on-disk debug-log paths plus an optional transcript path. A pure projection,
 * so the labeling/numbering is unit-testable without any session state: logs are
 * sorted lexically (their file names embed the timestamp, so this is
 * chronological) and numbered only when there is more than one — keeping the
 * single-log common case clean while ensuring unique export file names.
 */
export function buildClaudeDebugArtifacts(logPaths: readonly string[], transcriptPath: string | undefined): IDebugArtifact[] {
	const sorted = [...logPaths].sort();
	const artifacts: IDebugArtifact[] = sorted.map((path, i) => ({
		label: sorted.length > 1 ? `${CLAUDE_DEBUG_LOG_LABEL} ${i + 1}` : CLAUDE_DEBUG_LOG_LABEL,
		path,
	}));
	if (transcriptPath) {
		artifacts.push({ label: CLAUDE_TRANSCRIPT_LABEL, path: transcriptPath });
	}
	return artifacts;
}

/**
 * Encodes a working directory into the Claude CLI's transcript "project" slug —
 * every non-alphanumeric character becomes `-`, e.g. `/Users/foo/my-proj` →
 * `-Users-foo-my-proj` and `C:\foo\bar` → `C--foo-bar`. The CLI slugs its native
 * `process.cwd()`, so two caveats for a caller holding a VS Code URI's `fsPath`:
 * it resolves symlinks (`/tmp` → `/private/tmp`), and on Windows it keeps the
 * drive letter uppercase while VS Code lowercases it — so we re-uppercase a
 * leading `<drive>:` here. A mismatch is best-effort: the caller should have a
 * scan fallback.
 */
export function claudeProjectSlug(cwd: string): string {
	return cwd.replace(/^([a-zA-Z]):/, (_, drive: string) => `${drive.toUpperCase()}:`).replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * The Claude CLI session transcript path for a working directory + session id:
 * `<userHome>/.claude/projects/<slug>/<sessionId>.jsonl` (see
 * {@link claudeProjectSlug}). A pure projection, so resolving the transcript is a
 * single deterministic `stat` rather than a scan of every project directory.
 */
export function buildClaudeTranscriptPath(userHome: URI, cwd: string, sessionId: string): URI {
	return joinPath(userHome, '.claude', 'projects', claudeProjectSlug(cwd), `${sessionId}.jsonl`);
}
