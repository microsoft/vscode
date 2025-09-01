/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditableData } from '../../../common/views.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { IChatWidgetService } from '../browser/chat.js';
import { ChatEditorInput } from '../browser/chatEditorInput.js';
import { IChatAgentData, IChatAgentHistoryEntry, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatProgress, IChatService } from '../common/chatService.js';
import { ChatSession, ChatSessionStatus, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemProvider, IChatSessionsExtensionPoint, IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatSessionUri } from '../common/chatUri.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';
import { IChatEditorOptions } from './chatEditor.js';
import { VIEWLET_ID } from './chatSessions.js';

const CODING_AGENT_DOCS = 'https://code.visualstudio.com/docs/copilot/copilot-coding-agent';

const extensionPoint = ExtensionsRegistry.registerExtensionPoint<IChatSessionsExtensionPoint[]>({
	extensionPoint: 'chatSessions',
	jsonSchema: {
		description: localize('chatSessionsExtPoint', 'Contributes chat session integrations to the chat widget.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				type: {
					description: localize('chatSessionsExtPoint.chatSessionType', 'Unique identifier for the type of chat session.'),
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
				},
				capabilities: {
					description: localize('chatSessionsExtPoint.capabilities', 'Optional capabilities for this chat session.'),
					type: 'object',
					properties: {
						supportsFileAttachments: {
							description: localize('chatSessionsExtPoint.supportsFileAttachments', 'Whether this chat session supports attaching files or file references.'),
							type: 'boolean'
						},
						supportsToolAttachments: {
							description: localize('chatSessionsExtPoint.supportsToolAttachments', 'Whether this chat session supports attaching tools or tool references.'),
							type: 'boolean'
						}
					}
				}
			},
			required: ['type', 'name', 'displayName', 'description'],
		}
	},
	activationEventsGenerator: (contribs, results) => {
		for (const contrib of contribs) {
			results.push(`onChatSession:${contrib.type}`);
		}
	}
});

class ContributedChatSessionData implements IDisposable {
	private readonly _disposableStore: DisposableStore;

	constructor(
		readonly session: ChatSession,
		readonly chatSessionType: string,
		readonly id: string,
		private readonly onWillDispose: (session: ChatSession, chatSessionType: string, id: string) => void
	) {
		this._disposableStore = new DisposableStore();
		this._disposableStore.add(this.session.onWillDispose(() => {
			this.onWillDispose(this.session, this.chatSessionType, this.id);
		}));
	}

	dispose(): void {
		this._disposableStore.dispose();
	}
}


export class ChatSessionsService extends Disposable implements IChatSessionsService {
	readonly _serviceBrand: undefined;
	private readonly _itemsProviders: Map<string, IChatSessionItemProvider> = new Map();

