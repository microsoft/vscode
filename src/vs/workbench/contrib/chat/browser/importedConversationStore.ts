/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IImportedConversationTurn } from '../common/importedConversation.js';

export const IImportedConversationStore = createDecorator<IImportedConversationStore>('importedConversationStore');

/**
 * Persists per-session snapshots of a prior conversation that was continued
 * ("Continue in…") into an agent session, so the agent host session handler can
 * render it inline (read-only) on every open, including after a reload.
 *
 * The snapshot is stored in the session's own agent-host database (via
 * {@link IAgentHostService.setSessionImportedConversation}), so persistence,
 * fork (the database is copied with the session) and delete (the database is
 * removed with the session) are all managed for free. A short-lived in-memory
 * bridge covers the window before a provisional (`untitled-…`) session has
 * graduated to its real backend resource and therefore has a database.
 */
export interface IImportedConversationStore {
	readonly _serviceBrand: undefined;

	/** Persists (or, for an empty array, clears) the snapshot for a session resource. */
	store(resource: URI, turns: readonly IImportedConversationTurn[]): Promise<void>;

	/** Reads the snapshot for a session resource, or `undefined` when none exists. */
	read(resource: URI): Promise<IImportedConversationTurn[] | undefined>;

	/**
	 * Moves a snapshot from one resource to another. Used when a session graduates
	 * from its provisional (`untitled-…`) identity to the real backend resource,
	 * flushing the bridged snapshot into the real session's database.
	 */
	rename(oldResource: URI, newResource: URI): Promise<void>;

	/** Removes the snapshot for a session resource (e.g. when the session is deleted). */
	delete(resource: URI): Promise<void>;
}

export class ImportedConversationStore extends Disposable implements IImportedConversationStore {

	declare readonly _serviceBrand: undefined;

	/**
	 * Bridges snapshots for sessions that are not yet materialized on the agent
	 * host: their provisional (`untitled-…`) resource has no session database
	 * yet. Entries are flushed to the real session's database by {@link rename}
	 * when the session graduates to its backend resource, after which the
	 * database is the source of truth and survives reloads and forks.
	 */
	private readonly _pending = new Map<string, readonly IImportedConversationTurn[]>();

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	/**
	 * Whether `resource` is still a provisional session that has no backend
	 * database yet. The agent host session handler rejects `untitled-…` resources
	 * for the same reason, so we bridge their snapshots in memory until they are
	 * renamed onto a real resource.
	 */
	private _isProvisional(resource: URI): boolean {
		return resource.path.substring(1).startsWith('untitled-');
	}

	async store(resource: URI, turns: readonly IImportedConversationTurn[]): Promise<void> {
		if (turns.length === 0) {
			// Clear (session still alive): drop the bridge entry and, for a
			// materialized session, overwrite the persisted snapshot with an empty
			// marker. Unlike delete(), this is safe to persist because the session
			// is not being disposed.
			this._pending.delete(resource.toString());
			if (!this._isProvisional(resource)) {
				await this._persist(resource, []);
			}
			return;
		}
		this._pending.set(resource.toString(), turns);
		if (!this._isProvisional(resource)) {
			await this._persist(resource, turns);
		}
	}

	async read(resource: URI): Promise<IImportedConversationTurn[] | undefined> {
		if (!this._isProvisional(resource)) {
			try {
				const raw = await this._agentHostService.getSessionImportedConversation(resource);
				const parsed = raw ? this._parse(raw) : undefined;
				if (parsed && parsed.length > 0) {
					return parsed;
				}
				// An empty persisted snapshot means "explicitly cleared": treat it as
				// none and do not fall back to a stale bridge entry.
				if (parsed) {
					return undefined;
				}
			} catch (err) {
				this._logService.warn('[ImportedConversationStore] Failed to read imported conversation', err);
			}
		}
		const pending = this._pending.get(resource.toString());
		return pending ? [...pending] : undefined;
	}

	async rename(oldResource: URI, newResource: URI): Promise<void> {
		const turns = await this.read(oldResource);
		this._pending.delete(oldResource.toString());
		// Leave nothing behind at the source. Provisional sources have no
		// database entry (bridge-only); a materialized source is a live session,
		// so clearing its persisted snapshot is safe (not the disposal path).
		if (!this._isProvisional(oldResource)) {
			await this._persist(oldResource, []);
		}
		if (!turns || turns.length === 0) {
			return;
		}
		this._pending.set(newResource.toString(), turns);
		if (!this._isProvisional(newResource)) {
			await this._persist(newResource, turns);
		}
	}

	async delete(resource: URI): Promise<void> {
		// Only the in-memory bridge is cleared here: the persisted snapshot lives
		// in the session database, which is removed with the session itself. We
		// deliberately do NOT re-open the database to clear it, which could
		// resurrect an orphan database for an already-disposed session.
		this._pending.delete(resource.toString());
	}

	private async _persist(resource: URI, turns: readonly IImportedConversationTurn[]): Promise<void> {
		try {
			await this._agentHostService.setSessionImportedConversation(resource, JSON.stringify([...turns]));
		} catch (err) {
			this._logService.warn('[ImportedConversationStore] Failed to persist imported conversation', err);
		}
	}

	private _parse(raw: string): IImportedConversationTurn[] | undefined {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed as IImportedConversationTurn[] : undefined;
		} catch (err) {
			this._logService.warn('[ImportedConversationStore] Failed to parse imported conversation', err);
			return undefined;
		}
	}
}
