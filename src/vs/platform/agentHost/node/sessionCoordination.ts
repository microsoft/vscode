/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType, type ChatTurnStartedAction } from '../common/state/sessionActions.js';
import { MessageKind, PendingMessageKind, AH_META_ORCHESTRATION_DB_KEY, buildDefaultChatUri, readSessionOrchestration, type ISessionOrchestration, SessionStatus, withSessionOrchestration } from '../common/state/sessionState.js';
import { type Message } from '../common/state/protocol/state.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { persistSessionMetadataValues } from './shared/persistSessionMetadata.js';

export interface ISessionCoordinationTransition {
	readonly orchestration?: ISessionOrchestration;
	readonly notify: boolean;
}

export function transitionSessionCoordination(status: SessionStatus, orchestration: ISessionOrchestration): ISessionCoordinationTransition {
	if (!orchestration.notifyOnIdle) {
		return { notify: false };
	}

	const inputNeeded = (status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded;
	const inProgress = !inputNeeded && (status & SessionStatus.InProgress) === SessionStatus.InProgress
		&& (status & SessionStatus.Error) !== SessionStatus.Error;
	if (inProgress) {
		if (orchestration.creatorNotificationState !== 'waitingForCompletion'
			&& !(orchestration.notifyOnIdle === 'once' && orchestration.creatorNotificationState === 'notified')) {
			return { orchestration: { ...orchestration, creatorNotificationState: 'waitingForCompletion' }, notify: false };
		}
		return { notify: false };
	}

	const completed = inputNeeded
		|| (status & SessionStatus.Idle) === SessionStatus.Idle
		|| (status & SessionStatus.Error) === SessionStatus.Error;
	if (!completed || orchestration.creatorNotificationState !== 'waitingForCompletion') {
		return { notify: false };
	}

	return {
		orchestration: {
			...orchestration,
			creatorNotificationState: 'notified',
		},
		notify: true,
	};
}

export interface ISessionCoordinationDelegate {
	readonly getSessionMetadata: (session: URI) => Promise<{ readonly status?: SessionStatus } | undefined>;
	readonly restoreSession: (session: URI) => Promise<void>;
	readonly handleAction: (chat: string, action: ChatTurnStartedAction) => void;
}

export class SessionCoordinationService extends Disposable {

	private readonly _queues = new Map<string, Promise<void>>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
		private readonly _delegate: ISessionCoordinationDelegate,
	) {
		super();
		this._register(this._stateManager.onDidChangeSessionStatus(({ session, status }) => this._queueStatusChange(session, status)));
	}

	async setOrchestration(session: string, orchestration: ISessionOrchestration): Promise<void> {
		await persistSessionMetadataValues(this._sessionDataService, session, {
			[AH_META_ORCHESTRATION_DB_KEY]: JSON.stringify(orchestration),
		});
		this._stateManager.setSessionMeta(session, withSessionOrchestration(this._stateManager.getSessionSummary(session)?._meta, orchestration));
	}

	async handleStatusChange(session: string, status: SessionStatus): Promise<void> {
		const summary = this._stateManager.getSessionSummary(session);
		const orchestration = readSessionOrchestration(summary?._meta);
		if (!summary || !orchestration?.notifyOnIdle) {
			return;
		}

		const transition = transitionSessionCoordination(status, orchestration);
		if (!transition.notify) {
			if (transition.orchestration) {
				await this.setOrchestration(session, transition.orchestration);
			}
			return;
		}

		const creator = URI.parse(orchestration.creatorSession);
		const creatorMetadata = await this._delegate.getSessionMetadata(creator);
		if (!creatorMetadata || (creatorMetadata.status !== undefined && (creatorMetadata.status & SessionStatus.IsArchived) === SessionStatus.IsArchived)) {
			return;
		}
		if (!this._stateManager.getSessionState(creator.toString())) {
			try {
				await this._delegate.restoreSession(creator);
			} catch (error) {
				this._logService.error(`[SessionCoordinationService] Failed to restore creator session ${creator.toString()} for child notification: ${toErrorMessage(error)}`);
				return;
			}
		}
		const creatorSummary = this._stateManager.getSessionSummary(creator.toString());
		if (!creatorSummary || (creatorSummary.status & SessionStatus.IsArchived) === SessionStatus.IsArchived) {
			return;
		}

		const outcome = (status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded
			? 'needs input'
			: (status & SessionStatus.Error) === SessionStatus.Error ? 'encountered an error' : 'became idle';
		const childName = orchestration.label ? `${orchestration.label} (${session})` : session;
		this._startPrompt(creator, `Child session ${childName} ${outcome}. Use get_session_context with session "${session}" to inspect its result.`);
		if (transition.orchestration) {
			await this.setOrchestration(session, transition.orchestration);
		}
	}

	private _queueStatusChange(session: string, status: SessionStatus): void {
		const previous = this._queues.get(session) ?? Promise.resolve();
		const next = previous.catch(() => undefined).then(() => this.handleStatusChange(session, status));
		this._queues.set(session, next);
		void next.catch(error => {
			this._logService.error(`[SessionCoordinationService] Failed to coordinate child session ${session}: ${toErrorMessage(error)}`);
		}).finally(() => {
			if (this._queues.get(session) === next) {
				this._queues.delete(session);
			}
		});
	}

	private _startPrompt(creator: URI, prompt: string): void {
		const chat = buildDefaultChatUri(creator);
		const message: Message = { text: prompt, origin: { kind: MessageKind.SystemNotification } };
		if (this._stateManager.getActiveTurnId(chat)) {
			this._stateManager.dispatchServerAction(chat, {
				type: ActionType.ChatPendingMessageSet,
				kind: PendingMessageKind.Queued,
				id: generateUuid(),
				message,
			});
			return;
		}
		const action: ChatTurnStartedAction = {
			type: ActionType.ChatTurnStarted,
			turnId: generateUuid(),
			startedAt: new Date().toISOString(),
			message,
		};
		this._stateManager.dispatchServerAction(chat, action);
		this._delegate.handleAction(chat, action);
	}
}
