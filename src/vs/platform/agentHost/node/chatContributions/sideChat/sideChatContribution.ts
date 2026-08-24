/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IHydrationContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { ChatOriginKind } from '../../../common/state/protocol/state.js';
import type { Turn } from '../../../common/state/sessionState.js';
import { IAgentHostStateManager, AgentHostStateManager } from '../../agentHostStateManager.js';
import { buildBoundedSideChatSourceContext, getSideChatPartialResponse, injectSideChatContext, resolveSideChatBoundary, sliceSideChatTurns } from './sideChatContext.js';

/**
 * Adds host-owned side-chat context to the first message and removes it from
 * restored histories.
 */
export class SideChatContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'sideChat';
	readonly order = 500;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const origin = this._stateManager.getChatOrigin(turn.chat);
		if (origin?.kind !== ChatOriginKind.SideChat || this._stateManager.getChatState(turn.chat)?.turns.length !== 0) {
			return undefined;
		}

		const sourceState = this._stateManager.getChatState(origin.chat);
		const activeTurn = sourceState?.activeTurn?.id === origin.turnId ? sourceState.activeTurn : undefined;
		const sourceContext = buildBoundedSideChatSourceContext(sourceState?.turns ?? [], origin.turnId, activeTurn);
		const partialResponse = getSideChatPartialResponse(activeTurn);
		return {
			message: {
				...turn.message,
				text: injectSideChatContext(turn.message.text, partialResponse, sourceContext, origin.selection?.text),
			},
		};
	}

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		const origin = this._stateManager.getChatOrigin(context.chat);
		if (origin?.kind !== ChatOriginKind.SideChat) {
			return turns;
		}

		const inheritedTurnId = this._stateManager.getChatInheritedTurnId(context.chat);
		const sideChatBoundary = {
			...(inheritedTurnId !== undefined
				? { inheritedTurnId }
				: {}),
		};
		return resolveSideChatBoundary(turns, sideChatBoundary) === turns.length
			? turns
			: sliceSideChatTurns(turns, sideChatBoundary);
	}
}
