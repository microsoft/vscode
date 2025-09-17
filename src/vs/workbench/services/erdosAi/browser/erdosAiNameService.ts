/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConversationManager } from '../../../services/erdosAiConversation/common/conversationManager.js';
import { IBackendClient } from '../../../services/erdosAiBackend/common/backendClient.js';
import { ConversationMessage } from '../common/conversationTypes.js';
import { IErdosAiNameService } from '../common/erdosAiNameService.js';
import { IErdosAiSettingsService } from '../../erdosAiSettings/common/settingsService.js';
import { Emitter, Event } from '../../../../base/common/event.js';

export class ErdosAiNameService extends Disposable implements IErdosAiNameService {
	readonly _serviceBrand: undefined;

	private readonly _onConversationNameUpdated = this._register(new Emitter<{ conversationId: number; newName: string }>());
	readonly onConversationNameUpdated: Event<{ conversationId: number; newName: string }> = this._onConversationNameUpdated.event;

	constructor(
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IBackendClient private readonly backendClient: IBackendClient,
		@IErdosAiSettingsService private readonly settingsService: IErdosAiSettingsService
	) {
		super();
	}

	async generateConversationName(conversationId: number): Promise<string | null> {
		try {
			const conversation = await this.conversationManager.loadConversation(conversationId);
			if (!conversation) {
				return null;
			}

			const existingName = conversation.info.name;
			
			if (existingName && 
				existingName !== 'New conversation' && 
				!/^New conversation \d+$/.test(existingName)) {
				return existingName;
			}

			if (conversation.messages.length < 2) {
				return null;
			}

			const userAssistantMessages = conversation.messages.filter((msg: ConversationMessage) => 
				(msg.role === 'user' || msg.role === 'assistant') &&
				msg.content &&
				(msg.function_call === null || msg.function_call === undefined) &&
				(!msg.type || msg.type !== 'function_call_output') &&
				(typeof msg.content === 'string' || Array.isArray(msg.content))
			).slice(0, 3);

			if (userAssistantMessages.length === 0) {
				return null;
			}

			const raoFormatMessages = userAssistantMessages.map((msg: ConversationMessage) => {
				const raoMsg: any = {
					id: msg.id,
					role: msg.role,
					content: msg.content
				};
				
				if (msg.related_to !== undefined) {
					raoMsg.related_to = msg.related_to;
				}
				if (msg.original_query !== undefined) {
					raoMsg.original_query = msg.original_query;
				}
				if (msg.procedural !== undefined) {
					raoMsg.procedural = msg.procedural;
				}
				
				return raoMsg;
			});

			// Get the user's selected model and provider (same as regular conversations)
			const selectedModel = await this.settingsService.getSelectedModel();
			const selectedProvider = this.settingsService.getProviderForModel(selectedModel);
			const generatedName = await this.backendClient.generateConversationName(raoFormatMessages, selectedProvider, selectedModel);
			
			if (!generatedName) {
				return null;
			}

			const cleanedName = generatedName.replace(/["'`]/g, '').trim();
			
			if (cleanedName.length > 0 && cleanedName !== 'New conversation') {
				await this.conversationManager.renameConversation(conversationId, cleanedName);
				
				// Fire event to notify that conversation name was updated
				this._onConversationNameUpdated.fire({ conversationId, newName: cleanedName });
				
				return cleanedName;
			}
			
			return null;
		} catch (error) {
			return null; 
		}
	}

	async shouldPromptForName(conversationId: number): Promise<boolean> {
		return await this.conversationManager.shouldPromptForName(conversationId);
	}

	triggerConversationNameCheck(): void {
		setTimeout(async () => {
			try {
				const currentConversation = this.conversationManager.getCurrentConversation();
				if (!currentConversation) {
					return;
				}

				const conversationId = currentConversation.info.id;
				
				const shouldPrompt = await this.shouldPromptForName(conversationId);
				
				if (shouldPrompt) {
					await this.generateConversationName(conversationId);
				}
			} catch (error) {
				// Handle error silently
			}
		}, 500); 
	}

}
