/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ChatState, getErrorResponsePart, ResponsePartKind, SessionStatus, TurnState } from '../../../../platform/agentHost/common/state/sessionState.js';

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
}

export type IRemoteSessionInspectionResult = IRemoteSessionInspectionTarget & (IRemoteSessionSnapshot | {
	readonly status: 'unavailable';
	readonly reason: string;
});

export function parseGetRemoteSessionOptions(value: unknown): { readonly session: string } {
	const input = isObject(value) ? value as { readonly session?: unknown } : undefined;
	if (!input || typeof input.session !== 'string' || !input.session.trim()
		|| Object.keys(input).some(key => key !== 'session')) {
		throw new Error(localize('remoteInspection.invalidInput', "Provide an exact session or chat reference returned by the remote session tools."));
	}
	return { session: input.session.trim() };
}

export function remoteSessionSnapshot(chat: ChatState): IRemoteSessionSnapshot {
	const turn = chat.activeTurn ?? chat.turns.at(-1);
	const completed = chat.activeTurn ? undefined : chat.turns.at(-1);
	const turnStatus = !completed ? 'running'
		: completed.state === TurnState.Error ? 'failed'
			: completed.state === TurnState.Cancelled ? 'cancelled' : 'completed';
	let response = '';
	for (const part of turn?.responseParts ?? []) {
		if (part.kind === ResponsePartKind.Markdown) {
			response += part.content.slice(0, maxRemoteSessionResponseLength + 1 - response.length);
			if (response.length > maxRemoteSessionResponseLength) {
				break;
			}
		}
	}
	const errorPart = getErrorResponsePart(turn);
	const errorMessage = errorPart?.error.message ?? '';
	const queuedMessages = chat.queuedMessages?.length ?? 0;
	const hasSteeringMessage = chat.steeringMessage !== undefined;
	const status = (chat.status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded ? 'needsInput'
		: chat.activeTurn || (chat.status & SessionStatus.InProgress) !== 0 ? 'running'
			: turnStatus === 'failed' || (chat.status & SessionStatus.Error) !== 0 ? 'failed'
				: queuedMessages || hasSteeringMessage ? 'queued'
					: completed ? turnStatus : 'idle';
	return {
		status,
		title: chat.title,
		queuedMessages,
		hasSteeringMessage,
		latestTurn: turn ? {
			id: turn.id,
			status: turnStatus,
			response: response.slice(0, maxRemoteSessionResponseLength),
			error: errorPart ? {
				type: errorPart.error.errorType,
				message: errorMessage.slice(0, maxRemoteSessionResponseLength),
				resumable: errorPart.resumable === true,
			} : null,
			truncated: response.length > maxRemoteSessionResponseLength || errorMessage.length > maxRemoteSessionResponseLength,
		} : null,
	};
}
