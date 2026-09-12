/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction, IHydrationContext, IRestoredChat, IIncomingRequest, IncomingRequestDisposition } from '../../../common/agentHostChatContributionsService.js';
import { CANVAS_EXTERNAL_RUNTIME_MESSAGE_ORIGIN } from '../../../common/agentHostCanvases.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { chatStorageUri, MessageKind, type Turn } from '../../../common/state/sessionState.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { IAgentHostCanvasesService } from '../../agentHostCanvasesService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Restores durable membership before catalog publication, without touching executable providers. */
export class CanvasesContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'canvases';
	readonly order = 650;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostCanvasesService private readonly _canvases: IAgentHostCanvasesService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionData: ISessionDataService,
		@IAgentHostStateManager private readonly _state: AgentHostStateManager,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		return this._canvases.isChatInitializing(request.chat) || request.phase === 'preparation' && this._state.getDeferredTurnId(request.chat) ? {
			kind: 'reject',
			stage: 'validation',
			error: { errorType: 'canvasInitializationPending', message: localize('canvasInitializationPending', "This chat is initializing its canvas runtime. Wait for initialization before starting a turn.") },
		} : undefined;
	}

	async onHydrateChat(context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat> {
		const canvases = await this._canvases.loadChat(context.chat);
		return canvases.length ? { ...restored, canvases } : restored;
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		const storage = turns.length ? chatStorageUri(URI.parse(context.chat)) : undefined;
		const reference = storage ? await this._sessionData.tryOpenDatabase(storage) : undefined;
		if (!reference) {
			return turns;
		}
		try {
			const origins = await reference.object.getTurnMessageOrigins();
			return origins.size ? turns.map(turn => origins.get(turn.id) === CANVAS_EXTERNAL_RUNTIME_MESSAGE_ORIGIN ? {
				...turn,
				message: {
					...turn.message, origin: { kind: MessageKind.Tool },
					_meta: { ...turn.message._meta, copilotOrigin: CANVAS_EXTERNAL_RUNTIME_MESSAGE_ORIGIN },
				},
			} : turn) : turns;
		} finally {
			reference.dispose();
		}
	}

	onDidDispatchAction(observed: IDispatchedAction): void {
		if (!observed.rejectionReason && observed.action.type === ActionType.SessionChatRemoved) {
			this._canvases.cancelChatInitialization(observed.action.chat);
			void this._canvases.persistChat(observed.action.chat).catch(() => this._logService.warn('[Canvases] Failed to persist removed chat membership.'));
		}
	}
}