	private readonly _onDidChangeItemsProviders = this._register(new Emitter<IChatSessionItemProvider>());
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider> = this._onDidChangeItemsProviders.event;
	private readonly _contentProviders: Map<string, IChatSessionContentProvider> = new Map();
	private readonly _contributions: Map<string, IChatSessionsExtensionPoint> = new Map();
	private readonly _disposableStores: Map<string, DisposableStore> = new Map();
	private readonly _contextKeys = new Set<string>();
	private readonly _onDidChangeSessionItems = this._register(new Emitter<string>());
	readonly onDidChangeSessionItems: Event<string> = this._onDidChangeSessionItems.event;
	private readonly _onDidChangeAvailability = this._register(new Emitter<void>());
	readonly onDidChangeAvailability: Event<void> = this._onDidChangeAvailability.event;
	private readonly _onDidChangeInProgress = this._register(new Emitter<void>());
	public get onDidChangeInProgress() { return this._onDidChangeInProgress.event; }
	private readonly inProgressMap: Map<string, number> = new Map();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._register(extensionPoint.setHandler(extensions => {
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
						type: contribution.type,
						name: contribution.name,
						displayName: contribution.displayName,
						description: contribution.description,
						when: contribution.when,
						capabilities: contribution.capabilities,
						extensionDescription: ext.description,
					};
					this._register(this.registerContribution(c));
				}
			}
		}));

		// Listen for context changes and re-evaluate contributions
		this._register(Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(this._contextKeys))(() => {
			this._evaluateAvailability();
		}));

		this._register(this.onDidChangeSessionItems(chatSessionType => {
			this.updateInProgressStatus(chatSessionType).catch(error => {
				this._logService.warn(`Failed to update progress status for '${chatSessionType}':`, error);
			});
		}));
	}

	public reportInProgress(chatSessionType: string, count: number): void {
		let displayName: string | undefined;

		if (chatSessionType === 'local') {
			displayName = 'Local Chat Sessions';
		} else {
			displayName = this._contributions.get(chatSessionType)?.displayName;
		}

		if (displayName) {
			this.inProgressMap.set(displayName, count);
		}
		this._onDidChangeInProgress.fire();
	}

	public getInProgress(): { displayName: string; count: number }[] {
		return Array.from(this.inProgressMap.entries()).map(([displayName, count]) => ({ displayName, count }));
	}

	private async updateInProgressStatus(chatSessionType: string): Promise<void> {
		try {
			const items = await this.provideChatSessionItems(chatSessionType, CancellationToken.None);
			const inProgress = items.filter(item => item.status === ChatSessionStatus.InProgress);
			this.reportInProgress(chatSessionType, inProgress.length);
		} catch (error) {
			this._logService.warn(`Failed to update in-progress status for chat session type '${chatSessionType}':`, error);
		}
	}

	private registerContribution(contribution: IChatSessionsExtensionPoint): IDisposable {
		if (this._contributions.has(contribution.type)) {
			this._logService.warn(`Chat session contribution with id '${contribution.type}' is already registered.`);
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

		this._contributions.set(contribution.type, contribution);
		this._evaluateAvailability();

		return {
			dispose: () => {
				this._contributions.delete(contribution.type);
				const store = this._disposableStores.get(contribution.type);
				if (store) {
					store.dispose();
					this._disposableStores.delete(contribution.type);
				}
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

	private _registerMenuItems(contribution: IChatSessionsExtensionPoint): IDisposable {
		return MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
			command: {
				id: `workbench.action.chat.openNewSessionEditor.${contribution.type}`,
				title: localize('interactiveSession.openNewSessionEditor', "New {0} Chat Editor", contribution.displayName),
				icon: Codicon.plus,
			},
			group: 'navigation',
			order: 1,
			when: ContextKeyExpr.and(
				ContextKeyExpr.equals('view', `${VIEWLET_ID}.${contribution.type}`)
			),
		});
	}

	private _registerCommands(contribution: IChatSessionsExtensionPoint): IDisposable {
		return registerAction2(class OpenNewChatSessionEditorAction extends Action2 {
			constructor() {
				super({
					id: `workbench.action.chat.openNewSessionEditor.${contribution.type}`,
					title: localize2('interactiveSession.openNewSessionEditor', "New {0} Chat Editor", contribution.displayName),
					category: CHAT_CATEGORY,
					icon: Codicon.plus,
					f1: true, // Show in command palette
					precondition: ChatContextKeys.enabled
				});
			}

			async run(accessor: ServicesAccessor) {
				const editorService = accessor.get(IEditorService);
				const logService = accessor.get(ILogService);

				const { type } = contribution;

				try {
					const options: IChatEditorOptions = {
						override: ChatEditorInput.EditorID,
						pinned: true,
						chatSessionType: type, // This will 'lock' the UI of the new, unattached editor to our chat session type
					};
					await editorService.openEditor({
						resource: ChatEditorInput.getNewEditorUri(),
						options,
					});
				} catch (e) {
					logService.error(`Failed to open new '${type}' chat session editor`, e);
				}
			}
		});
	}

	private _evaluateAvailability(): void {
		let hasChanges = false;
		for (const contribution of this._contributions.values()) {
			const isCurrentlyRegistered = this._disposableStores.has(contribution.type);
			const shouldBeRegistered = this._isContributionAvailable(contribution);
			if (isCurrentlyRegistered && !shouldBeRegistered) {
				// Disable the contribution by disposing its disposable store
				const store = this._disposableStores.get(contribution.type);
				if (store) {
					store.dispose();
					this._disposableStores.delete(contribution.type);
				}
				// Also dispose any cached sessions for this contribution
				this._disposeSessionsForContribution(contribution.type);
				hasChanges = true;
			} else if (!isCurrentlyRegistered && shouldBeRegistered) {
				// Enable the contribution by registering it
				this._enableContribution(contribution);
				hasChanges = true;
			}
		}
		if (hasChanges) {
			this._onDidChangeAvailability.fire();
			for (const provider of this._itemsProviders.values()) {
				this._onDidChangeItemsProviders.fire(provider);
			}
			for (const contribution of this._contributions.values()) {
				this._onDidChangeSessionItems.fire(contribution.type);
			}
		}
	}

	private _enableContribution(contribution: IChatSessionsExtensionPoint): void {
		const disposableStore = new DisposableStore();
		this._disposableStores.set(contribution.type, disposableStore);

		disposableStore.add(this._registerDynamicAgent(contribution));
		disposableStore.add(this._registerCommands(contribution));
		disposableStore.add(this._registerMenuItems(contribution));
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
		const { type: id, name, displayName, description, extensionDescription } = contribution;
		const { identifier: extensionId, name: extensionName, displayName: extensionDisplayName, publisher: extensionPublisherId } = extensionDescription;
		const agentData: IChatAgentData = {
			id,
			name,
			fullName: displayName,
			description: description,
			isDefault: false,
			isCore: false,
			isDynamic: true,
			slashCommands: [],
			locations: [ChatAgentLocation.Panel],
			modes: [ChatModeKind.Agent, ChatModeKind.Ask], // TODO: These are no longer respected
			disambiguation: [],
			metadata: {
				themeIcon: Codicon.sendToRemoteAgent,
				isSticky: false,
			},
			capabilities: contribution.capabilities,
			extensionId,
			extensionVersion: extensionDescription.version,
			extensionDisplayName: extensionDisplayName || extensionName,
			extensionPublisherId,
		};

		const agentImpl = this._instantiationService.createInstance(CodingAgentChatImplementation, contribution);
		const disposable = this._chatAgentService.registerDynamicAgent(agentData, agentImpl);
		return disposable;
	}

	getAllChatSessionContributions(): IChatSessionsExtensionPoint[] {
		return Array.from(this._contributions.values()).filter(contribution =>
			this._isContributionAvailable(contribution)
		);
	}

	getAllChatSessionItemProviders(): IChatSessionItemProvider[] {
		return [...this._itemsProviders.values()].filter(provider => {
			// Check if the provider's corresponding contribution is available
			const contribution = this._contributions.get(provider.chatSessionType);
			return !contribution || this._isContributionAvailable(contribution);
		});
	}

	async canResolveItemProvider(chatViewType: string) {
		await this._extensionService.whenInstalledExtensionsRegistered();
		const contribution = this._contributions.get(chatViewType);
		if (contribution && !this._isContributionAvailable(contribution)) {
			return false;
		}

		if (this._itemsProviders.has(chatViewType)) {
			return true;
		}

		await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);

		return this._itemsProviders.has(chatViewType);
	}

	async canResolveContentProvider(chatViewType: string) {
		await this._extensionService.whenInstalledExtensionsRegistered();
		const contribution = this._contributions.get(chatViewType);
		if (contribution && !this._isContributionAvailable(contribution)) {
			return false;
		}

		if (this._contentProviders.has(chatViewType)) {
			return true;
		}

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

		const disposables = new DisposableStore();
		disposables.add(provider.onDidChangeChatSessionItems(() => {
			this._onDidChangeSessionItems.fire(chatSessionType);
		}));

		this.updateInProgressStatus(chatSessionType).catch(error => {
			this._logService.warn(`Failed to update initial progress status for '${chatSessionType}':`, error);
		});

		return {
			dispose: () => {
				disposables.dispose();

				const provider = this._itemsProviders.get(chatSessionType);
				if (provider) {
					this._itemsProviders.delete(chatSessionType);
					this._onDidChangeItemsProviders.fire(provider);
				}
			}
		};
	}

	registerChatSessionContentProvider(chatSessionType: string, provider: IChatSessionContentProvider): IDisposable {
		this._contentProviders.set(chatSessionType, provider);
		return {
			dispose: () => {
				this._contentProviders.delete(chatSessionType);

				// Remove all sessions that were created by this provider
				for (const [key, session] of this._sessions) {
					if (session.chatSessionType === chatSessionType) {
						session.dispose();
						this._sessions.delete(key);
					}
				}
			}
		};
	}

	private readonly _sessions = new Map<string, ContributedChatSessionData>();

	// Editable session support
	private readonly _editableSessions = new Map<string, IEditableData>();

	/**
	 * Creates a new chat session by delegating to the appropriate provider
	 * @param chatSessionType The type of chat session provider to use
	 * @param options Options for the new session including the request
	 * @param token A cancellation token
	 * @returns A session ID for the newly created session
	 */
	public async provideNewChatSessionItem(chatSessionType: string, options: {
		request: IChatAgentRequest;
		prompt?: string;
		history?: any[];
		metadata?: any;
	}, token: CancellationToken): Promise<IChatSessionItem> {
		if (!(await this.canResolveItemProvider(chatSessionType))) {
			throw Error(`Cannot find provider for ${chatSessionType}`);
		}

		const provider = this._itemsProviders.get(chatSessionType);
		if (!provider?.provideNewChatSessionItem) {
			throw Error(`Provider for ${chatSessionType} does not support creating sessions`);
		}
		const chatSessionItem = await provider.provideNewChatSessionItem(options, token);
		this._onDidChangeSessionItems.fire(chatSessionType);
		return chatSessionItem;
	}

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
		this._sessions.delete(sessionKey);
	}

	// Implementation of editable session methods
	public async setEditableSession(sessionId: string, data: IEditableData | null): Promise<void> {
		if (!data) {
			this._editableSessions.delete(sessionId);
		} else {
			this._editableSessions.set(sessionId, data);
		}
		// Trigger refresh of the session views that might need to update their rendering
		this._onDidChangeSessionItems.fire('local');
	}

	public getEditableData(sessionId: string): IEditableData | undefined {
		return this._editableSessions.get(sessionId);
	}

	public isEditable(sessionId: string): boolean {
		return this._editableSessions.has(sessionId);
	}

	public notifySessionItemsChanged(chatSessionType: string): void {
		this._onDidChangeSessionItems.fire(chatSessionType);
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
		@IChatSessionsService private readonly chatSessionService: IChatSessionsService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();
	}

	async invoke(request: IChatAgentRequest, progress: (progress: IChatProgress[]) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
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
								chatSession = await this.chatSessionService.provideChatSessionContent(this.chatSession.type, identifier.sessionId, token);
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
			await chatSession.requestHandler(request, progress, history, token); // TODO: Revisit this function's signature in relation to its extension API (eg: 'history' is not strongly typed here)
		} else {
			try {
				const chatSessionItem = await this.chatSessionService.provideNewChatSessionItem(
					this.chatSession.type,
					{
						request,
						prompt: request.message,
						history,
					},
					token,
				);
				const options: IChatEditorOptions = {
					pinned: true,
					preferredTitle: chatSessionItem.label,
				};

				// Prefetch the chat session content to make the subsequent editor swap quick
				await this.chatSessionService.provideChatSessionContent(
					this.chatSession.type,
					chatSessionItem.id,
					token
				);

				const activeGroup = this.editorGroupService.activeGroup;
				const currentEditor = activeGroup?.activeEditor;
				if (currentEditor instanceof ChatEditorInput) {
					await this.editorService.replaceEditors([{
						editor: currentEditor,
						replacement: {
							resource: ChatSessionUri.forSession(this.chatSession.type, chatSessionItem.id),
							options,
						}
					}], activeGroup);
				} else {
					// Fallback: open in new editor if we couldn't find the current one
					await this.editorService.openEditor({
						resource: ChatSessionUri.forSession(this.chatSession.type, chatSessionItem.id),
						options,
					});
					progress([{
						kind: 'markdownContent',
						content: new MarkdownString(localize('continueInNewChat', 'Continue **{0}** in a new chat editor', chatSessionItem.label)),
					}]);
				}
			} catch (error) {
				// End up here if extension does not support 'provideNewChatSessionItem'
				// TODO(jospicer): Fallback that should be removed/generalized when API stabilizes
				const content = new MarkdownString(
					localize('chatSessionNotFound', "Use `#copilotCodingAgent` to begin a new [coding agent session]({0}).", CODING_AGENT_DOCS),
				);
				progress([{
					kind: 'markdownContent',
					content,
				}]);
			}
		}

		return {};
	}
}
