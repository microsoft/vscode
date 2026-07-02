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
import { isAhpChatChannel, isDefaultChatUri, type Turn, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { buildConversationContext, renderResponseMarkdown, truncateMiddle } from '../common/agentHostConversationContext.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ICopilotApiService, type ICopilotUtilityChatMessage } from './shared/copilotApiService.js';

const MAX_TITLE_LENGTH = 200;

/**
 * Soft upper bound, in characters, for the first-turn context fed to the
 * utility model when refining a session title. Sized to stay well within the
 * small model's context window while leaving room for the prompt scaffolding.
 */
const MAX_TITLE_CONTEXT_CHARS = 20000;

export interface IAgentHostSessionTitleControllerOptions {
	readonly sessionDataService: ISessionDataService;
	readonly getGitHubCopilotToken?: () => string | undefined;
	readonly copilotApiService?: ICopilotApiService;
}

export class AgentHostSessionTitleController extends Disposable {

	private readonly _titleGenerationCancellationSources = new Map<ProtocolURI, CancellationTokenSource>();

	/**
	 * The most recent title this controller applied for a given session/chat
	 * key. Used to detect whether the title was changed (e.g. a manual
	 * `/rename` or user edit) since we last set it, so we never clobber a
	 * deliberate title with an auto-generated one.
	 */
	private readonly _lastAppliedTitle = new Map<ProtocolURI, string>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _options: IAgentHostSessionTitleControllerOptions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	seedTitleFromFirstMessage(channel: ProtocolURI, userPrompt: string, chatChannel?: ProtocolURI): void {
		const fallbackTitle = userPrompt.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH);
		if (fallbackTitle.length === 0) {
			return;
		}

		const isAdditionalChat = !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel);
		if (isAdditionalChat) {
			// Auto-title the additional chat from its own first message,
			// independently of the session title.
			const chatState = this._stateManager.getChatState(chatChannel);
			if (!chatState || chatState.turns.length !== 0 || chatState.title) {
				return;
			}
			const apply = (title: string) => this._applyTitle(chatChannel, title, t => this._stateManager.updateChatTitle(channel, chatChannel, t));
			apply(fallbackTitle);
			this._generateTitleSoon(
				chatChannel,
				userPrompt,
				false,
				fallbackTitle,
				apply,
				() => this._stateManager.getChatState(chatChannel)?.title === this._lastAppliedTitle.get(chatChannel),
				title => this._persistSessionFlag(channel, `customChatTitle:${chatChannel}`, title),
			);
			return;
		}

		const state = this._stateManager.getSessionState(channel);
		if (!state || state.turns.length !== 0 || state.title) {
			return;
		}

		const apply = (title: string) => this._applyTitle(channel, title, t => this._stateManager.dispatchServerAction(channel, {
			type: ActionType.SessionTitleChanged,
			title: t,
		}));
		apply(fallbackTitle);
		this._generateTitleSoon(
			channel,
			userPrompt,
			false,
			fallbackTitle,
			apply,
			() => this._stateManager.getSessionState(channel)?.title === this._lastAppliedTitle.get(channel),
			title => this._persistSessionFlag(channel, 'customTitle', title),
		);
	}

	/**
	 * Re-generates the title once the first turn has completed, this time
	 * using the full first-turn context (the user request plus the agent's
	 * textual response) rather than just the opening message. This only runs
	 * for the very first turn and only when the current title is still the one
	 * this controller last applied — a manual `/rename`, a user edit, or a
	 * forked session's inherited title all suppress it.
	 *
	 * Only normal text response parts are considered (tool calls, reasoning,
	 * and other parts are ignored). If the context still exceeds the budget
	 * the middle is removed (marked with `...`). The user's first request is
	 * always preserved.
	 */
	refineTitleFromFirstTurn(channel: ProtocolURI, chatChannel?: ProtocolURI): void {
		const isAdditionalChat = !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel);
		if (isAdditionalChat) {
			const chatState = this._stateManager.getChatState(chatChannel);
			if (!chatState || chatState.turns.length !== 1) {
				return;
			}
			const lastApplied = this._lastAppliedTitle.get(chatChannel);
			if (lastApplied === undefined || chatState.title !== lastApplied) {
				return;
			}
			const context = this._buildFirstTurnContext(chatState.turns[0]);
			if (!context) {
				return;
			}
			const apply = (title: string) => this._applyTitle(chatChannel, title, t => this._stateManager.updateChatTitle(channel, chatChannel, t));
			this._generateTitleSoon(
				chatChannel,
				context,
				true,
				lastApplied,
				apply,
				() => this._stateManager.getChatState(chatChannel)?.title === this._lastAppliedTitle.get(chatChannel),
				title => this._persistSessionFlag(channel, `customChatTitle:${chatChannel}`, title),
			);
			return;
		}

		const state = this._stateManager.getSessionState(channel);
		if (!state || state.turns.length !== 1) {
			return;
		}
		const lastApplied = this._lastAppliedTitle.get(channel);
		if (lastApplied === undefined || state.title !== lastApplied) {
			return;
		}
		const context = this._buildFirstTurnContext(state.turns[0]);
		if (!context) {
			return;
		}
		const apply = (title: string) => this._applyTitle(channel, title, t => this._stateManager.dispatchServerAction(channel, {
			type: ActionType.SessionTitleChanged,
			title: t,
		}));
		this._generateTitleSoon(
			channel,
			context,
			true,
			lastApplied,
			apply,
			() => this._stateManager.getSessionState(channel)?.title === this._lastAppliedTitle.get(channel),
			title => this._persistSessionFlag(channel, 'customTitle', title),
		);
	}

	/**
	 * Generates a title for a freshly forked session or chat from its
	 * inherited conversation context. Forks copy the source history up to the
	 * fork point, so neither {@link seedTitleFromFirstMessage} nor
	 * {@link refineTitleFromFirstTurn} (which require an empty / single-turn
	 * state) ever fire for them. This is the fork equivalent, run once at fork
	 * time over the kept turns, so the new chat gets a content-derived title
	 * instead of permanently inheriting the source's `Forked: …` title.
	 *
	 * `fallbackTitle` is the title the caller already applied to the new
	 * session/chat (e.g. `Forked: <source>`); it is recorded as the
	 * last-applied title so a concurrent manual rename suppresses the
	 * generated title, and stays visible until generation completes. The
	 * context is bounded to {@link MAX_TITLE_CONTEXT_CHARS} (middle-truncated),
	 * so generation costs at most a single small-model call.
	 */
	generateForkedTitle(channel: ProtocolURI, chatChannel: ProtocolURI | undefined, turns: readonly Turn[], fallbackTitle: string, sourceTitle?: string): void {
		const context = this._buildConversationContext(turns, sourceTitle);
		if (!context) {
			return;
		}

		const isAdditionalChat = !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel);
		if (isAdditionalChat) {
			const key = chatChannel;
			this._lastAppliedTitle.set(key, fallbackTitle);
			const apply = (title: string) => this._applyTitle(key, title, t => this._stateManager.updateChatTitle(channel, key, t));
			this._generateTitleSoon(
				key,
				context,
				true,
				fallbackTitle,
				apply,
				() => this._stateManager.getChatState(key)?.title === this._lastAppliedTitle.get(key),
				title => this._persistSessionFlag(channel, `customChatTitle:${key}`, title),
			);
			return;
		}

		this._lastAppliedTitle.set(channel, fallbackTitle);
		const apply = (title: string) => this._applyTitle(channel, title, t => this._stateManager.dispatchServerAction(channel, {
			type: ActionType.SessionTitleChanged,
			title: t,
		}));
		this._generateTitleSoon(
			channel,
			context,
			true,
			fallbackTitle,
			apply,
			() => this._stateManager.getSessionState(channel)?.title === this._lastAppliedTitle.get(channel),
			title => this._persistSessionFlag(channel, 'customTitle', title),
		);
	}

	private _applyTitle(key: ProtocolURI, title: string, dispatch: (title: string) => void): void {
		this._lastAppliedTitle.set(key, title);
		dispatch(title);
	}

	cancelTitleGeneration(session: ProtocolURI): void {
		this._cancelTitleGeneration(session);
	}

	private _generateTitleSoon(
		key: ProtocolURI,
		promptContent: string,
		isConversation: boolean,
		fallbackTitle: string,
		apply: (title: string) => void,
		currentTitleMatchesFallback: () => boolean,
		persist: (title: string) => void,
	): void {
		this._cancelTitleGeneration(key);
		const source = new CancellationTokenSource();
		this._titleGenerationCancellationSources.set(key, source);
		void this._generateTitle(key, promptContent, isConversation, fallbackTitle, apply, currentTitleMatchesFallback, persist, source.token).catch(err => {
			if (!source.token.isCancellationRequested) {
				this._logService.warn(`[AgentHostSessionTitleController] Failed to apply generated title for ${key}`, err);
			}
		}).finally(() => {
			if (this._titleGenerationCancellationSources.get(key) === source) {
				this._titleGenerationCancellationSources.delete(key);
				source.dispose();
			}
		});
	}

	private async _generateTitle(
		key: ProtocolURI,
		promptContent: string,
		isConversation: boolean,
		fallbackTitle: string,
		apply: (title: string) => void,
		currentTitleMatchesFallback: () => boolean,
		persist: (title: string) => void,
		token: CancellationToken,
	): Promise<void> {
		const generatedTitle = await this._generateTitleFromPrompt(promptContent, isConversation, token);
		if (token.isCancellationRequested || !generatedTitle) {
			return;
		}

		if (!currentTitleMatchesFallback()) {
			return;
		}

		if (generatedTitle !== fallbackTitle) {
			apply(generatedTitle);
		}
		persist(generatedTitle);
	}

	private async _generateTitleFromPrompt(promptContent: string, isConversation: boolean, token: CancellationToken): Promise<string | undefined> {
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
				messages: this._buildTitlePrompt(promptContent, isConversation),
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

	private _buildTitlePrompt(promptContent: string, isConversation: boolean): ICopilotUtilityChatMessage[] {
		const userInstruction = isConversation
			? `Please write a brief title for the following conversation:\n\n${promptContent}`
			: `Please write a brief title for the following request:\n\n${promptContent}`;
		return [
			{
				role: 'system',
				content: [
					'You are an expert in crafting ultra-compact titles for chatbot conversations.',
					'You are presented with a chat request or conversation, and you reply with only a brief title that captures the main topic.',
					'Write the title in sentence case, not title case.',
					'Preserve product names, abbreviations, code symbols, and proper nouns.',
					'Aim for 3-6 words. Prefer the shortest accurate title.',
					'Drop articles like "a", "an", and "the" unless needed for clarity.',
					'Drop filler and generic framing like "help with", "question about", "request for", or "issue with".',
					'Never describe the chat itself as forked, branched, or continued — title only the underlying topic.',
					'Prefer short, concrete synonyms and omit unnecessary words.',
					'Do not wrap the title in quotes or add trailing punctuation.',
				].join(' '),
			},
			{
				role: 'user',
				content: userInstruction,
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

	/**
	 * Builds the first-turn context string for title refinement. The user's
	 * request is always kept (truncated in the middle only if it alone exceeds
	 * half the budget). Only normal text (markdown) response parts are
	 * considered — tool calls, reasoning, and other parts are ignored. If the
	 * combined text is over budget, the middle of the response is removed.
	 *
	 * @returns the context string, or `undefined` when the turn has no text
	 * response worth refining from (the opening message already produced a
	 * title in that case).
	 */
	private _buildFirstTurnContext(turn: Turn): string | undefined {
		const response = renderResponseMarkdown(turn.responseParts);
		if (!response) {
			return undefined;
		}

		const userBudget = Math.floor(MAX_TITLE_CONTEXT_CHARS / 2);
		let userRequest = turn.message.text.trim();
		if (userRequest.length > userBudget) {
			userRequest = truncateMiddle(userRequest, userBudget);
		}
		const userBlock = `User request:\n${userRequest}`;
		const responseLabel = '\n\nAgent response:\n';

		const responseBudget = Math.max(0, MAX_TITLE_CONTEXT_CHARS - userBlock.length - responseLabel.length);
		const trimmedResponse = response.length > responseBudget ? truncateMiddle(response, responseBudget) : response;

		return trimmedResponse ? `${userBlock}${responseLabel}${trimmedResponse}` : userBlock;
	}

	/**
	 * Builds a conversation context string for forked-title generation by
	 * concatenating each kept turn's user request and textual response. Only
	 * normal text (markdown) response parts are considered — tool calls,
	 * reasoning, and other parts are ignored, mirroring
	 * {@link _buildFirstTurnContext}. When the fork's `sourceTitle` is known, a
	 * short framing note is prepended so the model understands the conversation
	 * is a branch continued from an earlier chat. The conversation is
	 * middle-truncated to {@link MAX_TITLE_CONTEXT_CHARS} to bound model cost;
	 * the framing note is always preserved in full.
	 *
	 * @returns the context string, or `undefined` when no turn carries any
	 * text worth titling from.
	 */
	private _buildConversationContext(turns: readonly Turn[], sourceTitle?: string): string | undefined {
		const framedTitle = sourceTitle?.trim();
		const framing = framedTitle
			? `This conversation was branched from an earlier chat titled "${framedTitle}". The turns below, oldest first, are the inherited history up to the branch point.\n\n`
			: undefined;
		return buildConversationContext(turns, { maxChars: MAX_TITLE_CONTEXT_CHARS, framing });
	}

	private _persistSessionFlag(session: ProtocolURI, key: string, value: string): void {
		const ref = this._options.sessionDataService.openDatabase(URI.parse(session));
		ref.object.setMetadata(key, value).catch(err => {
			this._logService.warn(`[AgentHostSessionTitleController] Failed to persist ${key}`, err);
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
		this._lastAppliedTitle.clear();
		super.dispose();
	}
}
