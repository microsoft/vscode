/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { AgentsVoiceStorageKeys } from './agentsVoice.js';

/**
 * Discriminates what produced this entry. Only ``user_voice`` and
 * ``agent_voice`` are rendered in the transcripts UI; ``agent_tool_call`` and
 * ``coding_event`` are persisted so we can replay them as cross-session
 * context to the backend without polluting the visible transcript.
 *
 *   user_voice       — what the user said (ASR-committed)
 *   agent_voice      — what the voice agent spoke back (TTS text)
 *   agent_tool_call  — a tool the voice agent dispatched (send_to_chat, etc.)
 *   coding_event     — a status transition on a Copilot coding session
 *                       (started, finished, needs-input, errored)
 */
export type VoiceTranscriptKind =
	| 'user_voice'
	| 'agent_voice'
	| 'agent_tool_call'
	| 'coding_event';

/**
 * Free-form metadata for non-voice entries. Field meaning depends on ``kind``:
 *   agent_tool_call: { toolName, toolArgs? }
 *   coding_event:    { codingSessionId, codingStatus, codingSessionLabel? }
 */
export interface IVoiceTranscriptEntryMetadata {
	readonly toolName?: string;
	readonly toolArgs?: Record<string, unknown>;
	readonly codingSessionId?: string;
	readonly codingStatus?: string;
	readonly codingSessionLabel?: string;
}

/**
 * One committed entry in a voice conversation timeline. Persisted as a single
 * JSON line in the user's transcript JSONL file.
 *
 * Local-only — voice_code's backend does not have persistent conversation
 * memory today. Entry IDs are generated client-side; ``ancestorIds`` chains
 * the entries we have written so far.
 *
 * Backwards-compat note: older builds wrote entries without ``kind`` /
 * ``metadata`` and only with ``role``. The store auto-wipes any such file on
 * first read so we never have to read mixed-schema data in memory.
 */
export interface IVoiceTranscriptTurn {
	/** Locally-generated entry id. */
	readonly turnId: string;
	/** Local ancestor entry ids, root → parent (the previous entry's turnId, or empty for the first entry). */
	readonly ancestorIds: readonly string[];
	/** What produced this entry. */
	readonly kind: VoiceTranscriptKind;
	/**
	 * Legacy/display role. Kept so the existing transcripts ViewPane can
	 * label rows without inspecting ``kind``. For non-voice kinds this is set
	 * to ``'assistant'`` (the entry is something the agent did).
	 */
	readonly role: 'user' | 'assistant';
	/**
	 * Human-readable text for this entry. For voice kinds this is the spoken
	 * sentence. For tool-call / coding-event kinds it is a one-line summary
	 * suitable for context replay (e.g. ``"called send_to_chat(text=...)"``).
	 */
	readonly text: string;
	/** Wall-clock time at the moment of persistence. ISO 8601 string. */
	readonly timestamp: string;
	/** Optional kind-specific structured fields. */
	readonly metadata?: IVoiceTranscriptEntryMetadata;
}

/**
 * Index of all transcripts known on this machine. Persisted via
 * ``IStorageService`` (scope PROFILE, target MACHINE). One entry per
 * GitHub login that has ever spoken on this machine.
 */
export interface IVoiceTranscriptIndex {
	readonly entries: { [userId: string]: IVoiceTranscriptIndexEntry };
	readonly version: 1;
}

export interface IVoiceTranscriptIndexEntry {
	/** GitHub login — partition key, doubles as filename stem. */
	readonly userId: string;
	/** ISO timestamp of first ever turn for this user. */
	readonly createdAt: string;
	/** ISO timestamp of most recent appended turn. */
	readonly lastUpdatedAt: string;
	/** Total turn count for this user. */
	readonly turnCount: number;
	/** Optional archive cutoff. Turns with timestamp < archivedBefore are hidden in the UI by default. */
	readonly archivedBefore?: string;
}

export const IVoiceTranscriptStore = createDecorator<IVoiceTranscriptStore>('voiceTranscriptStore');

export interface IVoiceTranscriptStore {
	readonly _serviceBrand: undefined;

	/**
	 * Append a committed (final) turn to the user's transcript. Writes are
	 * serialized via a queue so concurrent calls preserve ordering.
	 */
	appendTurn(userId: string, turn: IVoiceTranscriptTurn): Promise<void>;

