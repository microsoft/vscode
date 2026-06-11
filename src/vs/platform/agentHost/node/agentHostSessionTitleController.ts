/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType } from '../common/state/sessionActions.js';
import { type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ICopilotApiService, type ICopilotUtilityChatMessage } from './shared/copilotApiService.js';

const MAX_TITLE_LENGTH = 200;

export interface IAgentHostSessionTitleControllerOptions {
	readonly sessionDataService: ISessionDataService;
	readonly getGitHubCopilotToken?: () => string | undefined;
	readonly copilotApiService?: ICopilotApiService;
}

export class AgentHostSessionTitleController extends Disposable {

	private readonly _titleGenerationCancellationSources = new Map<ProtocolURI, CancellationTokenSource>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _options: IAgentHostSessionTitleControllerOptions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	seedTitleFromFirstMessage(channel: ProtocolURI, userPrompt: string): void {
		const state = this._stateManager.getSessionState(channel);
		const fallbackTitle = userPrompt.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH);
		if (!state || state.turns.length !== 0 || state.summary.title || fallbackTitle.length === 0) {
			return;
		}

		this._stateManager.dispatchServerAction(channel, {
			type: ActionType.SessionTitleChanged,
			title: fallbackTitle,
		});
		this._generateTitleSoon(channel, userPrompt, fallbackTitle);
	}

	cancelTitleGeneration(session: ProtocolURI): void {
		this._cancelTitleGeneration(session);
	}

	private _generateTitleSoon(channel: ProtocolURI, userPrompt: string, fallbackTitle: string): void {
		this._cancelTitleGeneration(channel);
		const source = new CancellationTokenSource();
		this._titleGenerationCancellationSources.set(channel, source);
		void this._generateTitle(channel, userPrompt, fallbackTitle, source.token).catch(err => {
			if (!source.token.isCancellationRequested) {
				this._logService.warn(`[AgentHostSessionTitleController] Failed to apply generated title for ${channel}`, err);
			}
		}).finally(() => {
			if (this._titleGenerationCancellationSources.get(channel) === source) {
				this._titleGenerationCancellationSources.delete(channel);
				source.dispose();
			}
		});
	}

	private async _generateTitle(channel: ProtocolURI, userPrompt: string, fallbackTitle: string, token: CancellationToken): Promise<void> {
		const generatedTitle = await this._generateTitleFromPrompt(userPrompt, token);
		if (token.isCancellationRequested || !generatedTitle) {
			return;
		}

		const state = this._stateManager.getSessionState(channel);
		if (!state || state.summary.title !== fallbackTitle) {
			return;
		}

		if (generatedTitle !== fallbackTitle) {
			this._stateManager.dispatchServerAction(channel, {
				type: ActionType.SessionTitleChanged,
				title: generatedTitle,
			});
		}
		this._persistCustomTitle(channel, generatedTitle);
	}

	private async _generateTitleFromPrompt(userPrompt: string, token: CancellationToken): Promise<string | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const githubToken = this._options.getGitHubCopilotToken?.();
		const copilotApiService = this._options.copilotApiService;
		if (!githubToken || !copilotApiService) {
			return undefined;
		}

		const abortController = new AbortController();
		const cancellationListener = token.onCancellationRequested(() => abortController.abort());
		try {
			const rawTitle = await copilotApiService.utilityChatCompletion(githubToken, {
				messages: this._buildTitlePrompt(userPrompt),
			}, {
				signal: abortController.signal,
			});
			return this._cleanTitle(rawTitle);
		} catch (err) {
			if (token.isCancellationRequested) {
				return undefined;
			}
			this._logService.warn('[AgentHostSessionTitleController] Failed to generate session title', err);
			return undefined;
		} finally {
			cancellationListener.dispose();
		}
	}

	private _buildTitlePrompt(userPrompt: string): ICopilotUtilityChatMessage[] {
		return [
			{
				role: 'system',
				content: [
					'You are an expert in crafting ultra-compact titles for chatbot conversations.',
					'You are presented with a chat request, and you reply with only a brief title that captures the main topic of that request.',
					'Write the title in sentence case, not title case.',
					'Preserve product names, abbreviations, code symbols, and proper nouns.',
					'Aim for 3-6 words. Prefer the shortest accurate title.',
					'Drop articles like "a", "an", and "the" unless needed for clarity.',
					'Drop filler and generic framing like "help with", "question about", "request for", or "issue with".',
					'Prefer short, concrete synonyms and omit unnecessary words.',
					'Do not wrap the title in quotes or add trailing punctuation.',
				].join(' '),
			},
			{
				role: 'user',
				content: `Please write a brief title for the following request:\n\n${userPrompt}`,
			},
		];
	}

	private _cleanTitle(rawTitle: string): string | undefined {
		let title = rawTitle.trim();
		const firstLine = title.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0);
		title = firstLine ?? '';
		if (title.startsWith('"') && title.endsWith('"') && title.length > 1) {
			title = title.slice(1, -1).trim();
		}
		title = title.replace(/[.!?]+$/, '').trim();

		if (!title || title.includes('can\'t assist with that')) {
			return undefined;
		}
		return title.slice(0, MAX_TITLE_LENGTH);
	}

	private _persistCustomTitle(session: ProtocolURI, title: string): void {
		const ref = this._options.sessionDataService.openDatabase(URI.parse(session));
		ref.object.setMetadata('customTitle', title).catch(err => {
			this._logService.warn('[AgentHostSessionTitleController] Failed to persist customTitle', err);
		}).finally(() => {
			ref.dispose();
		});
	}

	private _cancelTitleGeneration(session: ProtocolURI): void {
		const source = this._titleGenerationCancellationSources.get(session);
		if (!source) {
			return;
		}
		source.dispose(true);
		this._titleGenerationCancellationSources.delete(session);
	}

	override dispose(): void {
		for (const source of this._titleGenerationCancellationSources.values()) {
			source.dispose(true);
		}
		this._titleGenerationCancellationSources.clear();
		super.dispose();
	}
}
