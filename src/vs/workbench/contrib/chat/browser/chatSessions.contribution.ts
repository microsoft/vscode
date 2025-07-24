/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService, isProposedApiEnabled, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatWidgetService } from '../browser/chat.js';
import { ChatEditorInput } from '../browser/chatEditorInput.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../common/chatAgents.js';
import { IChatProgress, IChatService } from '../common/chatService.js';
import { ChatSession, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemProvider, IChatSessionsExtensionPoint, IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatSessionUri } from '../common/chatUri.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';

const extensionPoint = ExtensionsRegistry.registerExtensionPoint<IChatSessionsExtensionPoint[]>({
	extensionPoint: 'chatSessions',
	jsonSchema: {
		description: localize('chatSessionsExtPoint', 'Contributes chat session integrations to the chat widget.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					description: localize('chatSessionsExtPoint.id', 'A unique identifier for this item.'),
					type: 'string',
				},
				name: {
					description: localize('chatSessionsExtPoint.name', 'Name shown in the chat widget. (eg: @agent)'),
					type: 'string',
				},
				displayName: {
					description: localize('chatSessionsExtPoint.displayName', 'A longer name for this item which is used for display in menus.'),
					type: 'string',
				},
				description: {
					description: localize('chatSessionsExtPoint.description', 'Description of the chat session for use in menus and tooltips.'),
					type: 'string'
				},
				when: {
					description: localize('chatSessionsExtPoint.when', 'Condition which must be true to show this item.'),
					type: 'string'
				}
			},
			required: ['id', 'name', 'displayName', 'description'],
		}
	},
	activationEventsGenerator: (contribs, results) => {
		for (const contrib of contribs) {
			results.push(`onChatSession:${contrib.id}`);
		}
	}
});

export class ChatSessionsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILogService private readonly logService: ILogService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		extensionPoint.setHandler(extensions => {
			for (const ext of extensions) {
				if (!isProposedApiEnabled(ext.description, 'chatSessionsProvider')) {
					continue;
				}
				if (!Array.isArray(ext.value)) {
					continue;
				}
				for (const contribution of ext.value) {
					const c: IChatSessionsExtensionPoint = {
						id: contribution.id,
						name: contribution.name,
						displayName: contribution.displayName,
						description: contribution.description,
						when: contribution.when,
					};
					this.logService.info(`Registering chat session from extension contribution: ${c.displayName} (id='${c.id}' name='${c.name}')`);
					this._register(this.chatSessionsService.registerContribution(c)); // TODO: Is it for contribution to own this? I think not
				}
			}
		});
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ChatSessionsContribution, LifecyclePhase.Restored);

class ContributedChatSessionData implements IDisposable {
	constructor(
		readonly session: ChatSession,
		readonly chatSessionType: string,
		readonly id: string,
		onWillDispose: (session: ChatSession, chatSessionType: string, id: string) => void
	) {
	}

	dispose(): void {
	}
}


export class ChatSessionsService extends Disposable implements IChatSessionsService {
	readonly _serviceBrand: undefined;
	private readonly _itemsProviders: Map<string, IChatSessionItemProvider> = new Map();

