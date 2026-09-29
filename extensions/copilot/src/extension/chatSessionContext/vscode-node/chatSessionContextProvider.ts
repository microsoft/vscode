/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IGitService, RepoContext } from '../../../platform/git/common/gitService';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { ILanguageContextProviderService, ProviderTarget } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, IObservable } from '../../../util/vs/base/common/observableInternal';
import { LanguageModelChatMessage, LanguageModelTextPart } from '../../../vscodeTypes';
import { IConversationStore } from '../../conversationStore/node/conversationStore';
import { Conversation } from '../../prompt/common/conversation';

interface SummaryCache {
	readonly cacheKey: string;
	readonly promise: Promise<string | undefined>;
}

const SINGLE_TURN_MESSAGE_LIMIT = 1_000;
const MAX_TOTAL_MESSAGE_LENGTH = 10_000;

export class ChatSessionContextContribution extends Disposable {

	private readonly _enableChatSessionContextProvider: IObservable<boolean>;
	private _branchChangeTime: number | undefined;
	private _lastBranchName: string | undefined;
	private _summaryCache: SummaryCache | undefined;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IGitService private readonly gitService: IGitService,
		@IConversationStore private readonly conversationStore: IConversationStore,
		@ILanguageContextProviderService private readonly languageContextProviderService: ILanguageContextProviderService,
	) {
		super();
		this._enableChatSessionContextProvider = configurationService.getExperimentBasedConfigObservable(ConfigKey.Advanced.ChatSessionContextProvider, experimentationService);
		this._register(autorun(reader => {
			if (this._enableChatSessionContextProvider.read(reader)) {
				reader.store.add(this.register());
				reader.store.add(this.trackBranchChanges());
			}
		}));
	}

	private trackBranchChanges(): IDisposable {
		const disposables = new DisposableStore();

		// Track branch changes for each repository
		disposables.add(this.gitService.onDidOpenRepository(repo => {
			disposables.add(this.watchBranchChanges(repo));
		}));

		// Watch already opened repositories
		for (const repo of this.gitService.repositories) {
			disposables.add(this.watchBranchChanges(repo));
		}

		return disposables;
	}

	private watchBranchChanges(repo: RepoContext): IDisposable {
		const headBranchObs = repo.headBranchNameObs;
		return autorun(reader => {
			const branchName = headBranchObs.read(reader);
			if (branchName !== this._lastBranchName) {
				this._lastBranchName = branchName;
				this._branchChangeTime = Date.now();
				// Invalidate the cache when the branch changes
				this._summaryCache = undefined;
				this.logService.trace(`[ChatSessionContextProvider] Branch changed to: ${branchName}`);
			}
		});
	}

	private register(): IDisposable {
		const disposables = new DisposableStore();
		try {
			const resolver = new ContextResolver(
				this.logService,
				this.conversationStore,
				() => this._branchChangeTime,
				() => this._summaryCache,
				(cache) => { this._summaryCache = cache; }
			);
			const nesProvider: Copilot.ContextProvider<Copilot.SupportedContextItem> = {
				id: 'chat-session-context-provider',
				selector: '*',
				resolver: resolver
			};
			const scmProvider: Copilot.ContextProvider<Copilot.SupportedContextItem> = {
				id: 'chat-session-context-provider',
				selector: { language: 'scminput' },
				resolver: resolver
			};
			disposables.add(this.languageContextProviderService.registerContextProvider(nesProvider, [ProviderTarget.NES]));
			disposables.add(this.languageContextProviderService.registerContextProvider(scmProvider, [ProviderTarget.Completions]));
		} catch (error) {
			this.logService.error('Error registering chat session context provider:', error);
		}
		return disposables;
	}
}

class ContextResolver implements Copilot.ContextResolver<Copilot.SupportedContextItem> {

	constructor(
		private readonly logService: ILogService,
		private readonly conversationStore: IConversationStore,
		private readonly getBranchChangeTime: () => number | undefined,
		private readonly getSummaryCache: () => SummaryCache | undefined,
		private readonly setSummaryCache: (cache: SummaryCache | undefined) => void,
	) { }

