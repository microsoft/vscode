/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { IChatSessionsService } from '../chatSessionsService.js';
import { ChatModeKind } from '../constants.js';
import { IChatModel } from '../model/chatModel.js';
import { IChatSendRequestOptions } from './chatService.js';

export type ChatContinuationRequestOptions = Pick<IChatSendRequestOptions, 'userSelectedModelId' | 'modeInfo' | 'userSelectedTools' | 'agentIdSilent' | 'instructionContext'>;

/**
 * Returns send options that continue a session in the context of its last request: the same agent,
 * model, mode (including its permission level) and tools. Requests that are sent on the user's behalf
 * after a request finished, such as background work completing, use these so that they run like the
 * request that started the work instead of with the defaults of the chat input.
 */
export function getContinuationRequestOptions(model: IChatModel, chatSessionsService: IChatSessionsService): ChatContinuationRequestOptions {
	const options: ChatContinuationRequestOptions = {};
	const lastRequest = model.lastRequest;
	if (!lastRequest) {
		return options;
	}

	options.userSelectedModelId = lastRequest.modelId;
	options.modeInfo = lastRequest.modeInfo;
	const previousAgentId = lastRequest.response?.agent?.id;
	options.agentIdSilent = previousAgentId;
	const contribution = previousAgentId ? chatSessionsService.getChatSessionContribution(previousAgentId) : undefined;
	const autoAttachEnabled = contribution ? contribution.autoAttachReferences === true : true;
	if (autoAttachEnabled) {
		options.instructionContext = {
			modeKind: lastRequest.modeInfo?.kind ?? ChatModeKind.Agent,
			enabledTools: lastRequest.userSelectedTools,
		};
	}
	if (lastRequest.userSelectedTools) {
		options.userSelectedTools = constObservable(lastRequest.userSelectedTools);
	}
	return options;
}
