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
import { withMessageRequestHiddenFromTranscript, withMessageSystemInitiatedLabel } from '../../../common/meta/agentMessageMeta.js';
import { MessageKind } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostTurnService } from '../../agentHostTurnService.js';

export const IFolderIsolationContinuationService = createDecorator<IFolderIsolationContinuationService>('folderIsolationContinuationService');

/**
 * Continues a chat's task after `isolate_folder` moved one of its folders into a worktree. A provider runs a turn
 * with the folders it launched in, so the worktree becomes writable only from the next turn: the agent ends the turn
 * after the tool, and the host starts that next turn itself.
 */
export interface IFolderIsolationContinuationService {
	readonly _serviceBrand: undefined;
	/**
	 * Continues the chat once `turnId` ends successfully, telling the agent where `folder` is now. `credentials`, the
	 * source of the turn that isolated the folder, sponsors the continuation, as a client's message sponsors its turn.
	 */
	schedule(chat: URI, turnId: string, folder: URI, isolated: URI, credentials: IAgentHostCredentialSource | undefined): void;
	/** Starts the continuation of a turn that ended, if one was scheduled; drops it when the turn did not succeed. */
	onTurnEnd(turn: ITurnEnd): void;
}

export class FolderIsolationContinuationService extends Disposable implements IFolderIsolationContinuationService {

	declare readonly _serviceBrand: undefined;

	private readonly _pending = new Map<string, { readonly turnId: string; readonly folders: { readonly folder: URI; readonly isolated: URI }[]; credentials: IAgentHostCredentialSource | undefined }>();

	constructor(
		@IAgentHostTurnService private readonly _turnService: IAgentHostTurnService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// A chat removed before its turn ended never reaches `onTurnEnd`.
		this._register(this._stateManager.onDidUnregisterChat(({ chat }) => this._pending.delete(chat)));
		this._register(toDisposable(() => this._pending.clear()));
	}

	schedule(chat: URI, turnId: string, folder: URI, isolated: URI, credentials: IAgentHostCredentialSource | undefined): void {
		const key = chat.toString();
		const pending = this._pending.get(key);
		if (pending?.turnId === turnId) {
			if (!pending.folders.some(entry => entry.isolated.toString() === isolated.toString())) {
				pending.folders.push({ folder, isolated });
			}
			pending.credentials = credentials ?? pending.credentials;
		} else {
			this._pending.set(key, { turnId, folders: [{ folder, isolated }], credentials });
		}
	}

	onTurnEnd(turn: ITurnEnd): void {
		const pending = this._pending.get(turn.channel);
		if (!pending || pending.turnId !== turn.turnId) {
			return;
		}
		this._pending.delete(turn.channel);
		// A cancelled or failed turn is not continued, and a message the user sent or queued meanwhile takes its place:
		// its turn launches in the new folders too, and the working directories list tells the agent where they are.
		const state = this._stateManager.getChatState(turn.channel);
		if (turn.reason.kind !== 'success' || this._stateManager.getActiveTurnId(turn.channel) !== undefined
			|| (state && (state.queuedMessages?.length || getPendingSteeringMessages(state).length))) {
			return;
		}
		const folders = pending.folders.map(({ folder, isolated }) => `${JSON.stringify(folder.fsPath)} is now ${JSON.stringify(isolated.fsPath)}`).join('; ');
		try {
			this._turnService.startTurnMessage(URI.parse(turn.channel), withMessageRequestHiddenFromTranscript(withMessageSystemInitiatedLabel({
				text: `Continue the task. Folders moved into worktrees of their own: ${folders}. Make every change to them in their worktree paths only.`,
				origin: { kind: MessageKind.SystemNotification },
			}, localize('agentHost.continueInFolderWorktree', "Continue in Worktree")), true), pending.credentials);
		} catch (error) {
			this._logService.error(`[FolderIsolationContinuation] Failed to continue ${turn.channel} after isolating its folders`, error);
		}
	}
}

/** Hands the end of every turn to {@link IFolderIsolationContinuationService}. */
export class FolderIsolationContinuationContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'folderIsolationContinuation';
	/** After the workspace conversion (150), which continues chats the same way. */
	readonly order = 155;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IFolderIsolationContinuationService private readonly _continuation: IFolderIsolationContinuationService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		this._continuation.onTurnEnd(turn);
	}
}
