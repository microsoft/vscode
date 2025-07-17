/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { IToolImpl, IToolInvocation, IToolResult, IPreparedToolInvocation, IToolInvocationPreparationContext, ToolDataSource } from '../../../chat/common/languageModelToolsService.js';


interface IAskUserToContinuePollingInputParams extends IToolInvocation {
	parameters: {
		requestId: string;
	};
}

export const AskUserToContinuePollingToolData = {
	id: 'ask_user_to_continue_polling',
	toolReferenceName: 'askUserToContinuePolling',
	canBeReferencedInPrompt: false,
	displayName: localize('askUserToContinuePolling.displayName', 'Ask User To Continue Polling'),
	modelDescription: localize('askUserToContinuePolling.modelDescription', 'Asks the user if they want to continue polling for terminal output.'),
	userDescription: localize('askUserToContinuePolling.userDescription', 'Prompts the user to continue polling for up to 2 minutes.'),
	source: ToolDataSource.Internal,
	inputSchema: {

	}
};

export class AskUserToContinuePollingTool extends Disposable implements IToolImpl {
	constructor(
		@IChatService private readonly _chatService: IChatService
	) {
		super();
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('continuePolling', "Checking whether polling should continue"),
			pastTenseMessage: localize('continuePollingPast', "Checked whether polling should continue"),
			confirmationMessages: {
				title: localize('continuePollingConfirmation', "Continue polling for terminal output?"),
				message: localize('continuePollingConfirmationMessage', "Do you want to continue polling for terminal output for up to 2 minutes?")
			},
		};
	}

	async invoke(_invocation: IAskUserToContinuePollingInputParams): Promise<IToolResult> {
		const sessionId = _invocation.context?.sessionId;
		if (sessionId) {
			const session = this._chatService.getSession(sessionId);
			const request = session?.getRequests()[0]; // Assuming the first request is the one we want to check
			if (request?.response?.response.value.some((part =>
				part.kind === 'toolInvocation' && part.isConfirmed
			))) {
				return {
					content: [{
						kind: 'text',
						value: 'true'
					}]
				};
			}
		}
		return {
			content: [{
				kind: 'text',
				value: 'false'
			}]
		};
	}
}