	/**
	 * Load turns for a user in chronological order. Optional time / count filters.
	 */
	loadTurns(userId: string, opts?: { since?: string; limit?: number }): Promise<IVoiceTranscriptTurn[]>;

	/**
	 * Index entry for one user (undefined if no turns have ever been persisted).
	 */
	getIndexEntry(userId: string): IVoiceTranscriptIndexEntry | undefined;

	/**
	 * Hide all turns with ``timestamp < cutoff`` from the default UI view.
	 * Non-destructive — the JSONL is untouched.
	 */
	archiveUpTo(userId: string, cutoff: string): Promise<void>;

	/** Clear the archive cutoff so all turns are visible again. */
	unarchive(userId: string): Promise<void>;

	/**
	 * Permanently delete a user's transcript JSONL and index entry.
	 */
	deleteAll(userId: string): Promise<void>;
}

/**
 * Local on-disk transcript store for the Agents Voice feature.
 *
 * Layout (mirrors the chatSessionStore precedent, adapted for the per-user
 * single-conversation model used by voice):
 *
 *   <globalStorageHome>/voiceTranscripts/<githubLogin>.jsonl   (append-only)
 *   IStorageService[AgentsVoiceStorageKeys.TranscriptIndex]    (PROFILE/MACHINE)
 *
 * Writes are serialized via a ``Sequencer`` so simultaneous appendTurn calls
 * preserve line ordering. A shutdown flush is registered so a final append
 * completes before the window closes.
 */
export class VoiceTranscriptStore extends Disposable implements IVoiceTranscriptStore {

	declare readonly _serviceBrand: undefined;

	private readonly storageRoot: URI;
	private readonly writeQueue = new Sequencer();

	/** Cached snapshot of the index; we read once at startup and write through. */
	private indexCache: IVoiceTranscriptIndex;

	private pendingWrite: Promise<void> | undefined;
	private shuttingDown = false;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.storageRoot = joinPath(
			userDataProfilesService.defaultProfile.globalStorageHome,
			'voiceTranscripts'
		);

		this.indexCache = this.readIndexFromStorage();