	private readonly _onDidChangeItemsProviders = this._register(new Emitter<IChatSessionItemProvider>());
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider> = this._onDidChangeItemsProviders.event;
	private readonly _contentProviders: Map<string, IChatSessionContentProvider> = new Map();
	private readonly _contributions: Map<string, IChatSessionsExtensionPoint> = new Map();
	private readonly _onDidChangeSessionItems = this._register(new Emitter<string>());
	readonly onDidChangeSessionItems: Event<string> = this._onDidChangeSessionItems.event;

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
				isSticky: false,
			},
			extensionId: nullExtensionDescription.identifier,
			extensionDisplayName: nullExtensionDescription.name,
			extensionPublisherId: nullExtensionDescription.publisher,
		};

		const agentImpl = this._instantiationService.createInstance(CodingAgentChatImplementation, contribution);
		const disposable = this._chatAgentService.registerDynamicAgent(agentData, agentImpl);
		return disposable;
	}

	getChatSessionContributions(): IChatSessionsExtensionPoint[] {
		return Array.from(this._contributions.values());
	}

	getChatSessionItemProviders(): IChatSessionItemProvider[] {
		return [...this._itemsProviders.values()];
	}

	async canResolveItemProvider(chatViewType: string) {
		if (this._itemsProviders.has(chatViewType)) {
			return true;
		}

		await this._extensionService.whenInstalledExtensionsRegistered();
		await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);

		return this._itemsProviders.has(chatViewType);
	}

	public notifySessionItemsChange(chatSessionType: string): void {
		this._onDidChangeSessionItems.fire(chatSessionType);
	}

	async canResolveContentProvider(chatViewType: string) {
		if (this._contentProviders.has(chatViewType)) {
			return true;
		}

		await this._extensionService.whenInstalledExtensionsRegistered();
		await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);

		return this._contentProviders.has(chatViewType);
	}

	public async provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]> {
		if (!(await this.canResolveItemProvider(chatSessionType))) {
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
		const chatSessionType = provider.chatSessionType;
		this._itemsProviders.set(chatSessionType, provider);
		this._onDidChangeItemsProviders.fire(provider);

		return {
			dispose: () => {
				const provider = this._itemsProviders.get(chatSessionType);
				if (provider) {
					this._itemsProviders.delete(chatSessionType);
					this._onDidChangeItemsProviders.fire(provider);
				}
			}
		};
	}

	registerChatSessionContentProvider(provider: IChatSessionContentProvider): IDisposable {
		this._contentProviders.set(provider.chatSessionType, provider);
		return {
			dispose: () => {
				this._contentProviders.delete(provider.chatSessionType);

				// Remove all sessions that were created by this provider
				for (const [key, session] of this._sessions) {
					if (session.chatSessionType === provider.chatSessionType) {
						session.dispose();
						this._sessions.delete(key);
					}
				}
			}
		};
	}

	private readonly _sessions = new Map<string, ContributedChatSessionData>();

	public async provideChatSessionContent(chatSessionType: string, id: string, token: CancellationToken): Promise<ChatSession> {
		if (!(await this.canResolveContentProvider(chatSessionType))) {
			throw Error(`Can not find provider for ${chatSessionType}`);
		}

		const provider = this._contentProviders.get(chatSessionType);
		if (!provider) {
			throw Error(`Can not find provider for ${chatSessionType}`);
		}

		const sessionKey = `${chatSessionType}_${id}`;
		const existingSessionData = this._sessions.get(sessionKey);
		if (existingSessionData) {
			return existingSessionData.session;
		}

		const session = await provider.provideChatSessionContent(id, token);
		const sessionData = new ContributedChatSessionData(session, chatSessionType, id, this._onWillDisposeSession.bind(this));

		this._sessions.set(sessionKey, sessionData);

		return session;
	}

	private _onWillDisposeSession(session: ChatSession, chatSessionType: string, id: string): void {
		const sessionKey = `${chatSessionType}_${id}`;
		const sessionData = this._sessions.get(sessionKey);
		if (sessionData) {
			this._sessions.delete(sessionKey);
			sessionData.dispose();
		}
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
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IChatSessionsService private readonly chatSessionService: IChatSessionsService
	) {
		super();
	}

	async invoke(request: IChatAgentRequest, progress: (progress: IChatProgress[]) => void, history: any[], token: CancellationToken): Promise<IChatAgentResult> {
		const widget = this.chatWidgetService.getWidgetBySessionId(request.sessionId);

		if (!widget) {
			return {};
		}

		let chatSession: ChatSession | undefined;

		// Find the first editor that matches the chat session
		for (const group of this.editorGroupService.groups) {
			if (chatSession) {
				break;
			}

			for (const editor of group.editors) {
				if (editor instanceof ChatEditorInput) {
					try {
						const chatModel = await this.chatService.loadSessionForResource(editor.resource, request.location, CancellationToken.None);
						if (chatModel?.sessionId === request.sessionId) {
							// this is the model
							const identifier = ChatSessionUri.parse(editor.resource);

							if (identifier) {
								chatSession = await this.chatSessionService.provideChatSessionContent(this.chatSession.id, identifier.sessionId, token);
							}
							break;
						}
					} catch (error) {
						// might not be us
					}
				}
			}
		}

		if (chatSession?.requestHandler) {
			await chatSession.requestHandler(request, progress, [], token);
		}

		return {};
	}
}
