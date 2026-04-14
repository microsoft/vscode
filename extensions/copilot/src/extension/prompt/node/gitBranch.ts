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
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestTurn } from '../../../vscodeTypes';
import { renderPromptElement } from '../../prompts/node/base/promptRenderer';
import { GitBranchPrompt } from '../../prompts/node/panel/gitBranch';

export class GitBranchNameGenerator {

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEndpointProvider private endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
	) { }

	async generateBranchName(
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
		const normalizedCommand = firstRequest.command?.trim().replace(/^\/+/, '') ?? '';
		const command = normalizedCommand ? `/${normalizedCommand} ` : '';
		const userRequest = `${command}${firstRequest.prompt}`;
		const { messages } = await renderPromptElement(this.instantiationService, endpoint, GitBranchPrompt, { userRequest });

		const capturingToken = new CapturingToken(
			'git-branch',
			undefined,
			undefined,
			undefined,
			undefined,
			parentChatSessionId,
			'git-branch',
		);

		const doRequest = async () => {
			const response = await endpoint.makeChatRequest2({
				debugName: 'git-branch',
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
			let branchName = response.value.trim();
			if (branchName.match(/^".*"$/)) {
				branchName = branchName.slice(1, -1);
			}
			if (branchName.includes('can\'t assist with that')) {
				return undefined;
			}

			branchName = normalizeBranchName(branchName);
			if (branchName.length < 8) {
				throw new Error('Branch name is too short. Please keep it at least 8 characters.');
			}

			return branchName;
		} else {
			this.logService.error(`Failed to fetch git branch name because of response type (${response.type}) and reason (${response.reason})`);
			return '';
		}
	}
}

export function normalizeBranchName(branchName: string): string {
	// Only support alphanumeric characters and dashes for simplicity.
	let normalized = branchName.replace(/[^a-zA-Z0-9\-]/g, '').toLowerCase();
	// Collapse consecutive dots (..) into a single dot
	normalized = normalized.replace(/\.{2,}/g, '.');
	// Strip leading '-' or '.'
	normalized = normalized.replace(/^[-.]+/, '');
	// Strip trailing '.' or '/'
	normalized = normalized.replace(/[./]+$/, '');
	// Strip trailing .lock
	normalized = normalized.replace(/\.lock$/, '');

	return normalized;
}
