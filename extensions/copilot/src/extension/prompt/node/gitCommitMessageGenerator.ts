/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IConversationOptions } from '../../../platform/chat/common/conversationOptions';
import { IInteractionService } from '../../../platform/chat/common/interactionService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { Diff } from '../../../platform/git/common/gitDiffService';
import { INotificationService } from '../../../platform/notification/common/notificationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { GitCommitMessagePrompt } from '../../prompts/node/git/gitCommitMessagePrompt';
import { RecentCommitMessages } from '../common/repository';

type ResponseFormat = 'noTextCodeBlock' | 'oneTextCodeBlock' | 'multipleTextCodeBlocks';

export class GitCommitMessageGenerator {
	constructor(
		@IConversationOptions private readonly conversationOptions: IConversationOptions,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInteractionService private readonly interactionService: IInteractionService,
		@IAuthenticationService private readonly authService: IAuthenticationService,
	) { }

	async generateGitCommitMessage(repositoryName: string, branchName: string, changes: Diff[], recentCommitMessages: RecentCommitMessages, attemptCount: number, token: CancellationToken): Promise<string | undefined> {
		const startTime = Date.now();

		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const promptRenderer = PromptRenderer.create(this.instantiationService, endpoint, GitCommitMessagePrompt, { repositoryName, branchName, changes, recentCommitMessages });
		const prompt = await promptRenderer.render(undefined, undefined);

		const temperature = Math.min(
			this.conversationOptions.temperature * (1 + attemptCount),
			2 /* MAX temperature - https://platform.openai.com/docs/api-reference/chat/create#chat/create-temperature */
		);

		const requestStartTime = Date.now();
		this.interactionService.startInteraction();
		const fetchResult = await endpoint
			.makeChatRequest(
				'gitCommitMessageGenerator',
				prompt.messages,
				undefined,
				token,
				ChatLocation.Other,
				undefined,
				{ temperature },
				true
			);

		/* __GDPR__
			"git.generateCommitMessage" : {
				"owner": "lszomoru",
				"comment": "Metadata about the git commit message generation",
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that is used in the endpoint." },
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
				"responseType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The result type of the response." },
				"attemptCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many times the user has retried." },
				"diffFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of files in the commit." },
				"diffLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The length of the diffs in the commit." },
				"timeToRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to start the request." },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to complete the request." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('git.generateCommitMessage', {
			model: endpoint.model,
			requestId: fetchResult.requestId,
			responseType: fetchResult.type
		}, {
			attemptCount: attemptCount + 1,
			diffFileCount: changes.length,
			diffLength: changes.map(c => c.diff).join('').length,
			timeToRequest: requestStartTime - startTime,
			timeToComplete: Date.now() - startTime
		});

		if (fetchResult.type === ChatFetchResponseType.QuotaExceeded || (fetchResult.type === ChatFetchResponseType.RateLimited && this.authService.copilotToken?.isNoAuthUser)) {
			await this.notificationService.showQuotaExceededDialog({ isNoAuthUser: this.authService.copilotToken?.isNoAuthUser ?? false });
			return undefined;
		}

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return undefined;
		}

		const [responseFormat, commitMessage] = this.processGeneratedCommitMessage(fetchResult.value);
		if (responseFormat !== 'oneTextCodeBlock') {
			/* __GDPR__
				"git.generateCommitMessageIncorrectResponseFormat" : {
					"owner": "lszomoru",
					"comment": "Metadata about the git commit message generation when the response is not in the expected format",
					"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The id of the current request turn." },
					"responseFormat": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of the response format." }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent('git.generateCommitMessageIncorrectResponseFormat', { requestId: fetchResult.requestId, responseFormat });
		}

		return commitMessage;
	}

	private processGeneratedCommitMessage(raw: string): [ResponseFormat, string] {
		const textCodeBlockRegex = /^```text\s*([\s\S]+?)\s*```$/m;
		const textCodeBlockMatch = textCodeBlockRegex.exec(raw);

		if (textCodeBlockMatch === null) {
			return ['noTextCodeBlock', raw];
		}
		if (textCodeBlockMatch.length !== 2) {
			return ['multipleTextCodeBlocks', raw];
		}

		return ['oneTextCodeBlock', textCodeBlockMatch[1]];
	}
}