	async resolve(request: Copilot.ResolveRequest, token: CancellationToken): Promise<Copilot.SupportedContextItem[]> {
		try {
			const conversation = this.conversationStore.lastConversation;
			if (!conversation) {
				return [];
			}

			// Check if the conversation started before the branch change
			const branchChangeTime = this.getBranchChangeTime();
			const firstTurnStartTime = this.getFirstTurnStartTime(conversation);
			if (branchChangeTime !== undefined && firstTurnStartTime < branchChangeTime) {
				this.logService.trace(`[ChatSessionContextProvider] Skipping conversation that started before branch change`);
				return [];
			}

			// Check if we have a cached or in-progress summary for this conversation
			const existingCache = this.getSummaryCache();
			const cacheKey = this.getCacheKey(conversation);
			if (existingCache && existingCache.cacheKey === cacheKey) {
				// Await the existing promise (whether it's still running or already resolved)
				const summary = await existingCache.promise;
				if (summary) {
					return this.createTraitFromSummary(summary);
				}
				return [];
			}

			// Start a new summary generation and cache the promise immediately
			// Note: We don't pass the cancellation token to avoid cancelling on subsequent calls
			const summaryPromise = this.generateSummary(conversation);
			this.setSummaryCache({
				cacheKey,
				promise: summaryPromise
			});

			const summary = await summaryPromise;
			if (summary) {
				return this.createTraitFromSummary(summary);
			}
			return [];
		} catch (error) {
			this.logService.error('[ChatSessionContextProvider] Error resolving context:', error);
			return [];
		}
	}

	private getFirstTurnStartTime(conversation: Conversation): number {
		const turns = conversation.turns;
		if (turns.length === 0) {
			return Date.now();
		}
		return turns[0].startTime;
	}

	private getCacheKey(conversation: Conversation): string {
		return `${conversation.sessionId}:${conversation.turns.length}`;
	}

	private async generateSummary(conversation: Conversation): Promise<string | undefined> {
		try {
			// Build a prompt from the conversation
			const conversationContent = this.buildConversationContent(conversation);
			if (!conversationContent) {
				return undefined;
			}

			// Select a mini model (gpt-4o-mini)
			const models = await vscode.lm.selectChatModels({ family: 'gpt-4o-mini', vendor: 'copilot' });
			if (models.length === 0) {
				// Fallback to any available model
				const allModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
				if (allModels.length === 0) {
					this.logService.trace('[ChatSessionContextProvider] No language models available');
					return undefined;
				}
				models.push(allModels[0]);
			}

			const model = models[0];
			const systemPrompt = `You are a helpful assistant that summarizes conversations. Given a chat conversation between a user and an AI assistant, describe what the user is trying to accomplish in 5 sentences or less. Focus on the user's intent and goals.`;

			const messages = [
				LanguageModelChatMessage.User(`${systemPrompt}\n\nConversation:\n${conversationContent}\n\nSummarize what the user is trying to do in 5 sentences or less:`)
			];

			// Note: We intentionally don't pass a cancellation token to avoid cancelling
			// when multiple resolve() calls come in quick succession
			const response = await model.sendRequest(messages, {});

			let summary = '';
			for await (const part of response.stream) {
				if (part instanceof LanguageModelTextPart) {
					summary += part.value;
				}
			}

			return summary.trim() || undefined;
		} catch (error) {
			this.logService.error('[ChatSessionContextProvider] Error generating summary:', error);
			return undefined;
		}
	}

	private buildConversationContent(conversation: Conversation): string | undefined {
		const turns = conversation.turns;
		if (turns.length === 0) {
			return undefined;
		}

		const lines: string[] = [];
		for (const turn of turns) {
			// Add user message
			if (turn.request?.message) {
				lines.push(`User: ${turn.request.message}`);
			}

			// Add assistant response
			if (turn.responseMessage?.message) {
				// Truncate long responses
				const truncatedIndicator = '\n... (truncated) ...\n';
				const responseMessage = turn.responseMessage.message;
				const truncatedMessage = responseMessage.length > SINGLE_TURN_MESSAGE_LIMIT + truncatedIndicator.length
					? responseMessage.substring(0, SINGLE_TURN_MESSAGE_LIMIT / 2) + truncatedIndicator + responseMessage.substring(responseMessage.length - SINGLE_TURN_MESSAGE_LIMIT / 2)
					: responseMessage;
				lines.push(`Assistant: ${truncatedMessage}`);
			}
		}

		if (lines.length === 0) {
			return undefined;
		}

		// Make sure the total length is within limits
		let characterCount = 0;
		const linesToKeep = [];
		for (let i = lines.length - 1; i >= 0; i--) {
			linesToKeep.unshift(lines[i]);
			characterCount += lines[i].length;
			if (characterCount >= MAX_TOTAL_MESSAGE_LENGTH) {
				break;
			}
		}

		if (linesToKeep.length < lines.length) {
			linesToKeep.unshift('... (truncated) ...');
		}

		return linesToKeep.join('\n\n');
	}

	private createTraitFromSummary(summary: string): Copilot.Trait[] {
		return [{
			name: 'User\'s current task context',
			value: summary,
			importance: 100
		}];
	}
}
