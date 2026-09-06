/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAI, Raw } from '@vscode/prompt-tsx';
import { assertNever } from '../../../util/vs/base/common/assert';

/**
 * Gets the text content part out of the message.
 * In the event it is an `ChatCompletionContentPart`, it will extract out the `ChatCompletionContentPartText`.
 **/
export function getTextPart(message: string | Raw.ChatCompletionContentPart[] | Raw.ChatCompletionContentPart | OpenAI.ChatCompletionContentPart[] | OpenAI.ChatCompletionContentPart): string {
	if (!message) {
		return '';
	}

	if (typeof message === 'string') {
		return message;
	}

	if (!Array.isArray(message)) {
		return message.type === Raw.ChatCompletionContentPartKind.Text ? message.text : '';
	}

	return message.map(c => (c.type === Raw.ChatCompletionContentPartKind.Text || c.type === 'text') ? c.text : '').join('');
}


export function toTextPart(message: string): Raw.ChatCompletionContentPartText {
	return {
		type: Raw.ChatCompletionContentPartKind.Text,
		text: message
	};
}

export function toTextParts(message: string): Raw.ChatCompletionContentPartText[] {
	return [toTextPart(message)];
}

export function roleToString(role: Raw.ChatRole): 'system' | 'user' | 'assistant' | 'tool' {
	switch (role) {
		case Raw.ChatRole.System:
			return 'system';
		case Raw.ChatRole.User:
			return 'user';
		case Raw.ChatRole.Assistant:
			return 'assistant';
		case Raw.ChatRole.Tool:
			return 'tool';
		default:
			assertNever(role, `unknown role (${role})`);
	}
}
