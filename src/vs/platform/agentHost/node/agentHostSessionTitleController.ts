/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ActionType } from '../common/state/sessionActions.js';
import { isAhpChatChannel, isDefaultChatUri, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { AGENT_HOST_TITLE_SOURCE_AGENT, AGENT_HOST_TITLE_SOURCE_AUTO, AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, persistSessionMetadata, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from './shared/persistSessionMetadata.js';

const MAX_TITLE_LENGTH = 40;
const SESSION_RENAME_REMINDER = 'Reminder: This session currently has an auto-generated or placeholder name. Please call the `rename_session` tool to give it a short, descriptive title based on the user\'s intent.';
const CHAT_RENAME_REMINDER = 'Reminder: This chat currently has an auto-generated or placeholder name. Please call the `rename_chat` tool to give it a short, descriptive title based on the user\'s intent.';

export interface IAgentHostSessionTitleControllerOptions {
	readonly sessionDataService: ISessionDataService;
}

export class AgentHostSessionTitleController extends Disposable {

	private readonly _lastAppliedTitle = new Map<ProtocolURI, string>();
	private readonly _provisionalTitles = new Set<ProtocolURI>();
	private readonly _autoTitles = new Set<ProtocolURI>();
	private readonly _renamedTitles = new Set<ProtocolURI>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _options: IAgentHostSessionTitleControllerOptions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	seedTitleFromFirstMessage(channel: ProtocolURI, userPrompt: string, chatChannel?: ProtocolURI): void {
		const fallbackTitle = this._normalizeTitle(userPrompt);
		if (!fallbackTitle) {
			return;
		}

		const additionalChat = this._additionalChatChannel(chatChannel);
		const key = additionalChat ?? channel;
		const state = additionalChat ? this._stateManager.getChatState(additionalChat) : this._stateManager.getSessionState(channel);
		if (!state || !this._canSeedFirstMessageTitle(key, state.turns.length, state.title)) {
			return;
		}

		this._provisionalTitles.delete(key);
		this._applySeedTitle(channel, additionalChat, fallbackTitle);
		this.markTitleAuto(channel, additionalChat, fallbackTitle);
	}

	/** Seeds and persists a provisional title suggested by a locally handled command. */
	seedProvisionalTitle(channel: ProtocolURI, suggestedTitle: string, chatChannel?: ProtocolURI): void {
		const title = this._normalizeTitle(suggestedTitle);
		if (!title) {
			return;
		}

		const additionalChat = this._additionalChatChannel(chatChannel);
		const key = additionalChat ?? channel;
		const state = additionalChat ? this._stateManager.getChatState(additionalChat) : this._stateManager.getSessionState(channel);
		if (!state || !this._canSeedProvisionalTitle(key, state.title)) {
			return;
		}

		this._provisionalTitles.add(key);
		this._applySeedTitle(channel, additionalChat, title);
		this.markTitleAuto(channel, additionalChat, title);
	}

	/** Marks a deterministic session or peer-chat fallback title as auto-generated. */
	markTitleAuto(channel: ProtocolURI, chatChannel: ProtocolURI | undefined, title: string): void {
		const additionalChat = this._additionalChatChannel(chatChannel);
		const key = additionalChat ?? channel;
		this._autoTitles.add(key);
		this._renamedTitles.delete(key);
		this._persistAutoTitle(channel, additionalChat, title);
	}

	/** Stops process-local auto-title tracking after a user or agent rename. */
	markTitleRenamed(channel: ProtocolURI, chatChannel?: ProtocolURI): void {
		const key = this._additionalChatChannel(chatChannel) ?? channel;
		this._autoTitles.delete(key);
		this._provisionalTitles.delete(key);
		this._renamedTitles.add(key);
	}

	/** Adds a model-only rename reminder when the addressed title is still auto-generated. */
	async preparePromptForAgent(channel: ProtocolURI, chatChannel: ProtocolURI, prompt: string): Promise<string> {
		const additionalChat = this._additionalChatChannel(chatChannel);
		const key = additionalChat ?? channel;
		if (this._renamedTitles.has(key)) {
			return prompt;
		}
		const sourceKey = additionalChat ? customChatTitleSourceMetadataKey(additionalChat) : SESSION_CUSTOM_TITLE_SOURCE_KEY;
		const source = await this._readPersistedTitleSource(channel, sourceKey);
		if (source === AGENT_HOST_TITLE_SOURCE_USER || source === AGENT_HOST_TITLE_SOURCE_AGENT) {
			this.markTitleRenamed(channel, additionalChat);
			return prompt;
		}
		if (source !== AGENT_HOST_TITLE_SOURCE_AUTO && !this._autoTitles.has(key)) {
			return prompt;
		}

		const reminder = additionalChat ? CHAT_RENAME_REMINDER : SESSION_RENAME_REMINDER;
		return `${prompt}\n\n<system_notification>\n${reminder}\n</system_notification>`;
	}

	private _normalizeTitle(text: string): string {
		return Array.from(text.trim().replace(/\s+/g, ' ')).slice(0, MAX_TITLE_LENGTH).join('').trim();
	}

	private _additionalChatChannel(chatChannel?: ProtocolURI): ProtocolURI | undefined {
		return !!chatChannel && isAhpChatChannel(chatChannel) && !isDefaultChatUri(chatChannel) ? chatChannel : undefined;
	}

	private _applySeedTitle(channel: ProtocolURI, additionalChat: ProtocolURI | undefined, title: string): void {
		const key = additionalChat ?? channel;
		this._lastAppliedTitle.set(key, title);
		if (additionalChat) {
			this._stateManager.updateChatTitle(channel, additionalChat, title);
		} else {
			this._stateManager.dispatchServerAction(channel, {
				type: ActionType.SessionTitleChanged,
				title,
			});
		}
	}

	private _persistAutoTitle(channel: ProtocolURI, additionalChat: ProtocolURI | undefined, title: string): void {
		if (additionalChat) {
			this._persistSessionFlag(channel, customChatTitleMetadataKey(additionalChat), title);
			this._persistSessionFlag(channel, customChatTitleSourceMetadataKey(additionalChat), AGENT_HOST_TITLE_SOURCE_AUTO);
			return;
		}
		this._persistSessionFlag(channel, SESSION_CUSTOM_TITLE_KEY, title);
		this._persistSessionFlag(channel, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AUTO);
	}

	private _canSeedFirstMessageTitle(key: ProtocolURI, turnsLength: number, currentTitle: string | undefined): boolean {
		if (turnsLength === 0 && !currentTitle) {
			return true;
		}
		return this._provisionalTitles.has(key) && !!currentTitle && currentTitle === this._lastAppliedTitle.get(key);
	}

	private _canSeedProvisionalTitle(key: ProtocolURI, currentTitle: string | undefined): boolean {
		if (!currentTitle) {
			return true;
		}
		return this._provisionalTitles.has(key) && currentTitle === this._lastAppliedTitle.get(key);
	}

	private async _readPersistedTitleSource(session: ProtocolURI, key: string): Promise<string | undefined> {
		try {
			const ref = await this._options.sessionDataService.tryOpenDatabase?.(URI.parse(session));
			if (!ref) {
				return undefined;
			}
			try {
				return await ref.object.getMetadata(key);
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[AgentHostSessionTitleController] Failed to read title source '${key}'`, err);
			return undefined;
		}
	}

	private _persistSessionFlag(session: ProtocolURI, key: string, value: string): void {
		persistSessionMetadata(this._options.sessionDataService, this._logService, session, key, value);
	}

	override dispose(): void {
		this._lastAppliedTitle.clear();
		this._provisionalTitles.clear();
		this._autoTitles.clear();
		this._renamedTitles.clear();
		super.dispose();
	}
}
