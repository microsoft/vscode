/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IChatProgress, IChatService } from './chatService.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from './chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from './constants.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IExtensionService, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';

export interface IChatSessionsExtensionPoint {
	id: string;
	name: string;
	displayName: string;
	description: string;
	when?: string;
}
export interface IChatSessionItem {
	id: string;
	label: string;
	iconPath?: URI | {
		light: URI;
		dark: URI;
	} | ThemeIcon;
}

export interface ChatSession {
	id: string;

	history: Array<
		| { type: 'request'; prompt: string }
		| { type: 'response'; parts: IChatProgress[] }>;
}

export interface IChatSessionItemProvider {
	readonly chatSessionType: string;
	provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]>;
}

export interface IChatSessionContentProvider {
	readonly chatSessionType: string;
	provideChatSessionContent(id: string, token: CancellationToken): Promise<ChatSession>;
}

export interface IChatSessionsService {
	readonly _serviceBrand: undefined;
	registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable;
	registerChatSessionContentProvider(provider: IChatSessionContentProvider): IDisposable;
	hasChatSessionItemProviders: boolean;
	provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]>;
	provideChatSessionContent(chatSessionType: string, id: string, token: CancellationToken): Promise<ChatSession>;
	registerContribution(contribution: IChatSessionsExtensionPoint): IDisposable;
	getChatSessionProviders(): IChatSessionsExtensionPoint[];
}

export const IChatSessionsService = createDecorator<IChatSessionsService>('chatSessionsService');

export class ChatSessionsService extends Disposable implements IChatSessionsService {
	readonly _serviceBrand: undefined;
	private _itemsProviders: Map<string, IChatSessionItemProvider> = new Map();
	private _contentProviders: Map<string, IChatSessionContentProvider> = new Map();
	private _contributions: Map<string, IChatSessionsExtensionPoint> = new Map();


	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
		super();
	}
	public registerContribution(contribution: IChatSessionsExtensionPoint): IDisposable {
		if (this._contributions.has(contribution.id)) {
			this._logService.warn(`Chat session contribution with id '${contribution.id}' is already registered.`);
			return { dispose: () => { } };
		}
		this._contributions.set(contribution.id, contribution);
		const dynamicAgentDisposable = this.registerDynamicAgent(contribution);
		return {
			dispose: () => {
				this._contributions.delete(contribution.id);
				dynamicAgentDisposable.dispose();
			}
		};
	}

	private registerDynamicAgent(contribution: IChatSessionsExtensionPoint): IDisposable {
		const { id, name, displayName, description } = contribution;
		const agentData: IChatAgentData = {
			id,
			name,
			fullName: displayName,
			description: description,
			isDefault: false,
			isCore: false,
			isDynamic: true,
			isCodingAgent: true, // TODO: Influences chat UI (eg: locks chat to participant, hides UX elements, etc...)
			slashCommands: [],
			locations: [ChatAgentLocation.Panel],
			modes: [ChatModeKind.Agent, ChatModeKind.Ask],
			disambiguation: [],
			metadata: {
				themeIcon: Codicon.sendToRemoteAgent,
				isSticky: true,
			},
			extensionId: nullExtensionDescription.identifier,
			extensionDisplayName: nullExtensionDescription.name,
			extensionPublisherId: nullExtensionDescription.publisher,
		};

		const agentImpl = this._instantiationService.createInstance(CodingAgentChatImplementation, contribution);
		const disposable = this._chatAgentService.registerDynamicAgent(agentData, agentImpl);
		return disposable;
	}

	getChatSessionProviders(): IChatSessionsExtensionPoint[] {
		return Array.from(this._contributions.values());
	}

	async canResolve(chatViewType: string) {
		if (this._itemsProviders.has(chatViewType)) {
			return true;
		}

		await this._extensionService.whenInstalledExtensionsRegistered();
		await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);

		return this._itemsProviders.has(chatViewType);
	}

	public async provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]> {
		if (!(await this.canResolve(chatSessionType))) {
			throw Error(`Can not find provider for ${chatSessionType}`);
		}

		const provider = this._itemsProviders.get(chatSessionType);

		if (provider?.provideChatSessionItems) {
			const sessions = await provider.provideChatSessionItems(token);
			return sessions;
		}

		return [];
	}

	public registerChatSessionItemProvider(provider: IChatSessionItemProvider): IDisposable {
		this._itemsProviders.set(provider.chatSessionType, provider);
		return {
			dispose: () => {
				this._itemsProviders.delete(provider.chatSessionType);
			}
		};
	}

	registerChatSessionContentProvider(provider: IChatSessionContentProvider): IDisposable {
		this._contentProviders.set(provider.chatSessionType, provider);
		return {
			dispose: () => {
				this._contentProviders.delete(provider.chatSessionType);
			}
		};
	}

	public async provideChatSessionContent(chatSessionType: string, id: string, token: CancellationToken): Promise<ChatSession> {
		for (const provider of this._contentProviders.values()) {
			if (provider.chatSessionType === chatSessionType) {
				return provider.provideChatSessionContent(id, token);
			}
		}

		throw new Error(`No chat session content provider found for type: ${chatSessionType}`);
	}

	public get hasChatSessionItemProviders(): boolean {
		return this._itemsProviders.size > 0;
	}
}

registerSingleton(IChatSessionsService, ChatSessionsService, InstantiationType.Delayed);


/**
 * Implementation for individual remote coding agent chat functionality
 */
class CodingAgentChatImplementation extends Disposable implements IChatAgentImplementation {

	constructor(
		private readonly chatSession: IChatSessionsExtensionPoint,
		@IChatService private readonly chatService: IChatService
	) {
		super();
	}

	async invoke(request: IChatAgentRequest, progress: (progress: IChatProgress[]) => void, history: any[], token: CancellationToken): Promise<IChatAgentResult> {
		const message = request.message.trim();
		try {
			if (history.length === 0) {
				return this.handleNew(request, message, progress, token);
			} else {
				return this.handleExisting(request, message, progress, token);
			}
		} catch (error) {
			progress([{
				kind: 'markdownContent',
				content: new MarkdownString(localize('remoteCodingAgent.error', 'Error: {0}', error instanceof Error ? error.message : String(error)))
			}]);
			return { errorDetails: { message: String(error) } };
		}
	}

	private async handleExisting(request: IChatAgentRequest, message: string, progress: (progress: IChatProgress[]) => void, token: CancellationToken): Promise<IChatAgentResult> {
		const { displayName } = this.chatSession;
		progress([{
			kind: 'progressMessage',
			content: new MarkdownString(localize('chatAgent.working', '{0} queued your request', displayName))
		}]);
		await new Promise(resolve => setTimeout(resolve, 1000));
		return {};
	}

	private async handleNew(request: IChatAgentRequest, message: string, progress: (progress: IChatProgress[]) => void, token: CancellationToken): Promise<IChatAgentResult> {

		// Get the chat model for this session so we can add requests over time
		const chatModel = this.chatService.getSession(request.sessionId);
		if (!chatModel) {
			throw new Error(`Chat session ${request.sessionId} not found`);
		}
		return {};
	}
}
