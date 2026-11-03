/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Message } from '../../state/protocol/state.js';

const hiddenKey = 'vscode.chat.hiddenFromTranscript';
const hiddenPrefix = '<!-- vscode-hidden-from-transcript -->\n';
const requestHiddenKey = 'vscode.chat.requestHiddenFromTranscript';
const requestHiddenPrefix = '<!-- vscode-request-hidden-from-transcript -->\n';
const labelKey = 'vscode.chat.systemInitiatedLabel';
const replacedTurnKey = 'vscode.chat.replacedTurn';

export function hasMessagePresentation(message: Message): boolean {
	return [hiddenKey, requestHiddenKey, labelKey].some(key => !!message._meta && Object.hasOwn(message._meta, key))
		|| message.text.startsWith(hiddenPrefix) || message.text.startsWith(requestHiddenPrefix);
}

export function readMessagePresentation(message: Message) {
	const label = message._meta?.[labelKey];
	return {
		hiddenFromTranscript: message._meta?.[hiddenKey] === true || message.text.startsWith(hiddenPrefix),
		requestHiddenFromTranscript: message._meta?.[requestHiddenKey] === true || message.text.startsWith(requestHiddenPrefix),
		systemInitiatedLabel: typeof label === 'string' ? label : undefined,
	};
}

export function withMessageHiddenFromTranscript(message: Message, hidden: boolean | undefined): Message {
	return hidden ? {
		...message,
		text: message.text.startsWith(hiddenPrefix) ? message.text : hiddenPrefix + message.text,
		_meta: { ...message._meta, [hiddenKey]: true },
	} : message;
}

export function withMessageRequestHiddenFromTranscript(message: Message, hidden: boolean | undefined): Message {
	return hidden && !readMessagePresentation(message).hiddenFromTranscript ? {
		...message,
		text: message.text.startsWith(requestHiddenPrefix) ? message.text : requestHiddenPrefix + message.text,
		_meta: { ...message._meta, [requestHiddenKey]: true },
	} : message;
}

export function withMessageSystemInitiatedLabel(message: Message, label: string): Message {
	return { ...message, _meta: { ...message._meta, [labelKey]: label } };
}

/** Marks a host-written turn as the replacement of an earlier turn that the host removed. */
export function withMessageReplacedTurn(message: Message, turnId: string): Message {
	return { ...message, _meta: { ...message._meta, [replacedTurnKey]: turnId } };
}

export function readMessageReplacedTurn(message: Message): string | undefined {
	const turnId = message._meta?.[replacedTurnKey];
	return typeof turnId === 'string' && turnId.length > 0 ? turnId : undefined;
}