		this._register(this.lifecycleService.onWillShutdown(e => {
			this.shuttingDown = true;
			if (!this.pendingWrite) {
				return;
			}
			e.join(this.pendingWrite, {
				id: 'join.voiceTranscriptStore',
				label: localize('join.voiceTranscriptStore', "Saving voice transcript")
			});
		}));
	}

	// --- Public API ---

	async appendTurn(userId: string, turn: IVoiceTranscriptTurn): Promise<void> {
		if (this.shuttingDown) {
			this.logService.warn(`VoiceTranscriptStore: ignoring appendTurn for ${userId} (shutting down)`);
			return;
		}

		const work = this.writeQueue.queue(() => this.doAppendTurn(userId, turn));
		this.pendingWrite = work;
		try {
			await work;
		} finally {
			if (this.pendingWrite === work) {
				this.pendingWrite = undefined;
			}
		}
	}

	async loadTurns(userId: string, opts?: { since?: string; limit?: number }): Promise<IVoiceTranscriptTurn[]> {
		const file = this.fileFor(userId);
		let raw: string;
		try {
			const content = await this.fileService.readFile(file);
			raw = content.value.toString();
		} catch (e) {
			if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND) {
				return [];
			}
			this.logService.error(`VoiceTranscriptStore: failed to read transcript for ${userId}`, e);
			return [];
		}

		const turns: IVoiceTranscriptTurn[] = [];
		let sawLegacyEntry = false;
		for (const line of raw.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			try {
				const parsed = JSON.parse(trimmed) as Partial<IVoiceTranscriptTurn>;
				// Legacy entries (pre-timeline schema) had no ``kind`` field. We
				// deliberately do NOT in-memory migrate them — the kind for a
				// legacy ``assistant`` row was ambiguous (voice reply vs.
				// summary vs. tool-call narration), so we wipe and start fresh.
				if (!parsed.kind) {
					sawLegacyEntry = true;
					break;
				}
				if (opts?.since && parsed.timestamp && parsed.timestamp < opts.since) {
					continue;
				}
				turns.push(parsed as IVoiceTranscriptTurn);
			} catch (e) {
				this.logService.warn(`VoiceTranscriptStore: skipping malformed line in ${userId}.jsonl: ${(e as Error).message}`);
			}
		}

		if (sawLegacyEntry) {
			this.logService.info(`VoiceTranscriptStore: detected pre-timeline transcript for ${userId}, wiping for new schema`);
			await this.deleteAll(userId);
			return [];
		}

		if (opts?.limit !== undefined && turns.length > opts.limit) {
			return turns.slice(turns.length - opts.limit);
		}
		return turns;
	}

	getIndexEntry(userId: string): IVoiceTranscriptIndexEntry | undefined {
		return this.indexCache.entries[userId];
	}

	async archiveUpTo(userId: string, cutoff: string): Promise<void> {
		const existing = this.indexCache.entries[userId];
		if (!existing) {
			return;
		}
		this.updateIndexEntry(userId, { ...existing, archivedBefore: cutoff });
	}

	async unarchive(userId: string): Promise<void> {
		const existing = this.indexCache.entries[userId];
		if (!existing) {
			return;
		}
		const { archivedBefore: _unused, ...rest } = existing;
		this.updateIndexEntry(userId, rest);
	}

	async deleteAll(userId: string): Promise<void> {
		const file = this.fileFor(userId);
		try {
			await this.fileService.del(file);
		} catch (e) {
			if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(`VoiceTranscriptStore: failed to delete transcript for ${userId}`, e);
			}
		}
		// Remove from index regardless of file deletion result.
		const next = { ...this.indexCache.entries };
		delete next[userId];
		this.indexCache = { ...this.indexCache, entries: next };
		this.flushIndex();
	}

	// --- Internals ---

	private fileFor(userId: string): URI {
		// Sanitize userId to prevent path traversal — strip anything that isn't
		// alphanumeric or hyphen (GitHub logins are [A-Za-z0-9-], max 39 chars).
		const safe = userId.replace(/[^A-Za-z0-9-]/g, '_');
		if (!safe) {
			throw new Error('Invalid userId for transcript storage');
		}
		return joinPath(this.storageRoot, `${safe}.jsonl`);
	}

	private async doAppendTurn(userId: string, turn: IVoiceTranscriptTurn): Promise<void> {
		const file = this.fileFor(userId);
		const line = JSON.stringify(turn) + '\n';

		try {
			// Ensure the voiceTranscripts directory exists
			try {
				await this.fileService.createFolder(this.storageRoot);
			} catch {
				// Folder may already exist — ignore
			}
			await this.fileService.writeFile(file, VSBuffer.fromString(line), { append: true });
		} catch (e) {
			this.logService.error(`VoiceTranscriptStore: failed to append turn for ${userId}`, e);
			return;
		}

		const existing = this.indexCache.entries[userId];
		const next: IVoiceTranscriptIndexEntry = existing
			? {
				...existing,
				lastUpdatedAt: turn.timestamp,
				turnCount: existing.turnCount + 1,
			}
			: {
				userId,
				createdAt: turn.timestamp,
				lastUpdatedAt: turn.timestamp,
				turnCount: 1,
			};

		this.updateIndexEntry(userId, next);
	}

	private updateIndexEntry(userId: string, entry: IVoiceTranscriptIndexEntry): void {
		this.indexCache = {
			...this.indexCache,
			entries: { ...this.indexCache.entries, [userId]: entry },
		};
		this.flushIndex();
	}

	private flushIndex(): void {
		try {
			this.storageService.store(
				AgentsVoiceStorageKeys.TranscriptIndex,
				JSON.stringify(this.indexCache),
				StorageScope.PROFILE,
				StorageTarget.MACHINE,
			);
		} catch (e) {
			this.logService.error(`VoiceTranscriptStore: failed to flush transcript index`, e);
		}
	}

	private readIndexFromStorage(): IVoiceTranscriptIndex {
		const raw = this.storageService.get(
			AgentsVoiceStorageKeys.TranscriptIndex,
			StorageScope.PROFILE,
		);
		if (!raw) {
			return { entries: {}, version: 1 };
		}
		try {
			const parsed = JSON.parse(raw) as IVoiceTranscriptIndex;
			if (parsed && typeof parsed === 'object' && parsed.entries && parsed.version === 1) {
				return parsed;
			}
			this.logService.warn('VoiceTranscriptStore: ignoring index with unknown shape, starting fresh');
		} catch (e) {
			this.logService.warn('VoiceTranscriptStore: failed to parse stored index, starting fresh', e);
		}
		return { entries: {}, version: 1 };
	}
}

registerSingleton(IVoiceTranscriptStore, VoiceTranscriptStore, InstantiationType.Delayed);
