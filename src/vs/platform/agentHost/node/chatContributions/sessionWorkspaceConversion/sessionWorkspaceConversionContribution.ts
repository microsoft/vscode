/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IHydrationContext, IIncomingRequest, IncomingRequestDisposition, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { parseAgentWorkspaceTransition, AgentSystemNotificationKind, readAgentSystemNotificationMeta, toAgentSystemNotificationMeta } from '../../../common/meta/agentSystemNotificationMeta.js';
import { toAgentWorkspaceContinuationMessageMeta } from '../../../common/meta/agentWorkspaceContinuationMeta.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { chatStorageUri, readSessionHasWorkspaceTransitions, ResponsePartKind, withMessageRequestHiddenFromTranscript, type Turn } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { ISessionWorkspaceConversionService } from './sessionWorkspaceConversionService.js';

/** Finalizes requested workspace conversions after a turn and blocks new turns while conversion is pending. */
export class SessionWorkspaceConversionContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'sessionWorkspaceConversion';
	readonly order = 150;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ISessionWorkspaceConversionService private readonly _conversionService: ISessionWorkspaceConversionService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success') {
			void this._conversionService.updateSessionWorkspace(turn.channel, turn.turnId);
		} else {
			this._conversionService.cancel(turn.channel, turn.turnId);
		}
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		if (!this._conversionService.isPending(request.chat)) {
			return undefined;
		}
		return {
			kind: 'reject',
			error: {
				errorType: 'workspaceConversionPending',
				message: localize('agentHost.workspaceConversionPending', "Wait for workspace setup to finish before sending another message."),
			},
			stage: 'validation',
		};
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		if (turns.length === 0) {
			return turns;
		}
		if (context.hasWorkspaceTransitions === false) {
			return turns;
		}
		if (context.hasWorkspaceTransitions !== true) {
			const summary = this._stateManager.getSessionSummary(context.session);
			if (summary && !readSessionHasWorkspaceTransitions(summary._meta)) {
				return turns;
			}
		}
		const storage = chatStorageUri(URI.parse(context.chat));
		if (!storage) {
			return turns;
		}
		const database = await this._sessionDataService.tryOpenDatabase(storage);
		if (!database) {
			return turns;
		}
		let transitions: Map<string, string>;
		try {
			transitions = await database.object.getTurnWorkspaceTransitions();
		} catch (error) {
			this._logService.warn(`[SessionWorkspaceConversionContribution] Failed to restore workspace transitions for ${storage.toString()}`, error);
			return turns;
		} finally {
			database.dispose();
		}
		if (transitions.size === 0) {
			return turns;
		}
		return turns.map(turn => {
			const rawTransition = transitions.get(turn.id);
			if (!rawTransition) {
				return turn;
			}
			const transition = parseAgentWorkspaceTransition(rawTransition);
			if (!transition) {
				return turn;
			}
			const transitionPart = {
				kind: ResponsePartKind.SystemNotification,
				content: transition.content,
				_meta: toAgentSystemNotificationMeta({
					kind: AgentSystemNotificationKind.WorkspaceTransition,
					workspaceKind: transition.workspaceKind,
					workspaceName: transition.workspaceName,
				}),
			} as const;
			const existingIndex = turn.responseParts.findIndex(part =>
				part.kind === ResponsePartKind.SystemNotification
				&& readAgentSystemNotificationMeta(part).kind === AgentSystemNotificationKind.WorkspaceTransition
			);
			const responseParts = existingIndex < 0
				? [transitionPart, ...turn.responseParts]
				: existingIndex === 0
					? turn.responseParts
					: [turn.responseParts[existingIndex], ...turn.responseParts.slice(0, existingIndex), ...turn.responseParts.slice(existingIndex + 1)];
			return {
				...turn,
				message: withMessageRequestHiddenFromTranscript({
					...turn.message,
					_meta: {
						...turn.message._meta,
						...toAgentWorkspaceContinuationMessageMeta(),
					},
				}, true),
				responseParts,
			};
		});
	}
}
