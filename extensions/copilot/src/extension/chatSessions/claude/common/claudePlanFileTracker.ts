/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeEnvService } from '../../../../platform/env/common/envService';
import { extUriBiasedIgnorePathCase } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { createDecorator } from '../../../../util/vs/platform/instantiation/common/instantiation';

export const IClaudePlanFileTracker = createDecorator<IClaudePlanFileTracker>('claudePlanFileTracker');

/**
 * Per-session tracker for the markdown plan file Claude writes to
 * `~/.claude/plans/` before invoking `ExitPlanMode`.
 *
 * Recording happens in the SDK message dispatch (see
 * `handleAssistantMessage` in `claudeMessageDispatch.ts`) so we observe
 * every `Write`/`Edit`/`MultiEdit` `tool_use` block regardless of
 * permission mode — `bypassPermissions` short-circuits `canUseTool`,
 * and the SDK may write the plan file via internal paths that skip
 * `canUseTool` entirely. The `ExitPlanMode` permission handler then
 * reads the recorded URI to surface the plan file in the review widget
 * — without scanning the filesystem on the permission path.
 *
 * Entries are keyed by Claude session id so distinct concurrent
 * sessions don't see each other's plan files. Callers are expected to
 * `clear(sessionId)` when a session is disposed; in practice the map
 * is small (one URI per active session) and a missing clear is not a
 * correctness issue, only a memory hint.
 */
export interface IClaudePlanFileTracker {
	readonly _serviceBrand: undefined;

	/**
	 * Record `filePath` against `sessionId` if it points at a markdown
	 * file directly inside the Claude plan directory
	 * (`~/.claude/plans/`). Other paths are ignored.
	 */
	recordIfPlanFile(sessionId: string, filePath: string): void;

	/**
	 * The URI most recently recorded for `sessionId` via
	 * {@link recordIfPlanFile}, or `undefined` if none has been seen.
	 */
	getLastPlanFile(sessionId: string): URI | undefined;

	/**
	 * Drop any state held for `sessionId`. Safe to call when no entry
	 * exists.
	 */
	clear(sessionId: string): void;
}

export class ClaudePlanFileTracker implements IClaudePlanFileTracker {
	declare readonly _serviceBrand: undefined;

	private readonly _planDirUri: URI;
	private readonly _lastPlanFiles = new Map<string, URI>();

	constructor(
		@INativeEnvService envService: INativeEnvService,
	) {
		this._planDirUri = URI.joinPath(envService.userHome, '.claude', 'plans');
	}

	public recordIfPlanFile(sessionId: string, filePath: string): void {
		if (!sessionId || !filePath || !filePath.toLowerCase().endsWith('.md')) {
			return;
		}
		const candidate = URI.file(filePath);
		// Direct child of the plan directory only. Use a path-case-aware
		// comparison so the SDK handing back the same path with different
		// casing on Windows / case-insensitive macOS volumes still matches.
		const parent = URI.joinPath(candidate, '..');
		if (!extUriBiasedIgnorePathCase.isEqual(parent, this._planDirUri)) {
			return;
		}
		this._lastPlanFiles.set(sessionId, candidate);
	}

	public getLastPlanFile(sessionId: string): URI | undefined {
		return this._lastPlanFiles.get(sessionId);
	}

	public clear(sessionId: string): void {
		this._lastPlanFiles.delete(sessionId);
	}
}
