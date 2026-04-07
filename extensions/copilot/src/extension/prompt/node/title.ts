/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { sessionResourceToId } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { CapturingToken } from '../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger } from '../../../platform/requestLogger/node/requestLogger';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestTurn } from '../../../vscodeTypes';
import { renderPromptElement } from '../../prompts/node/base/promptRenderer';
import { TitlePrompt } from '../../prompts/node/panel/title';

export class ChatTitleProvider implements vscode.ChatTitleProvider {

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEndpointProvider private endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
	) { }

	async provideChatTitle(
		context: vscode.ChatContext,
		token: vscode.CancellationToken,
	): Promise<string | undefined> {

		// Get the first user message directly from the context
		// Use instanceof to properly check if the first item is a ChatRequestTurn
		const firstRequest = context.history.find(item => item instanceof ChatRequestTurn);
		if (!firstRequest) {
			return '';
		}

		// Extract the parent session ID from the context's sessionResource (provided by VS Code)
		const sessionResource = context.sessionResource;
		const parentChatSessionId = sessionResource ? sessionResourceToId(URI.from(sessionResource)) : undefined;

		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const { messages } = await renderPromptElement(this.instantiationService, endpoint, TitlePrompt, { userRequest: firstRequest.prompt });

		const capturingToken = new CapturingToken(
			'title',
			undefined,
			undefined,
			undefined,
			undefined,
			parentChatSessionId,
			'title',
		);

		const doRequest = async () => {
			const response = await endpoint.makeChatRequest2({
				debugName: 'title',
				messages,
				finishedCb: undefined,
				location: ChatLocation.Panel,
				userInitiatedRequest: false,
				isConversationRequest: false,
			}, token);
			return response;
		};

		const response = await this.requestLogger.captureInvocation(capturingToken, doRequest);
		if (token.isCancellationRequested) {
			return '';
		}

		if (response.type === ChatFetchResponseType.Success) {
			let title = response.value.trim();
			if (title.match(/^".*"$/)) {
				title = title.slice(1, -1);
			}

			if (title.includes('can\'t assist with that')) {
				return undefined;
			}

			return title;
		} else {
			this.logService.error(`Failed to fetch conversation title because of response type (${response.type}) and reason (${response.reason})`);
			return '';
		}
	}
}
