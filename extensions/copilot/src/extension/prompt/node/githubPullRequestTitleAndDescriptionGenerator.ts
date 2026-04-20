/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RenderPromptResult } from '@vscode/prompt-tsx';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IConversationOptions } from '../../../platform/chat/common/conversationOptions';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { INotificationService } from '../../../platform/notification/common/notificationService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { DisposableStore, } from '../../../util/vs/base/common/lifecycle';
import { isStringArray } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { TitleAndDescriptionProvider } from '../../githubPullRequest';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { GitHubPullRequestPrompt } from '../../prompts/node/github/pullRequestDescriptionPrompt';

export class GitHubPullRequestTitleAndDescriptionGenerator implements TitleAndDescriptionProvider {
	protected readonly disposables: DisposableStore = new DisposableStore();
	private lastContext: { commitMessages: string[]; patches: string[] } = { commitMessages: [], patches: [] };

	constructor(
		@ILogService protected readonly logService: ILogService,
		@IConversationOptions private readonly options: IConversationOptions,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IAuthenticationService private readonly authService: IAuthenticationService,
	) {
		this.logService.info('[githubTitleAndDescriptionProvider] Initializing GitHub PR title and description provider provider.');
	}

	dispose() {
		this.disposables.dispose();
	}

	private isRegenerate(commitMessages: string[], patches: string[]): boolean {
		if (commitMessages.length !== this.lastContext.commitMessages.length || patches.length !== this.lastContext.patches.length) {
			return false;
		}
		for (let i = 0; i < commitMessages.length; i++) {
			if (commitMessages[i] !== this.lastContext.commitMessages[i]) {
				return false;
			}
		}
		for (let i = 0; i < patches.length; i++) {
			if (patches[i] !== this.lastContext.patches[i]) {
				return false;
			}
		}
		return true;
	}

	private async excludePatches(allPatches: { patch: string; fileUri?: string; previousFileUri?: string }[]): Promise<string[]> {
		const patches: string[] = [];
		for (const patch of allPatches) {
			if (patch.fileUri && await this.ignoreService.isCopilotIgnored(URI.parse(patch.fileUri))) {
				continue;
			}

			if (patch.previousFileUri && patch.previousFileUri !== patch.fileUri && await this.ignoreService.isCopilotIgnored(URI.parse(patch.previousFileUri))) {
				continue;
			}

			patches.push(patch.patch);
		}
		return patches;
	}

	async provideTitleAndDescription(context: { commitMessages: string[]; patches: string[] | { patch: string; fileUri: string; previousFileUri?: string }[]; issues?: { reference: string; content: string }[]; template?: string }, token: CancellationToken): Promise<{ title: string; description?: string } | undefined> {
		const commitMessages: string[] = context.commitMessages;
		const allPatches: { patch: string; fileUri?: string; previousFileUri?: string }[] = isStringArray(context.patches) ? context.patches.map(patch => ({ patch })) : context.patches;
		const patches = await this.excludePatches(allPatches);
		const issues: { reference: string; content: string }[] | undefined = context.issues;
		const template: string | undefined = context.template;

		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const charLimit = Math.floor((endpoint.modelMaxPromptTokens * 4) / 3);

		const prompt = await this.createPRTitleAndDescriptionPrompt(commitMessages, patches, issues, template, charLimit);
		const fetchResult = await endpoint
			.makeChatRequest(
				'githubPullRequestTitleAndDescriptionGenerator',
				prompt.messages,
				undefined,
				token,
				ChatLocation.Other,
				undefined,
				{
					temperature: this.isRegenerate(commitMessages, patches) ? this.options.temperature + 0.1 : this.options.temperature,
				},
			);

		this.lastContext = { commitMessages, patches };
		if (fetchResult.type === ChatFetchResponseType.QuotaExceeded || (fetchResult.type === ChatFetchResponseType.RateLimited && this.authService.copilotToken?.isNoAuthUser)) {
			await this.notificationService.showQuotaExceededDialog({ isNoAuthUser: this.authService.copilotToken?.isNoAuthUser ?? false });
		}

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return undefined;
		}

