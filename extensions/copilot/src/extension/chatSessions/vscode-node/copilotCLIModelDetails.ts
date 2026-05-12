/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatSessionMetadataStore } from '../common/chatSessionMetadataStore';
import { ICopilotCLIModels, formatModelDetails, matchesCopilotCLIModel } from '../copilotcli/node/copilotCli';
import { ICopilotCLISession } from '../copilotcli/node/copilotcliSession';
import { formatModelDetailsWithCredits } from '../../../platform/chat/common/chatModelDetails';

export interface CopilotCLIModelDetails {
	readonly result: vscode.ChatResult;
	readonly responseModelId: string | undefined;
}

/**
 * Builds the chat result details for the model that produced the latest CLI response.
 */
export async function getCopilotCLIModelDetails(session: ICopilotCLISession, requestModel: { model: string; reasoningEffort?: string } | undefined, copilotCLIModels: ICopilotCLIModels, logService: ILogService, enabled: boolean, creditsUsed?: number): Promise<CopilotCLIModelDetails> {
	if (!enabled) {
		return { result: {}, responseModelId: undefined };
	}

	const models = await copilotCLIModels.getModels().catch(ex => {
		logService.error(ex, 'Failed to get models');
		return [];
	});
	const selectedModelId = await session.getSelectedModelId().catch(ex => {
		logService.error(ex, 'Failed to get selected model');
		return undefined;
	});
	const responseModelId = session.getLastResponseModelId();
	const modelInfo = [responseModelId, selectedModelId, requestModel?.model]
		.map(modelId => modelId ? models.find(model => matchesCopilotCLIModel(model, modelId)) : undefined)
		.find(modelInfo => !!modelInfo);

	let details: string | undefined;
	if (modelInfo && creditsUsed !== undefined) {
		details = formatModelDetailsWithCredits(modelInfo.name, creditsUsed);
	} else if (modelInfo) {
		details = formatModelDetails(modelInfo);
	}

	return {
		result: details ? { details } : {},
		responseModelId,
	};
}

/**
 * Persists the concrete response model id and credits used so rebuilt history can recover details for auto-mode requests.
 */
export function persistCopilotCLIResponseModelId(sessionId: string, requestId: string, responseModelId: string | undefined, chatSessionMetadataStore: IChatSessionMetadataStore, logService: ILogService, creditsUsed?: number): void {
	if (!responseModelId && creditsUsed === undefined) {
		return;
	}
	chatSessionMetadataStore.updateRequestDetails(sessionId, [{ vscodeRequestId: requestId, responseModelId, creditsUsed }])
		.catch(ex => logService.error(ex, 'Failed to persist response model id'));
}
