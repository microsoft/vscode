/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostCredentialSource } from '../../../common/agentHostCredentials.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IIncomingRequest, IncomingRequestDisposition, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { getPendingSteeringMessages } from '../../../common/agentSessionMessage.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { withMessageRequestHiddenFromTranscript, withMessageSystemInitiatedLabel } from '../../../common/meta/agentMessageMeta.js';
import { MessageKind } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostTurnService } from '../../agentHostTurnService.js';

export const IFolderIsolationService = createDecorator<IFolderIsolationService>('folderIsolationService');

/**
 * Moves additional folders of a chat into worktrees of their own when the agent asks for them with `isolate_session`,
 * as it moves a chat of one folder: the tool asks the user to confirm and schedules the move, and once the turn that
 * called it ends successfully, the host moves the folders and continues the chat's task in a new turn, which a
 * provider launches in the new folders.
 */
export interface IFolderIsolationService {
	readonly _serviceBrand: undefined;
	/**
	 * Moves `folders` of `chat` into worktrees once its active turn `turnId` ends successfully. Throws, scheduling none,
	 * when the turn is not active or the chat cannot isolate one of them. `credentials`, the source of that turn, sponsor
	 * the worktrees and the turn that continues the task, as a client's message sponsors its turn.
	 */
	request(session: URI, chat: URI, turnId: string, folders: readonly URI[], credentials: IAgentHostCredentialSource | undefined): void;
	/**
	 * Moves the folders a turn that ended successfully asked for, and continues the chat's task; drops them otherwise.
	 * Until the folders are moved, the chat's queued messages wait and a message sent to it is refused, so that no turn
	 * launches in the folders being replaced.
	 */
	onTurnEnd(turn: ITurnEnd): void;
	/** Whether the folders of `chat` are being moved. */
	isMoving(chat: string): boolean;
}

/** What {@link FolderIsolationService} needs from the agent service. */
export interface IFolderIsolationHost {
	/** Throws when `chat` cannot move `folder` into a worktree: not one of its additional folders, or not a worktree session. */
	validateFolderIsolation(session: URI, chat: URI, folder: URI): void;
	/** Moves `folder` of `chat` into a worktree and returns the folder to work in. */
	isolateChatFolder(session: URI, chat: URI, folder: URI, credentials: IAgentHostCredentialSource | undefined): Promise<URI>;
}

interface IPendingFolderIsolation {
	readonly session: URI;
	readonly turnId: string;
	readonly folders: URI[];
	credentials: IAgentHostCredentialSource | undefined;
}

export class FolderIsolationService extends Disposable implements IFolderIsolationService {

	declare readonly _serviceBrand: undefined;

	private readonly _pending = new Map<string, IPendingFolderIsolation>();
	private readonly _moving = new Set<string>();

	constructor(
		private readonly _host: IFolderIsolationHost,
		@IAgentHostTurnService private readonly _turnService: IAgentHostTurnService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// A chat removed before its turn ended never reaches `onTurnEnd`.
		this._register(this._stateManager.onDidUnregisterChat(({ chat }) => this._pending.delete(chat)));
		this._register(toDisposable(() => {
			this._pending.clear();
			this._moving.clear();
		}));
	}

	isMoving(chat: string): boolean {
		return this._moving.has(chat);
	}

	request(session: URI, chat: URI, turnId: string, folders: readonly URI[], credentials: IAgentHostCredentialSource | undefined): void {
		const key = chat.toString();
		if (this._stateManager.getActiveTurnId(key) !== turnId) {
			throw new Error(localize('agentHost.isolateFolder.activeTurnRequired', "Isolating a folder with this tool requires an active turn."));
		}
		for (const folder of folders) {
			this._host.validateFolderIsolation(session, chat, folder);
		}
		let pending = this._pending.get(key);
		if (pending?.turnId !== turnId) {
			pending = { session, turnId, folders: [], credentials };
			this._pending.set(key, pending);
		}
		for (const folder of folders) {
			if (!pending.folders.some(candidate => candidate.toString() === folder.toString())) {
				pending.folders.push(folder);
			}
		}
		pending.credentials = credentials ?? pending.credentials;
	}

	onTurnEnd(turn: ITurnEnd): void {
		const pending = this._pending.get(turn.channel);
		if (!pending || pending.turnId !== turn.turnId) {
			return;
		}
		this._pending.delete(turn.channel);
		// As a moved chat, a folder is moved only after a turn that succeeded
		if (turn.reason.kind === 'success') {
			// Taken now, before this turn end's queue drain, as a scheduled chat move takes it
			const admission = this._stateManager.holdChatAdmission([turn.channel]);
			this._moving.add(turn.channel);
			void this._isolate(URI.parse(turn.channel), pending, admission);
		}
	}

	private async _isolate(chat: URI, pending: IPendingFolderIsolation, admission: IDisposable): Promise<void> {
		const key = chat.toString();
		try {
			const outcomes: string[] = [];
			try {
				// One at a time: folders in the same checkout share one worktree
				for (const folder of pending.folders) {
					try {
						const isolated = await this._host.isolateChatFolder(pending.session, chat, folder, pending.credentials);
						outcomes.push(`${JSON.stringify(folder.fsPath)} is now ${JSON.stringify(isolated.fsPath)}; make every change to it there only`);
					} catch (error) {
						this._logService.warn(`[FolderIsolation] Failed to isolate ${folder.toString()} of ${key}: ${toErrorMessage(error)}`);
						outcomes.push(`${JSON.stringify(folder.fsPath)} could not be moved into a worktree (${toErrorMessage(error)}); do not change it, and tell the user`);
					}
				}
			} finally {
				this._moving.delete(key);
			}
			// A message the user queued meanwhile takes the continuation's place: its turn launches in the new folders,
			// once the admission is released, and the working directories list tells the agent where they are.
			const state = this._stateManager.getChatState(key);
			const removed = !this._stateManager.getSessionState(pending.session.toString())?.chats.some(candidate => candidate.resource === key);
			if (removed || this._stateManager.getActiveTurnId(key) !== undefined
				|| (state && (state.queuedMessages?.length || getPendingSteeringMessages(state).length))) {
				return;
			}
			try {
				this._turnService.startTurnMessage(chat, withMessageRequestHiddenFromTranscript(withMessageSystemInitiatedLabel({
					text: `Continue the task. ${outcomes.join('. ')}.`,
					origin: { kind: MessageKind.SystemNotification },
				}, localize('agentHost.continueInFolderWorktree', "Continue in Worktree")), true), pending.credentials);
			} catch (error) {
				this._logService.error(`[FolderIsolation] Failed to continue ${key} after isolating its folders`, error);
			}
		} finally {
			admission.dispose();
		}
	}
}

/** Hands the end of every turn to {@link IFolderIsolationService}. */
export class FolderIsolationContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'folderIsolation';
	/** After the workspace conversion (150), which continues chats the same way. */
	readonly order = 155;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IFolderIsolationService private readonly _folderIsolation: IFolderIsolationService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		this._folderIsolation.onTurnEnd(turn);
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		if (!this._folderIsolation.isMoving(request.chat)) {
			return undefined;
		}
		return {
			kind: 'reject',
			error: {
				errorType: 'folderIsolationPending',
				message: localize('agentHost.folderIsolationPending', "Wait for the folder to move to its worktree before sending another message."),
			},
			stage: 'validation',
		};
	}
}
