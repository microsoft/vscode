/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { ISessionDataService } from '../../common/sessionDataService.js';

/**
 * Per-session bookkeeping codex needs to persist across agent host
 * restarts. The fundamental tension this store resolves: codex's
 * `thread/start` mints the canonical thread id server-side, but the
 * workbench owns the chat session URI and refuses to accept a different
 * one back from `createSession`. We therefore keep a stable mapping
 * `workbench session URI ↔ codex thread id` here so restored sessions
 * can be resumed without leaking duplicate sidebar entries.
 *
 * Layout (per-session SQLite DB, opened via {@link ISessionDataService}):
 *   `codex.threadId` — the codex app-server thread id assigned at
 *                      materialize time.
 *   `codex.cwd`      — absolute path to the working directory the
 *                      session was created against (URI string).
 *   `codex.model`    — serialized {@link ModelSelection.id} string,
 *                      remembered for restore so resumed sessions reuse
 *                      the model picked during the prior process.
 */

export interface ICodexSessionOverlay {
	readonly threadId?: string;
	readonly cwd?: URI;
	readonly modelId?: string;
}

export interface ICodexSessionOverlayUpdate {
	readonly threadId?: string;
	readonly cwd?: URI;
	readonly modelId?: string;
}

export class CodexSessionMetadataStore {

	private static readonly KEY_THREAD_ID = 'codex.threadId';
	private static readonly KEY_CWD = 'codex.cwd';
	private static readonly KEY_MODEL = 'codex.model';

	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/**
	 * Persist the supplied overlay fields. Only-write-on-defined.
	 * Best-effort: failures are logged and swallowed because the caller
	 * has already committed in-memory state and a corrupt DB shouldn't
	 * abort the current turn.
	 */
	async write(session: URI, fields: ICodexSessionOverlayUpdate): Promise<void> {
		try {
			const ref = this._sessionDataService.openDatabase(session);
			const db = ref.object;
			try {
				const work: Promise<void>[] = [];
				if (fields.threadId !== undefined) {
					work.push(db.setMetadata(CodexSessionMetadataStore.KEY_THREAD_ID, fields.threadId));
				}
				if (fields.cwd !== undefined) {
					work.push(db.setMetadata(CodexSessionMetadataStore.KEY_CWD, fields.cwd.toString()));
				}
				if (fields.modelId !== undefined) {
					work.push(db.setMetadata(CodexSessionMetadataStore.KEY_MODEL, fields.modelId));
				}
				await Promise.all(work);
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[Codex] metadata write failed for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Read overlay fields for `session`. Returns `{}` when no DB has
	 * been created yet (fresh session, or external codex CLI thread the
	 * workbench has never touched).
	 */
	async read(session: URI): Promise<ICodexSessionOverlay> {
		try {
			const ref = await this._sessionDataService.tryOpenDatabase(session);
			if (!ref) {
				return {};
			}
			try {
				const [threadId, cwdRaw, modelId] = await Promise.all([
					ref.object.getMetadata(CodexSessionMetadataStore.KEY_THREAD_ID),
					ref.object.getMetadata(CodexSessionMetadataStore.KEY_CWD),
					ref.object.getMetadata(CodexSessionMetadataStore.KEY_MODEL),
				]);
				return {
					threadId: threadId ?? undefined,
					cwd: cwdRaw ? URI.parse(cwdRaw) : undefined,
					modelId: modelId ?? undefined,
				};
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[Codex] metadata read failed for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			return {};
		}
	}
}
