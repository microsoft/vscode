/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';
import { ActionType, type ActionEnvelope, type ChatErrorAction, type StateAction } from './protocol/actions.js';
import { ResponsePartKind, TurnState, type ChatState, type ErrorInfo, type Turn } from './protocol/state.js';

interface ILegacyChatErrorAction extends Omit<ChatErrorAction, 'part'> {
	readonly error: ErrorInfo;
}

type CompatibleTurn = Turn | (Turn & { readonly error: ErrorInfo });

type CompatibleActionEnvelope = Omit<ActionEnvelope, 'action'> & {
	readonly action: StateAction | ILegacyChatErrorAction;
};

/**
 * Reads the top-level error field emitted by AHP hosts before durable error
 * response parts were introduced.
 */
export function readLegacyTurnError(turn: CompatibleTurn): ErrorInfo | undefined {
	if (!hasKey(turn, { error: true })) {
		return undefined;
	}
	return turn.error;
}

/**
 * Moves a legacy completed-turn error into its durable response-part position.
 */
export function normalizeLegacyTurnError(turn: CompatibleTurn): Turn {
	if (turn.state !== TurnState.Error || !hasKey(turn, { error: true })) {
		return turn;
	}

	const { error, ...normalizedTurn } = turn;
	const finalPart = turn.responseParts[turn.responseParts.length - 1];
	return {
		...normalizedTurn,
		responseParts: finalPart?.kind === ResponsePartKind.Error
			? turn.responseParts
			: [...turn.responseParts, { kind: ResponsePartKind.Error, error }],
	};
}

/**
 * Normalizes legacy completed-turn errors in a chat snapshot.
 */
export function normalizeLegacyChatStateErrors(state: ChatState): ChatState {
	const turns = state.turns.map(normalizeLegacyTurnError);
	return turns.some((turn, index) => turn !== state.turns[index])
		? { ...state, turns }
		: state;
}

/**
 * Normalizes legacy error payloads before a server action reaches reducers or
 * action observers.
 */
export function normalizeLegacyActionEnvelope(envelope: CompatibleActionEnvelope): ActionEnvelope {
	const action = envelope.action;
	switch (action.type) {
		case ActionType.ChatError:
			if (hasKey(action, { error: true })) {
				const { error, ...normalizedAction } = action;
				return {
					...envelope,
					action: {
						...normalizedAction,
						part: { kind: ResponsePartKind.Error, error },
					},
				};
			}
			return { ...envelope, action };
		case ActionType.ChatTurnsLoaded: {
			const turns = action.turns.map(normalizeLegacyTurnError);
			return turns.some((turn, index) => turn !== action.turns[index])
				? { ...envelope, action: { ...action, turns } }
				: { ...envelope, action };
		}
		default:
			return { ...envelope, action };
	}
}
