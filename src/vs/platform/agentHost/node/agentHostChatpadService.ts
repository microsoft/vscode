/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { extUri, extUriIgnorePathCase, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, FileSystemProviderCapabilities, IFileService, toFileOperationResult, type IFileStatWithPartialMetadata } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agent.js';
import type { IAgentHostChatpad } from '../common/agentService.js';
import { workspacelessScratchDir } from '../common/workspacelessScratchDir.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';

export const IAgentHostChatpadService = createDecorator<IAgentHostChatpadService>('agentHostChatpadService');

/**
 * Looks up the host's sessions for the Chatpad service. The Chatpad chat counts as existing while clients can list
 * it, or before its first request while it is live; an unused chat that is collected stops existing.
 */
export interface IAgentHostChatpadSessions {
	/**
	 * The session `session`, with its agent provider when known; `undefined` when it isn't available now, and
	 * `'removed'` when the host no longer knows it, such as after it was deleted. Looks up that one session only.
	 */
	find(session: string): Promise<{ readonly provider: string | undefined } | 'removed' | undefined>;
}

/**
 * Owns the host's single Chatpad: a session without a workspace whose chat maintains a Markdown note.
 *
 * Like a chat without a workspace, the Chatpad chat works in its own scratch folder (see
 * {@link workspacelessScratchDir}), and the note is a file in it: deleting the chat, or collecting it as an unused
 * draft, removes the folder and the note with it. Its session is typed as the Chatpad rather than as a chat without
 * a workspace, and is not listed.
 */
export interface IAgentHostChatpadService {
	readonly _serviceBrand: undefined;
	/** The Chatpad chat's session, when one was claimed; it may have been removed since. */
	readonly session: string | undefined;
	/** Whether `session` is the Chatpad chat. */
	isChatpad(session: string): boolean;
	/** Whether `resource` is the note of the Chatpad chat. */
	isNote(resource: URI): boolean;
	/** The note of the Chatpad chat `session`. */
	getNote(session: string): URI;
	/** Returns the Chatpad, creating its note when missing; `undefined` when there is no Chatpad chat. */
	getChatpad(sessions: IAgentHostChatpadSessions): Promise<IAgentHostChatpad | undefined>;
	/**
	 * Makes `session` the Chatpad chat unless another Chatpad chat exists, or its id is not a plain file name, in
	 * which case `session` stays an ordinary chat. Resolves to whether `session` is the Chatpad chat.
	 */
	claim(session: URI, sessions: IAgentHostChatpadSessions): Promise<boolean>;
	/** Appends `text` to the note as its own line(s), creating the note when missing. Fails without a Chatpad chat. */
	append(text: string, sessions: IAgentHostChatpadSessions): Promise<void>;
}

const CHATPAD_SESSION_STORAGE_KEY = 'chatpad.session';
const NOTE_TEMPLATE = '# Chatpad\n\n';
const MAX_APPEND_ATTEMPTS = 3;

/**
 * Whether `id` is a plain file name, so that the scratch folder of its session, and the note in it, is a direct
 * child of the chats root. Clients choose session ids, the note is approved for writing without consent, and its
 * path is part of the Chatpad chat's instructions, so only letters, digits, `.`, `_` and `-` are accepted. A
 * trailing dot, which Windows drops, also rules out `.` and `..`.
 */
function isSafeSessionId(id: string): boolean {
	return /^[A-Za-z0-9._-]+$/.test(id) && !id.endsWith('.');
}

/**
 * The note of the Chatpad chat `session` on a host whose user home is `userHome`: a file in the chat's scratch folder.
 * Throws when the session's id is not a plain file name.
 */
export function getChatpadNote(userHome: URI, session: URI | string): URI {
	const id = AgentSession.id(session);
	if (!isSafeSessionId(id)) {
		throw new Error(`The session ${session.toString()} has no Chatpad note: its id is not a plain file name.`);
	}
	return joinPath(workspacelessScratchDir(userHome, id), 'chatpad.md');
}

export class AgentHostChatpadService extends Disposable implements IAgentHostChatpadService {
	declare readonly _serviceBrand: undefined;

	private readonly _sequencer = new Sequencer();

