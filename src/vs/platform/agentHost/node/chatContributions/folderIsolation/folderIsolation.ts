/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostCredentialSource } from '../../../common/agentHostCredentials.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { getPendingSteeringMessages } from '../../../common/agentSessionMessage.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { withMessageRequestHiddenFromTranscript, withMessageSystemInitiatedLabel } from '../../../common/meta/agentMessageMeta.js';
import { MessageKind } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostTurnService } from '../../agentHostTurnService.js';

export const IFolderIsolationService = createDecorator<IFolderIsolationService>('folderIsolationService');

/**
 * Moves an additional folder of a chat into a worktree of its own when the agent asks for it with `isolate_folder`,
 * as `isolate_session` moves a chat: the tool asks the user to confirm and schedules the move, and once the turn that
 * called it ends successfully, the host moves the folder and continues the chat's task in a new turn, which a
 * provider launches in the new folders.
 */
export interface IFolderIsolationService {
	readonly _serviceBrand: undefined;
	/**
	 * Moves `folder` of `chat` into a worktree once its active turn `turnId` ends successfully. Throws when the turn is
	 * not active or the chat cannot isolate the folder. `credentials`, the source of that turn, sponsor the worktree
	 * and the turn that continues the task, as a client's message sponsors its turn.
	 */
	request(session: URI, chat: URI, turnId: string, folder: URI, credentials: IAgentHostCredentialSource | undefined): void;
	/** Moves the folders a turn that ended successfully asked for, and continues the chat's task; drops them otherwise. */
	onTurnEnd(turn: ITurnEnd): void;
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

	constructor(
		private readonly _host: IFolderIsolationHost,
		@IAgentHostTurnService private readonly _turnService: IAgentHostTurnService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// A chat removed before its turn ended never reaches `onTurnEnd`.
		this._register(this._stateManager.onDidUnregisterChat(({ chat }) => this._pending.delete(chat)));
		this._register(toDisposable(() => this._pending.clear()));
	}

	request(session: URI, chat: URI, turnId: string, folder: URI, credentials: IAgentHostCredentialSource | undefined): void {
		const key = chat.toString();
		if (this._stateManager.getActiveTurnId(key) !== turnId) {
			throw new Error(localize('agentHost.isolateFolder.activeTurnRequired', "Isolating a folder with this tool requires an active turn."));
		}
		this._host.validateFolderIsolation(session, chat, folder);
		const pending = this._pending.get(key);
		if (pending?.turnId === turnId) {
			if (!pending.folders.some(candidate => candidate.toString() === folder.toString())) {
				pending.folders.push(folder);
			}
			pending.credentials = credentials ?? pending.credentials;
		} else {
			this._pending.set(key, { session, turnId, folders: [folder], credentials });
		}
	}

	onTurnEnd(turn: ITurnEnd): void {
		const pending = this._pending.get(turn.channel);
		if (!pending || pending.turnId !== turn.turnId) {
			return;
		}
		this._pending.delete(turn.channel);
		// As a moved chat, a folder is moved only after a turn that succeeded
		if (turn.reason.kind === 'success') {
			void this._isolate(URI.parse(turn.channel), pending);
		}
	}

	private async _isolate(chat: URI, pending: IPendingFolderIsolation): Promise<void> {
		const outcomes: string[] = [];
		// One at a time: folders in the same checkout share one worktree
		for (const folder of pending.folders) {
			try {
				const isolated = await this._host.isolateChatFolder(pending.session, chat, folder, pending.credentials);
				outcomes.push(`${JSON.stringify(folder.fsPath)} is now ${JSON.stringify(isolated.fsPath)}; make every change to it there only`);
			} catch (error) {
				this._logService.warn(`[FolderIsolation] Failed to isolate ${folder.toString()} of ${chat.toString()}: ${toErrorMessage(error)}`);
				outcomes.push(`${JSON.stringify(folder.fsPath)} could not be moved into a worktree (${toErrorMessage(error)}); do not change it, and tell the user`);
			}
		}
		// A message the user sent or queued meanwhile takes the continuation's place: its turn launches in the new
		// folders too, and the working directories list tells the agent where they are.
		const key = chat.toString();
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
}
