/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { ChatElicitationRequestPart } from '../../chat/browser/chatElicitationRequestPart.js';
import { ChatModel } from '../../chat/common/chatModel.js';
import { IChatService } from '../../chat/common/chatService.js';
import { IToolInvocationContext } from '../../chat/common/languageModelToolsService.js';

function createYesNoPrompt(
	context: IToolInvocationContext,
	chatService: IChatService,
	title: string | MarkdownString,
	description: string | MarkdownString
): { promise: Promise<boolean>; part?: ChatElicitationRequestPart } {
	const chatModel = chatService.getSession(context.sessionId);
	if (chatModel instanceof ChatModel) {
		const request = chatModel.getRequests().at(-1);
		if (request) {
			let part: ChatElicitationRequestPart | undefined = undefined;
			const promise = new Promise<boolean>(resolve => {
				const thePart = part = new ChatElicitationRequestPart(
					title,
					description,
					'',
					localize('poll.terminal.accept', 'Yes'),
					localize('poll.terminal.reject', 'No'),
					async () => {
						thePart.state = 'accepted';
						thePart.hide();
						resolve(true);
					},
					async () => {
						thePart.state = 'rejected';
						thePart.hide();
						resolve(false);
					}
				);
				chatModel.acceptResponseProgress(request, thePart);
			});
			return { promise, part };
		}
	}
	return { promise: Promise.resolve(false) };
}

export function promptForMorePolling(title: string, message: string, context: IToolInvocationContext, chatService: IChatService): { promise: Promise<boolean>; part?: ChatElicitationRequestPart } {
	return createYesNoPrompt(
		context,
		chatService,
		title,
		message
	);
}

export function promptForYesNo(title: string | MarkdownString, message: string | MarkdownString, context: IToolInvocationContext, chatService: IChatService): { promise: Promise<boolean>; part?: ChatElicitationRequestPart } {
	return createYesNoPrompt(
		context,
		chatService,
		title,
		message
	);
}
