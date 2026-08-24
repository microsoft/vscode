/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';

export function stringifyChatMessages(messages: Raw.ChatMessage[]) {
	return messages.map(stringifyMessage).join('\n');
}

function stringifyMessage({ role, content }: Raw.ChatMessage) {
	if (role !== Raw.ChatRole.User && role !== Raw.ChatRole.System) {
		return 'omitted because of non-user and non-system role'; // should be impossible
	}

	const roleStr = role === Raw.ChatRole.User ? 'User' : 'System';

	const textContentPart = content.at(0);
	if (textContentPart?.type !== Raw.ChatCompletionContentPartKind.Text) {
		return 'omitted because of non-text content'; // should be impossible
	}

	return (
		`${roleStr}
------
${textContentPart.text}
==================`);
}
