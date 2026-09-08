/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAgentWorkspaceContinuationMessage } from './agentWorkspaceContinuationMeta.js';
import { MessageKind, type Message } from '../state/protocol/state.js';

const MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY = 'vscode.chat.hiddenFromTranscript';
const MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX = '<!-- vscode-hidden-from-transcript -->\n';
const MESSAGE_REQUEST_HIDDEN_FROM_TRANSCRIPT_META_KEY = 'vscode.chat.requestHiddenFromTranscript';
const MESSAGE_REQUEST_HIDDEN_FROM_TRANSCRIPT_PREFIX = '<!-- vscode-request-hidden-from-transcript -->\n';
const MESSAGE_SYSTEM_INITIATED_LABEL_META_KEY = 'vscode.chat.systemInitiatedLabel';

function readMessageMeta(message: Message): { readonly hiddenFromTranscript: boolean; readonly requestHiddenFromTranscript: boolean; readonly systemInitiatedLabel: string | undefined } {
	const meta = message._meta;
	const systemInitiatedLabel = meta?.[MESSAGE_SYSTEM_INITIATED_LABEL_META_KEY];
	const hiddenFromTranscript = meta?.[MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY] === true
		|| message.text.startsWith(MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX);
	return {
		hiddenFromTranscript,
		requestHiddenFromTranscript: meta?.[MESSAGE_REQUEST_HIDDEN_FROM_TRANSCRIPT_META_KEY] === true
			|| message.text.startsWith(MESSAGE_REQUEST_HIDDEN_FROM_TRANSCRIPT_PREFIX),
		systemInitiatedLabel: typeof systemInitiatedLabel === 'string' ? systemInitiatedLabel : undefined,
	};
}

export function isMessageHiddenFromTranscript(message: Message): boolean {
	return readMessageMeta(message).hiddenFromTranscript;
}

/** Whether only the message's request row is hidden while its response remains visible. */
export function isMessageRequestHiddenFromTranscript(message: Message): boolean {
	return readMessageMeta(message).requestHiddenFromTranscript;
}

export function readMessageSystemInitiatedLabel(message: Message): string | undefined {
	return readMessageMeta(message).systemInitiatedLabel;
}

export function withMessageHiddenFromTranscript(message: Message, hidden: boolean | undefined): Message {
	if (!hidden) {
		return message;
	}
	return {
		...message,
		text: message.text.startsWith(MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX) ? message.text : MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX + message.text,
		_meta: {
			...message._meta,
			[MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY]: true,
		},
	};
}

/** Marks only the message's request row as hidden while preserving its response. */
export function withMessageRequestHiddenFromTranscript(message: Message, hidden: boolean | undefined): Message {
	if (!hidden || isMessageHiddenFromTranscript(message)) {
		return message;
	}
	return {
		...message,
		text: message.text.startsWith(MESSAGE_REQUEST_HIDDEN_FROM_TRANSCRIPT_PREFIX) ? message.text : MESSAGE_REQUEST_HIDDEN_FROM_TRANSCRIPT_PREFIX + message.text,
		_meta: {
			...message._meta,
			[MESSAGE_REQUEST_HIDDEN_FROM_TRANSCRIPT_META_KEY]: true,
		},
	};
}

export function withMessageSystemInitiatedLabel(message: Message, label: string): Message {
	return {
		...message,
		_meta: {
			...message._meta,
			[MESSAGE_SYSTEM_INITIATED_LABEL_META_KEY]: label,
		},
	};
}

/**
 * Whether `turn` is a hidden system notification the host appended purely to
 * carry a message (e.g. an Agent Merge status change). It never reaches the
 * provider and never captures a checkpoint, so it can never own file changes
 * and must be skipped when resolving a "last turn" for per-turn changes.
 *
 * A *visible* system notification (a background-agent completion, an Agent
 * Merge repair prompt) is a real turn and is deliberately not matched.
 * A hidden workspace-continuation request is also a real provider turn.
 */
export function isHostNoticeTurn(turn: { readonly message: Message }): boolean {
	return turn.message.origin.kind === MessageKind.SystemNotification
		&& (isMessageHiddenFromTranscript(turn.message) || isMessageRequestHiddenFromTranscript(turn.message))
		&& !isAgentWorkspaceContinuationMessage(turn.message);
}

/** Returns the last turn id that can own file changes, or `undefined` if there is none. */
export function lastAttributableTurnId(turns: readonly { readonly id: string; readonly message: Message }[] | undefined): string | undefined {
	if (!turns) {
		return undefined;
	}
	for (let i = turns.length - 1; i >= 0; i--) {
		if (!isHostNoticeTurn(turns[i])) {
			return turns[i].id;
		}
	}
	return undefined;
}