	constructor(
		private readonly _userHome: URI,
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	get session(): string | undefined {
		const value = this._storageService.get<unknown>(CHATPAD_SESSION_STORAGE_KEY);
		return typeof value === 'string' && value.length > 0 && isSafeSessionId(AgentSession.id(value)) ? value : undefined;
	}

	isChatpad(session: string): boolean {
		return this.session === session;
	}

	isNote(resource: URI): boolean {
		const session = this.session;
		if (session === undefined) {
			return false;
		}
		// Exactly the note: a sibling whose name differs only in case is another file where case matters.
		const note = this.getNote(session);
		const pathCase = this._fileService.hasCapability(note, FileSystemProviderCapabilities.PathCaseSensitive) ? extUri : extUriIgnorePathCase;
		return pathCase.isEqual(resource, note);
	}

	getNote(session: string): URI {
		return getChatpadNote(this._userHome, session);
	}

	getChatpad(sessions: IAgentHostChatpadSessions): Promise<IAgentHostChatpad | undefined> {
		return this._sequencer.queue(async () => {
			const session = this.session;
			const found = session === undefined ? undefined : await this._find(sessions, session);
			if (session === undefined || !found) {
				return undefined;
			}
			const note = this.getNote(session);
			await this._ensureNote(note);
			return { note, session: URI.parse(session), provider: found.provider };
		});
	}

	claim(session: URI, sessions: IAgentHostChatpadSessions): Promise<boolean> {
		if (!isSafeSessionId(AgentSession.id(session))) {
			this._logService.warn(`[AgentHostChatpad] ${session.toString()} stays an ordinary chat: its id is not a plain file name`);
			return Promise.resolve(false);
		}
		return this._sequencer.queue(async () => {
			const key = session.toString();
			const current = this.session;
			if (current === key) {
				return true;
			}
			if (current !== undefined && await this._exists(sessions, current)) {
				this._logService.info(`[AgentHostChatpad] ${key} stays an ordinary chat: Chatpad chat ${current} exists`);
				return false;
			}
			// The note first: a claim that cannot have a note must not leave a hidden Chatpad chat behind.
			await this._ensureNote(this.getNote(key));
			await this._storageService.setAndFlush(CHATPAD_SESSION_STORAGE_KEY, key);
			return true;
		});
	}

	append(text: string, sessions: IAgentHostChatpadSessions): Promise<void> {
		return this._sequencer.queue(async () => {
			const session = this.session;
			if (session === undefined || !await this._exists(sessions, session)) {
				throw new Error('There is no Chatpad chat to append to.');
			}
			const note = this.getNote(session);
			await this._ensureNote(note);
			const line = text.endsWith('\n') ? text : `${text}\n`;
			// The Chatpad chat edits the note too: write only over the content that was read, and read again when it changed.
			for (let attempt = 1; ; attempt++) {
				const { value, mtime, etag } = await this._fileService.readFile(note);
				const content = value.toString();
				const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n';
				try {
					await this._fileService.writeFile(note, VSBuffer.fromString(`${content}${separator}${line}`), { mtime, etag });
					return;
				} catch (error) {
					if (attempt >= MAX_APPEND_ATTEMPTS || !(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
						throw error;
					}
					this._logService.trace(`[AgentHostChatpad] The note changed while appending, retrying (attempt ${attempt})`);
				}
			}
		});
	}

	private async _exists(sessions: IAgentHostChatpadSessions, session: string): Promise<boolean> {
		return !!await this._find(sessions, session);
	}

	/** Looks up `session`; forgets it as the Chatpad chat once the host no longer knows it, so later calls look up nothing. */
	private async _find(sessions: IAgentHostChatpadSessions, session: string): Promise<{ readonly provider: string | undefined } | undefined> {
		const found = await sessions.find(session);
		if (found !== 'removed') {
			return found;
		}
		if (this.session === session) {
			this._logService.info(`[AgentHostChatpad] Chatpad chat ${session} was removed; the host has no Chatpad until another chat claims it`);
			this._storageService.delete(CHATPAD_SESSION_STORAGE_KEY);
		}
		return undefined;
	}

	private async _ensureNote(note: URI): Promise<void> {
		let stat: IFileStatWithPartialMetadata | undefined;
		try {
			stat = await this._fileService.stat(note);
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
		}
		if (!stat) {
			try {
				stat = await this._fileService.createFile(note, VSBuffer.fromString(NOTE_TEMPLATE), { overwrite: false });
			} catch (error) {
				if (!(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
					throw error;
				}
				// Created meanwhile, by the Chatpad chat or another client's request.
				stat = await this._fileService.stat(note);
			}
		}
		// A link at the note's path would redirect appends to another file. A process of the same user, such as the
		// chat's own shell, could still swap in a link between this check and a write, or link the scratch folder;
		// that is accepted, as it could write the target directly. Approving the chat's edits resolves links anyway.
		if (stat.isSymbolicLink) {
			throw new Error(`The Chatpad note ${note.fsPath} is a symbolic link.`);
		}
	}
}
