/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IChatToolInvocation } from '../../common/chatService/chatService.js';
import { IChatModel } from '../../common/model/chatModel.js';

export function getInProgressSessionDescription(chatModel: IChatModel): string | undefined {
	const requests = chatModel.getRequests();
	if (requests.length === 0) {
		return undefined;
	}

	// Get the last request to check its response status
	const lastRequest = requests.at(-1);
	const response = lastRequest?.response;
	if (!response) {
		return undefined;
	}

	// If the response is complete, show Finished
	if (response.isComplete) {
		return undefined;
	}

	// Get the response parts to find tool invocations and progress messages
	const responseParts = response.response.value;
	let description: string | IMarkdownString | undefined = '';

	for (let i = responseParts.length - 1; i >= 0; i--) {
		const part = responseParts[i];
		if (description) {
			break;
		}

		if (part.kind === 'confirmation' && typeof part.message === 'string') {
			description = part.message;
		} else if (part.kind === 'toolInvocation') {
			const toolInvocation = part as IChatToolInvocation;
			const state = toolInvocation.state.get();
			description = toolInvocation.generatedTitle || toolInvocation.pastTenseMessage || toolInvocation.invocationMessage;
			if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
				const confirmationTitle = state.confirmationMessages?.title;
				const titleMessage = confirmationTitle && (typeof confirmationTitle === 'string'
					? confirmationTitle
					: confirmationTitle.value);
				const descriptionValue = typeof description === 'string' ? description : description.value;
				description = titleMessage ?? localize('chat.sessions.description.waitingForConfirmation', "Waiting for confirmation: {0}", descriptionValue);
			}
		} else if (part.kind === 'toolInvocationSerialized') {
			description = part.invocationMessage;
		} else if (part.kind === 'progressMessage') {
			description = part.content;
		} else if (part.kind === 'thinking') {
			description = localize('chat.sessions.description.thinking', 'Thinking...');
		}
	}

	return description ? renderAsPlaintext(description, { useLinkFormatter: true }) : '';
}
