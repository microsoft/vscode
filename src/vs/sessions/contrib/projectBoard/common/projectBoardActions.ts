/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { IChatResponseErrorDetails, IChatToolInvocation } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';

export interface IProjectBoardPendingActions {
	readonly model: IChatModel;
	readonly request: IChatRequestModel;
	readonly response: IChatResponseModel;
	readonly tools: readonly IChatToolInvocation[];
	readonly error: IChatResponseErrorDetails | undefined;
	readonly limited: boolean;
}

export function getProjectBoardPendingActions(model: IChatModel, reader?: IReader): IProjectBoardPendingActions | undefined {
	const request = model.lastRequestObs.read(reader);
	const response = request?.response;
	if (!request || request.isHiddenFromTranscript || request.isRequestHiddenFromTranscript || request.isSystemInitiated || !response) {
		return undefined;
	}
	const parts = response.response.value;
	const tools: IChatToolInvocation[] = [];
	let limited = !response.isComplete && !response.isCanceled && parts.length > 256;
	if (!response.isComplete && !response.isCanceled) {
		for (const part of parts.slice(-256)) {
			if (part.kind === 'toolInvocation' && part.presentation !== 'hidden') {
				const state = part.state.read(reader);
				if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
					if (tools.length < 8) {
						tools.push(part);
					} else {
						limited = true;
					}
				}
			}
		}
	}
	const details = response.result?.errorDetails;
	const error = details?.confirmationButtons?.length && !details.responseIsFiltered && !details.isQuotaExceeded && !details.isRateLimited && !model.requestInProgress.read(reader) ? details : undefined;
	return tools.length || error || limited ? { model, request, response, tools, error, limited } : undefined;
}

export function canRunProjectBoardAction(actions: IProjectBoardPendingActions, tool?: IChatToolInvocation): boolean {
	const request = actions.model.lastRequest;
	if (request !== actions.request || request.response !== actions.response) {
		return false;
	}
	if (tool) {
		const state = tool.state.get();
		return !actions.response.isComplete && !actions.response.isCanceled
			&& actions.response.response.value.includes(tool)
			&& (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval);
	}
	return !!actions.error && actions.response.result?.errorDetails === actions.error && !actions.model.requestInProgress.get();
}
