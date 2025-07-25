/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
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
						extensionDescription: ext.description,
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
		private readonly onWillDispose: (session: ChatSession, chatSessionType: string, id: string) => void
	) {
	}

	dispose(): void {
		this.onWillDispose(this.session, this.chatSessionType, this.id);
		this.session.dispose();
	}
}


export class ChatSessionsService extends Disposable implements IChatSessionsService {
	readonly _serviceBrand: undefined;
	private readonly _itemsProviders: Map<string, IChatSessionItemProvider> = new Map();

	private readonly _onDidChangeItemsProviders = this._register(new Emitter<IChatSessionItemProvider>());
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider> = this._onDidChangeItemsProviders.event;
	private readonly _contentProviders: Map<string, IChatSessionContentProvider> = new Map();
	private readonly _contributions: Map<string, IChatSessionsExtensionPoint> = new Map();
	private readonly _dynamicAgentDisposables: Map<string, IDisposable> = new Map();
	private readonly _contextKeys = new Set<string>();
	private readonly _onDidChangeSessionItems = this._register(new Emitter<string>());
	readonly onDidChangeSessionItems: Event<string> = this._onDidChangeSessionItems.event;
	private readonly _onDidChangeAvailability = this._register(new Emitter<void>());
	readonly onDidChangeAvailability: Event<void> = this._onDidChangeAvailability.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		// Listen for context changes and re-evaluate contributions
		this._register(Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(this._contextKeys))(() => {
			this._evaluateAvailability();
		}));
	}
	public registerContribution(contribution: IChatSessionsExtensionPoint): IDisposable {
		if (this._contributions.has(contribution.id)) {
			this._logService.warn(`Chat session contribution with id '${contribution.id}' is already registered.`);
			return { dispose: () => { } };
		}

		// Track context keys from the when condition
		if (contribution.when) {
			const whenExpr = ContextKeyExpr.deserialize(contribution.when);
			if (whenExpr) {
				for (const key of whenExpr.keys()) {
					this._contextKeys.add(key);
				}
			}
		}

		this._contributions.set(contribution.id, contribution);

		// Register dynamic agent if the when condition is satisfied
		this._registerDynamicAgentIfAvailable(contribution);

		return {
			dispose: () => {
				this._contributions.delete(contribution.id);
				this._disposeDynamicAgent(contribution.id);
			}
		};
	}

	private _isContributionAvailable(contribution: IChatSessionsExtensionPoint): boolean {
		if (!contribution.when) {
			return true;
		}

		const whenExpr = ContextKeyExpr.deserialize(contribution.when);
		return !whenExpr || this._contextKeyService.contextMatchesRules(whenExpr);
	}

	private _registerDynamicAgentIfAvailable(contribution: IChatSessionsExtensionPoint): void {
		if (this._isContributionAvailable(contribution)) {
			const disposable = this._registerDynamicAgent(contribution);
			this._dynamicAgentDisposables.set(contribution.id, disposable);
		}
	}

	private _disposeDynamicAgent(contributionId: string): void {
		const disposable = this._dynamicAgentDisposables.get(contributionId);
		if (disposable) {
			disposable.dispose();
			this._dynamicAgentDisposables.delete(contributionId);
		}
	}

	private _evaluateAvailability(): void {
		let hasChanges = false;

		for (const contribution of this._contributions.values()) {
			const isCurrentlyRegistered = this._dynamicAgentDisposables.has(contribution.id);
			const shouldBeRegistered = this._isContributionAvailable(contribution);

			if (isCurrentlyRegistered && !shouldBeRegistered) {
				// Should be unregistered
				this._disposeDynamicAgent(contribution.id);
				// Also dispose any cached sessions for this contribution
				this._disposeSessionsForContribution(contribution.id);
				hasChanges = true;
			} else if (!isCurrentlyRegistered && shouldBeRegistered) {
				// Should be registered
				this._registerDynamicAgentIfAvailable(contribution);
				hasChanges = true;
			}
		}

		// Fire events to notify UI about provider availability changes
		if (hasChanges) {
			// Fire the main availability change event
			this._onDidChangeAvailability.fire();

			// Notify that the list of available item providers has changed
			for (const provider of this._itemsProviders.values()) {
				this._onDidChangeItemsProviders.fire(provider);
			}

			// Notify about session items changes for all chat session types
			for (const contribution of this._contributions.values()) {
				this._onDidChangeSessionItems.fire(contribution.id);
			}
		}
	}

	private _disposeSessionsForContribution(contributionId: string): void {
		// Find and dispose all sessions that belong to this contribution
		const sessionsToDispose: string[] = [];
		for (const [sessionKey, sessionData] of this._sessions) {
			if (sessionData.chatSessionType === contributionId) {
				sessionsToDispose.push(sessionKey);
			}
		}

		if (sessionsToDispose.length > 0) {
			this._logService.info(`Disposing ${sessionsToDispose.length} cached sessions for contribution '${contributionId}' due to when clause change`);
		}

		for (const sessionKey of sessionsToDispose) {
			const sessionData = this._sessions.get(sessionKey);
			if (sessionData) {
				sessionData.dispose(); // This will call _onWillDisposeSession and clean up
			}
		}
	}

	private _registerDynamicAgent(contribution: IChatSessionsExtensionPoint): IDisposable {
		const { id, name, displayName, description, extensionDescription } = contribution;
		const { identifier: extensionId, name: extensionName, displayName: extensionDisplayName, publisher: extensionPublisherId } = extensionDescription;
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
			locations: [ChatAgentLocation.Panel], // TODO: This doesn't appear to be respected
			modes: [ChatModeKind.Agent, ChatModeKind.Ask], // TODO: These are no longer respected
			disambiguation: [],
			metadata: {
				themeIcon: Codicon.sendToRemoteAgent,
				isSticky: false,
			},
			extensionId,
			extensionDisplayName: extensionDisplayName || extensionName,
			extensionPublisherId,
		};

		const agentImpl = this._instantiationService.createInstance(CodingAgentChatImplementation, contribution);
		const disposable = this._chatAgentService.registerDynamicAgent(agentData, agentImpl);
		return disposable;
	}

	getChatSessionContributions(): IChatSessionsExtensionPoint[] {
		return Array.from(this._contributions.values()).filter(contribution =>
			this._isContributionAvailable(contribution)
		);
	}

	getChatSessionItemProviders(): IChatSessionItemProvider[] {
		return [...this._itemsProviders.values()].filter(provider => {
			// Check if the provider's corresponding contribution is available
			const contribution = this._contributions.get(provider.chatSessionType);
			return !contribution || this._isContributionAvailable(contribution);
		});
	}

	async canResolveItemProvider(chatViewType: string) {
		// First check if the contribution is available based on its when clause
		const contribution = this._contributions.get(chatViewType);
		if (contribution && !this._isContributionAvailable(contribution)) {
			return false;
		}

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
		// First check if the contribution is available based on its when clause
		const contribution = this._contributions.get(chatViewType);
		if (contribution && !this._isContributionAvailable(contribution)) {
			return false;
		}

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
	} private _onWillDisposeSession(session: ChatSession, chatSessionType: string, id: string): void {
		const sessionKey = `${chatSessionType}_${id}`;
		this._sessions.delete(sessionKey);
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
