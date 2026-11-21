/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ActiveTurn, ChatState, getErrorResponsePart, PendingMessageKind, ResponsePartKind, SessionStatus, Turn, TurnState } from '../../../../platform/agentHost/common/state/sessionState.js';

export const maxRemoteSessionResponseLength = 16 * 1024;

interface IRemoteSessionInspectionTarget {
	readonly session: string;
	readonly chat: string;
	readonly openLink: string;
	readonly host: { readonly id: string; readonly label: string };
}

interface IRemoteSessionTurnSnapshot {
	readonly id: string;
	readonly status: 'running' | 'completed' | 'cancelled' | 'failed';
	readonly response: string;
	readonly error: { readonly type: string; readonly message: string; readonly resumable: boolean } | null;
	readonly truncated: boolean;
}

interface IRemoteSessionSnapshot {
	readonly status: IRemoteSessionTurnSnapshot['status'] | 'idle' | 'queued' | 'needsInput';
	readonly title: string;
	readonly queuedMessages: number;
	readonly hasSteeringMessage: boolean;
	readonly latestTurn: IRemoteSessionTurnSnapshot | null;
	/** The turn the inspection asked for, when it named one. */
	readonly turn?: IRemoteSessionTurnSnapshot;
}

export type IRemoteSessionInspectionResult = IRemoteSessionInspectionTarget & (IRemoteSessionSnapshot | {
	readonly status: 'unavailable';
	readonly reason: string;
});

export interface IGetRemoteSessionOptions {
	readonly session: string;
	/** The turn to read in addition to the latest one. */
	readonly turn?: string;
}

export function parseGetRemoteSessionOptions(value: unknown): IGetRemoteSessionOptions {
	const input = isObject(value) ? value as { readonly session?: unknown; readonly turn?: unknown } : undefined;
	if (!input || typeof input.session !== 'string' || !input.session.trim()
		|| (input.turn !== undefined && (typeof input.turn !== 'string' || !input.turn.trim()))
		|| Object.keys(input).some(key => key !== 'session' && key !== 'turn')) {
		throw new Error(localize('remoteInspection.invalidInput', "Provide an exact session or chat reference returned by the remote session tools."));
	}
	return { session: input.session.trim(), ...(typeof input.turn === 'string' ? { turn: input.turn.trim() } : {}) };
}

/**
 * A snapshot of `chat` for remote inspection. With `turnId`, it also carries that turn, which must be in the chat's
 * loaded history.
 */
export function remoteSessionSnapshot(chat: ChatState, turnId?: string): IRemoteSessionSnapshot {
	const completed = chat.activeTurn ? undefined : chat.turns.at(-1);
	const latestTurn = chat.activeTurn ? turnSnapshot(chat.activeTurn, undefined) : completed ? turnSnapshot(completed, completed.state) : null;
	const queuedMessages = chat.queuedMessages?.filter(message => message.kind !== PendingMessageKind.Steering).length ?? 0;
	const hasSteeringMessage = chat.steeringMessage !== undefined || chat.queuedMessages?.some(message => message.kind === PendingMessageKind.Steering) === true;
	const status = (chat.status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded ? 'needsInput'
		: chat.activeTurn || (chat.status & SessionStatus.InProgress) !== 0 ? 'running'
			: latestTurn?.status === 'failed' || (chat.status & SessionStatus.Error) !== 0 ? 'failed'
				: queuedMessages || hasSteeringMessage ? 'queued'
					: completed && latestTurn ? latestTurn.status : 'idle';
	let requested: IRemoteSessionTurnSnapshot | undefined;
	if (turnId !== undefined) {
		const requestedTurn = chat.turns.find(candidate => candidate.id === turnId);
		requested = chat.activeTurn?.id === turnId ? turnSnapshot(chat.activeTurn, undefined)
			: requestedTurn ? turnSnapshot(requestedTurn, requestedTurn.state) : undefined;
		if (!requested) {
			throw new Error(chat.turnsNextCursor !== undefined
				? localize('remoteInspection.turnNotLoaded', "The requested turn is not in the part of this chat's history its agent host has loaded.")
				: localize('remoteInspection.turnMissing', "The requested turn is not in this chat. It may have been removed."));
		}
	}
	return {
		status,
		title: chat.title,
		queuedMessages,
		hasSteeringMessage,
		latestTurn,
		...(requested ? { turn: requested } : {}),
	};
}

/** A snapshot of `turn`, whose final `state` is `undefined` while it runs. */
function turnSnapshot(turn: Turn | ActiveTurn, state: TurnState | undefined): IRemoteSessionTurnSnapshot {
	const status = state === undefined ? 'running'
		: state === TurnState.Error ? 'failed'
			: state === TurnState.Cancelled ? 'cancelled' : 'completed';
	let response = '';
	for (const part of turn.responseParts) {
		if (part.kind === ResponsePartKind.Markdown) {
			response += part.content.slice(0, maxRemoteSessionResponseLength + 1 - response.length);
			if (response.length > maxRemoteSessionResponseLength) {
				break;
			}
		}
	}
	const errorPart = getErrorResponsePart(turn);
	const errorMessage = errorPart?.error.message ?? '';
	return {
		id: turn.id,
		status,
		response: response.slice(0, maxRemoteSessionResponseLength),
		error: errorPart ? {
			type: errorPart.error.errorType,
			message: errorMessage.slice(0, maxRemoteSessionResponseLength),
			resumable: errorPart.resumable === true,
		} : null,
		truncated: response.length > maxRemoteSessionResponseLength || errorMessage.length > maxRemoteSessionResponseLength,
	};
}
