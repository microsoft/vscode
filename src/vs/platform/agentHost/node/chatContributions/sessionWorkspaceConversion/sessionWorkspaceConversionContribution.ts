/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IHydrationContext, IIncomingRequest, IncomingRequestDisposition, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { parseAgentWorkspaceTransition, AgentSystemNotificationKind, readAgentSystemNotificationMeta, toAgentSystemNotificationMeta } from '../../../common/meta/agentSystemNotificationMeta.js';
import { toAgentWorkspaceContinuationMessageMeta } from '../../../common/meta/agentWorkspaceContinuationMeta.js';
import { ResponsePartKind, withMessageRequestHiddenFromTranscript, type Turn } from '../../../common/state/sessionState.js';
import { ISessionWorkspaceConversionService } from './sessionWorkspaceConversionService.js';

/** Finalizes requested workspace conversions after a turn and blocks new turns while conversion is pending. */
export class SessionWorkspaceConversionContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'sessionWorkspaceConversion';
	readonly order = 150;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ISessionWorkspaceConversionService private readonly _conversionService: ISessionWorkspaceConversionService,
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

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		const transitions = context.workspaceTransitions;
		if (turns.length === 0 || !transitions?.size) {
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