		return GitHubPullRequestTitleAndDescriptionGenerator.parseFetchResult(fetchResult.value, !!template);
	}

	public static parseFetchResult(value: string, hasTemplate: boolean = false, retry: boolean = true): { title: string; description?: string } | undefined {
		value = value.trim();
		let workingValue = value;
		let delimiter = '+++';
		const firstIndexOfDelimiter = workingValue.indexOf(delimiter);
		if (firstIndexOfDelimiter === -1) {
			return undefined;
		}

		// adjust delimter as the model sometimes adds more +s
		while (workingValue.charAt(firstIndexOfDelimiter + delimiter.length) === '+') {
			delimiter += '+';
		}

		const lastIndexOfDelimiter = workingValue.lastIndexOf(delimiter);
		workingValue = workingValue.substring(firstIndexOfDelimiter + delimiter.length, lastIndexOfDelimiter > firstIndexOfDelimiter + delimiter.length ? lastIndexOfDelimiter : undefined).trim().replace(/\++?(\n)\++/, delimiter);
		const splitOnPlus = workingValue.split(delimiter).filter(s => s.trim().length > 0);
		let splitOnLines: string[];
		if (splitOnPlus.length === 1) {
			// If there's only one line, split on newlines as the model has left out some +++ delimiters
			splitOnLines = splitOnPlus[0].split('\n');
		} else if (splitOnPlus.length > 1) {
			if (hasTemplate) {
				// When using a template, keep description whitespace as-is.
				splitOnLines = splitOnPlus;
			} else {
				const descriptionLines = splitOnPlus.slice(1).map(line => line.split('\n')).flat().filter(s => s.trim().length > 0);
				splitOnLines = [splitOnPlus[0], ...descriptionLines];
			}
		} else {
			return undefined;
		}

		let title: string | undefined;
		let description: string | undefined;
		if (splitOnLines.length === 1) {
			title = splitOnLines[0].trim();
			if (retry && value.includes('\n') && (value.split(delimiter).length === 3)) {
				return this.parseFetchResult(value + delimiter, hasTemplate, false);
			}
		} else if (splitOnLines.length > 1) {
			title = splitOnLines[0].trim();

			description = '';
			const descriptionLines = splitOnLines.slice(1);
			// The description can be kind of self referential. Clean it up.
			for (const line of descriptionLines) {
				if (line.includes('commit message')) {
					continue;
				}
				description += `${line.trim()}\n\n`;
			}
		}
		if (title) {
			title = title.replace(/Title\:\s/, '').trim();
			title = title.replace(/^\"(?<title>.+)\"$/, (_match, title) => title);
			if (description && !hasTemplate) {
				description = description.replace(/Description\:\s/, '').trim();
			}
			return { title, description };
		}
	}

	private async createPRTitleAndDescriptionPrompt(commitMessages: string[], patches: string[], issues: { reference: string; content: string }[] | undefined, template: string | undefined, charLimit: number): Promise<RenderPromptResult> {
		// Reserve 20% of the character limit for the safety rules and instructions
		const availableChars = charLimit - Math.floor(charLimit * 0.2);

		// Remove diffs if needed (shortest diffs first)
		let totalChars = patches.join('\n\n').length;
		if (totalChars > availableChars) {
			// Sort diffs by length
			patches.sort((a, b) => a.length - b.length);

			// Remove diff(s) until we are under the character limit
			while (totalChars > availableChars && patches.length > 0) {
				const lastPatch = patches.pop()!;
				totalChars -= lastPatch.length;
			}
		}

		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const promptRenderer = PromptRenderer.create(this.instantiationService, endpoint, GitHubPullRequestPrompt, { commitMessages, issues, patches, template });
		return promptRenderer.render(undefined, undefined);
	}
}
