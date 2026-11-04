/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext, type IOutgoingTurn, type ISendContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { resolveLastNonLocalTurnId } from '../../../common/agentHostConversationContext.js';
import { ChatOriginKind } from '../../../common/state/protocol/state.js';
import { TurnState, type Turn } from '../../../common/state/sessionState.js';
import { IAgentHostStateManager, AgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostLocalTurns } from '../../agentHostLocalTurns.js';
import { buildBoundedSideChatSourceContext, getSideChatPartialResponse, injectSideChatContext, resolveSideChatBoundary, sliceSideChatTurns } from './sideChatContext.js';

const sideChatSeededMemento = createChatMementoKey<boolean>('seeded', () => false);

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
		@IAgentHostLocalTurns private readonly _localTurns: IAgentHostLocalTurns,
	) {
		super();
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const origin = this._stateManager.getChatOrigin(turn.chat);
		if (origin?.kind !== ChatOriginKind.SideChat || this._context.memento(sideChatSeededMemento, turn.chat).get()) {
			return undefined;
		}

		const sourceState = this._stateManager.getChatState(origin.chat);
		const activeTurn = sourceState?.activeTurn?.id === origin.turnId ? sourceState.activeTurn : undefined;
		const sourceIsToolChat = this._stateManager.getChatOrigin(origin.chat)?.kind === ChatOriginKind.Tool;
		const forkAnchorTurnId = activeTurn && !sourceIsToolChat
			? resolveLastNonLocalTurnId(sourceState?.turns ?? [], turnId => this._localTurns.isLocal(origin.chat, turnId))
			: undefined;
		const sourceContext = sourceIsToolChat || activeTurn || this._localTurns.isLocal(origin.chat, origin.turnId)
			? buildBoundedSideChatSourceContext(sourceState?.turns ?? [], origin.turnId, activeTurn, forkAnchorTurnId)
			: undefined;
		const partialResponse = getSideChatPartialResponse(activeTurn);
		return {
			text: injectSideChatContext(turn.message.text, partialResponse, sourceContext, origin.selection?.text),
		};
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind !== 'success' || this._stateManager.getChatOrigin(turn.channel)?.kind !== ChatOriginKind.SideChat) {
			return;
		}
		this._context.memento(sideChatSeededMemento, turn.channel).set(true, undefined);
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
		const boundary = resolveSideChatBoundary(turns, sideChatBoundary);
		if (turns.slice(boundary).some(turn => turn.state === TurnState.Complete)) {
			this._context.memento(sideChatSeededMemento, context.chat).set(true, undefined);
		}
		return boundary === turns.length
			? turns
			: sliceSideChatTurns(turns, sideChatBoundary);
	}
}
