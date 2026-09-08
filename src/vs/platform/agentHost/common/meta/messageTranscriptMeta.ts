/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Message } from '../state/protocol/state.js';

const MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY = 'vscode.chat.hiddenFromTranscript';
const MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX = '<!-- vscode-hidden-from-transcript -->\n';

function readMessageMeta(message: Message): { readonly hiddenFromTranscript: boolean } {
	const meta = message._meta;
	return {
		hiddenFromTranscript: meta?.[MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY] === true,
	};
}

export function isMessageHiddenFromTranscript(message: Message): boolean {
	return readMessageMeta(message).hiddenFromTranscript
		|| message.text.startsWith(MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX);
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
