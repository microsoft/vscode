/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { extUriBiasedIgnorePathCase, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../common/sessionDataService.js';
import { MessageAttachmentKind, type ChatState, type Message } from '../common/state/sessionState.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';
import type { IAgentHostChatAttachmentCopy, IAgentHostDatabase } from './agentHostDatabase.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

/** How many attachment files one step of the copy takes before it records its progress and yields. */
export const ATTACHMENT_COPY_FILES_PER_STEP = 8;

/**
 * Copies the attachment snapshots a moved chat's messages took in the session it was created in (its recorded origin)
 * into its own storage, under the same relative paths (Block 4b). Deleting the origin, in any build, then loses none of
 * them: a read of a copied file the origin no longer has falls back to the copy ({@link resolveFallback}). Runs in the
 * background, one chat at a time, {@link ATTACHMENT_COPY_FILES_PER_STEP} files per step, and records its progress, so a
 * restart resumes it once the chat's session is restored. A completed copy is reported, so its origin stops keeping its
 * attachments for the chat.
 *
 * Only files the chat's messages reference are copied: the attachment URIs its turns, running turn, steering and queued
 * messages recorded under the origin's attachments directory. A chat whose storage is in its origin (a session moved
 * with it) already has its attachments and copies nothing.
 */
export class AgentHostAttachmentMigration extends Disposable {

	private readonly _copies = new Map<string, IAgentHostChatAttachmentCopy>();
	/** Copied files by the path they were taken from. */
	private readonly _fallbacks = new ResourceMap<URI>(resource => extUriBiasedIgnorePathCase.getComparisonKey(resource));
	/** Moved chats whose copy isn't complete, waiting for their session to be restored so their messages can be read. */
	private readonly _awaiting = new Set<string>();
	private readonly _queue = new Set<string>();
	private _running: Promise<void> | undefined;
	private _resuming: Promise<void> | undefined;
	private readonly _loaded: Promise<void>;

	constructor(
		private readonly _database: IAgentHostDatabase,
		private readonly _stateManager: AgentHostStateManager,
		private readonly _chatOwnership: IAgentHostChatOwnershipService,
		private readonly _fileService: IFileService,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
		private readonly _onDidComplete: (origin: string) => Promise<void>,
	) {
		super();
		this._loaded = this._load();
		this._register(this._chatOwnership.onDidRegisterChat(({ chat }) => {
			if (this._awaiting.delete(chat)) {
				this.schedule([chat]);
			}
		}));
	}

	private async _load(): Promise<void> {
		try {
			for (const [chat, copy] of await this._database.readChatAttachmentCopies()) {
				this._copies.set(chat, copy);
				for (const path of copy.copied) {
					this._indexCopy(copy, path);
				}
			}
		} catch (error) {
			this._logService.warn('[AgentHostAttachmentMigration] Failed to read the attachment copies of moved chats; copies restart', error);
		}
	}

	/** Resumes the copies of `movedChats` (chats a move took out of their origin) that aren't complete. */
	resume(movedChats: Iterable<string>): Promise<void> {
		const chats = [...movedChats];
		const resuming = this._resume(chats);
		this._resuming = resuming;
		return resuming;
	}

	private async _resume(movedChats: readonly string[]): Promise<void> {
		await this._loaded;
		const pending = movedChats.filter(chat => !this._copies.get(chat)?.complete);
		for (const chat of pending) {
			if (this._chatOwnership.getChatOwner(chat) === undefined) {
				this._awaiting.add(chat);
			}
		}
		this.schedule(pending.filter(chat => !this._awaiting.has(chat)));
	}

	/** `session` was restored: the copies of its chats that waited for that resume. */
	resumeSession(session: string): void {
		this.schedule([...this._awaiting].filter(chat => this._chatOwnership.getChatOwner(chat) === session && this._awaiting.delete(chat)));
	}

	/** Copies the pre-move attachments of `chats`, which just moved (in the background; never fails the move). */
	schedule(chats: Iterable<string>): void {
		for (const chat of chats) {
			this._queue.add(chat);
		}
		if (!this._running && this._queue.size && !this._store.isDisposed) {
			this._running = this._drain().finally(() => {
				this._running = undefined;
				if (this._queue.size) {
					this.schedule([]);
				}
			});
		}
	}

	/** The copy of an origin attachment `resource` in the chat's own storage, once copied. */
	resolveFallback(resource: URI): URI | undefined {
		return this._fallbacks.get(resource);
	}

	/** Settles when no copy is running (for tests and shutdown). */
	async whenIdle(): Promise<void> {
		await this._resuming;
		while (this._running) {
			await this._running;
		}
	}

	private async _drain(): Promise<void> {
		await this._loaded;
		for (const chat of this._queue) {
			this._queue.delete(chat);
			if (this._store.isDisposed) {
				return;
			}
			try {
				await this._copy(chat);
			} catch (error) {
				this._logService.warn(`[AgentHostAttachmentMigration] Failed to copy the attachments of ${chat}; it resumes when its session is next restored`, error);
				this._awaiting.add(chat);
			}
		}
	}

	private async _copy(chat: string): Promise<void> {
		const origin = this._stateManager.getMovedChatOrigin(chat);
		const storage = this._chatOwnership.getChatStorageResource(chat);
		if (origin === undefined || storage === undefined) {
			// Back in its origin, or no longer registered.
			return;
		}
		const originRoot = this._attachmentsRoot(origin);
		const ownRoot = this._attachmentsRoot(storage);
		if (extUriBiasedIgnorePathCase.isEqual(originRoot, ownRoot)) {
			return;
		}
		const recorded = this._copies.get(chat);
		if (recorded?.complete && recorded.origin === origin && recorded.storage === storage) {
			return;
		}
		const copied = new Set(recorded?.origin === origin && recorded.storage === storage ? recorded.copied : []);
		const owner = this._chatOwnership.getChatOwner(chat);
		if (owner !== undefined && this._stateManager.isDataOnlySession(owner) && !this._stateManager.getChatState(chat)) {
			// Its session was loaded for the move only, and opening the chat would start its agent (C15): it is copied
			// when its session is restored.
			this._awaiting.add(chat);
			return;
		}
		const state = await this._stateManager.resolveChatState(chat);
		if (!state) {
			this._awaiting.add(chat);
			return;
		}
		const pending = referencedAttachmentPaths(state, originRoot).filter(path => !copied.has(path));
		for (let index = 0; index < pending.length; index += ATTACHMENT_COPY_FILES_PER_STEP) {
			if (this._store.isDisposed) {
				return;
			}
			const current = this._chatOwnership.getChatStorageResource(chat);
			if (current === undefined) {
				// Deleted or unloaded meanwhile: copying on could recreate a deleted chat's storage. Recording the progress
				// tells them apart (only a live chat's is recorded); an unloaded chat's copy resumes once it is restored.
				if (await this._record(chat, { origin, storage, copied: [...copied], complete: false })) {
					this._awaitRegistration(chat);
				}
				return;
			}
			if (current !== storage) {
				// Moved on meanwhile: its move schedules the copy again.
				return;
			}
			for (const path of pending.slice(index, index + ATTACHMENT_COPY_FILES_PER_STEP)) {
				await this._copyFile(originRoot, ownRoot, path);
				copied.add(path);
			}
			if (!await this._record(chat, { origin, storage, copied: [...copied], complete: false })) {
				return;
			}
			// Off every hot path: one step, then whatever else is waiting.
			await timeout(0);
		}
		if (await this._record(chat, { origin, storage, copied: [...copied], complete: true })) {
			await this._onDidComplete(origin);
		}
	}

	/** Resumes the copy of `chat` once it is registered again, also if that happened while its copy was stopping. */
	private _awaitRegistration(chat: string): void {
		this._awaiting.add(chat);
		if (this._chatOwnership.getChatStorageResource(chat) !== undefined && this._awaiting.delete(chat)) {
			this.schedule([chat]);
		}
	}

	/** Records a step of the copy; `false` when the chat was deleted, whose copy then stops and is forgotten. */
	private async _record(chat: string, copy: IAgentHostChatAttachmentCopy): Promise<boolean> {
		if (!await this._database.writeChatAttachmentCopy(chat, copy)) {
			this._copies.delete(chat);
			return false;
		}
		this._copies.set(chat, copy);
		for (const path of copy.copied) {
			this._indexCopy(copy, path);
		}
		return true;
	}

	private _indexCopy(copy: IAgentHostChatAttachmentCopy, path: string): void {
		this._fallbacks.set(joinPath(this._attachmentsRoot(copy.origin), path), joinPath(this._attachmentsRoot(copy.storage), path));
	}

	/** Copies one file through a temporary file, unless the copy is already there; a file already gone is skipped. */
	private async _copyFile(originRoot: URI, ownRoot: URI, path: string): Promise<void> {
		const source = joinPath(originRoot, path);
		const target = joinPath(ownRoot, path);
		const [sourceStat, targetStat] = await Promise.all([this._stat(source), this._stat(target)]);
		if (!sourceStat) {
			if (!targetStat) {
				this._logService.warn(`[AgentHostAttachmentMigration] ${source.toString()} was gone before it could be copied`);
			}
			return;
		}
		if (targetStat?.size === sourceStat.size) {
			return;
		}
		const temporary = joinPath(ownRoot, `${path}.${generateUuid()}.tmp`);
		await this._fileService.copy(source, temporary, true);
		await this._fileService.move(temporary, target, true);
	}

	private async _stat(resource: URI): Promise<{ readonly size: number } | undefined> {
		try {
			return await this._fileService.stat(resource);
		} catch {
			return undefined;
		}
	}

	private _attachmentsRoot(session: string): URI {
		return joinPath(this._sessionDataService.getSessionDataDir(URI.parse(session)), SESSION_ATTACHMENTS_DIRNAME);
	}
}

/** The paths, relative to `root`, of the files under it that a chat's messages attached. */
function referencedAttachmentPaths(state: ChatState, root: URI): readonly string[] {
	const messages: Message[] = [
		...state.turns.map(turn => turn.message),
		...(state.activeTurn ? [state.activeTurn.message] : []),
		...(state.steeringMessage ? [state.steeringMessage.message] : []),
		...(state.queuedMessages ?? []).map(pending => pending.message),
	];
	const paths = new Set<string>();
	for (const message of messages) {
		for (const attachment of message.attachments ?? []) {
			if (attachment.type !== MessageAttachmentKind.Resource || attachment.displayKind === 'directory') {
				continue;
			}
			const resource = URI.parse(attachment.uri);
			const path = extUriBiasedIgnorePathCase.isEqualOrParent(resource, root) ? extUriBiasedIgnorePathCase.relativePath(root, resource) : undefined;
			if (path) {
				paths.add(path);
			}
		}
	}
	return [...paths];
}
