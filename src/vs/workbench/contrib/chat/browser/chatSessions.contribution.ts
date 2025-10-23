/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditableData } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { ChatEditorInput } from '../browser/chatEditorInput.js';
import { IChatAgentAttachmentCapabilities, IChatAgentData, IChatAgentRequest, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatSession, ChatSessionStatus, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemProvider, IChatSessionProviderOptionGroup, IChatSessionsExtensionPoint, IChatSessionsService } from '../common/chatSessionsService.js';
import { ChatSessionUri } from '../common/chatUri.js';
import { ChatAgentLocation, ChatModeKind, VIEWLET_ID } from '../common/constants.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';
import { IChatEditorOptions } from './chatEditor.js';
import { NEW_CHAT_SESSION_ACTION_ID } from './chatSessions/common.js';

const extensionPoint = ExtensionsRegistry.registerExtensionPoint<IChatSessionsExtensionPoint[]>({
	extensionPoint: 'chatSessions',
	jsonSchema: {
		description: localize('chatSessionsExtPoint', 'Contributes chat session integrations to the chat widget.'),
		type: 'array',
		items: {
			type: 'object',
			additionalProperties: false,
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
				icon: {
					description: localize('chatSessionsExtPoint.icon', 'Icon identifier (codicon ID) for the chat session editor tab. For example, "$(github)" or "$(cloud)".'),
					type: 'string'
				},
				welcomeTitle: {
					description: localize('chatSessionsExtPoint.welcomeTitle', 'Title text to display in the chat welcome view for this session type.'),
					type: 'string'
				},
				welcomeMessage: {
					description: localize('chatSessionsExtPoint.welcomeMessage', 'Message text (supports markdown) to display in the chat welcome view for this session type.'),
					type: 'string'
				},
				welcomeTips: {
					description: localize('chatSessionsExtPoint.welcomeTips', 'Tips text (supports markdown and theme icons) to display in the chat welcome view for this session type.'),
					type: 'string'
				},
				inputPlaceholder: {
					description: localize('chatSessionsExtPoint.inputPlaceholder', 'Placeholder text to display in the chat input box for this session type.'),
					type: 'string'
				},
				capabilities: {
					description: localize('chatSessionsExtPoint.capabilities', 'Optional capabilities for this chat session.'),
					type: 'object',
					additionalProperties: false,
					properties: {
						supportsFileAttachments: {
							description: localize('chatSessionsExtPoint.supportsFileAttachments', 'Whether this chat session supports attaching files or file references.'),
							type: 'boolean'
						},
						supportsToolAttachments: {
							description: localize('chatSessionsExtPoint.supportsToolAttachments', 'Whether this chat session supports attaching tools or tool references.'),
							type: 'boolean'
						},
						supportsMCPAttachments: {
							description: localize('chatSessionsExtPoint.supportsMCPAttachments', 'Whether this chat session supports attaching MCP resources.'),
							type: 'boolean'
						},
						supportsImageAttachments: {
							description: localize('chatSessionsExtPoint.supportsImageAttachments', 'Whether this chat session supports attaching images.'),
							type: 'boolean'
						},
						supportsSearchResultAttachments: {
							description: localize('chatSessionsExtPoint.supportsSearchResultAttachments', 'Whether this chat session supports attaching search results.'),
							type: 'boolean'
						},
						supportsInstructionAttachments: {
							description: localize('chatSessionsExtPoint.supportsInstructionAttachments', 'Whether this chat session supports attaching instructions.'),
							type: 'boolean'
						},
						supportsSourceControlAttachments: {
							description: localize('chatSessionsExtPoint.supportsSourceControlAttachments', 'Whether this chat session supports attaching source control changes.'),
							type: 'boolean'
						},
						supportsProblemAttachments: {
							description: localize('chatSessionsExtPoint.supportsProblemAttachments', 'Whether this chat session supports attaching problems.'),
							type: 'boolean'
						},
						supportsSymbolAttachments: {
							description: localize('chatSessionsExtPoint.supportsSymbolAttachments', 'Whether this chat session supports attaching symbols.'),
							type: 'boolean'
						}
					}
				},
				commands: {
					markdownDescription: localize('chatCommandsDescription', "Commands available for this chat session, which the user can invoke with a `/`."),
					type: 'array',
					items: {
						additionalProperties: false,
						type: 'object',
						defaultSnippets: [{ body: { name: '', description: '' } }],
						required: ['name'],
						properties: {
							name: {
								description: localize('chatCommand', "A short name by which this command is referred to in the UI, e.g. `fix` or `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
								type: 'string'
							},
							description: {
								description: localize('chatCommandDescription', "A description of this command."),
								type: 'string'
							},
							when: {
								description: localize('chatCommandWhen', "A condition which must be true to enable this command."),
								type: 'string'
							},
						}
					}
				}
			},
			required: ['type', 'name', 'displayName', 'description'],
		}
	},
	activationEventsGenerator: function* (contribs) {
		for (const contrib of contribs) {
			yield `onChatSession:${contrib.type}`;
		}
	}
});

class ContributedChatSessionData implements IDisposable {
	private readonly _disposableStore: DisposableStore;

	private readonly _optionsCache: Map<string /* 'models' */, string>;
	public getOption(optionId: string): string | undefined {
		return this._optionsCache.get(optionId);
	}
	public setOption(optionId: string, value: string): void {
		this._optionsCache.set(optionId, value);
	}

	constructor(
		readonly session: ChatSession,
		readonly chatSessionType: string,
		readonly id: string,
		readonly options: Record<string, string> | undefined,
		private readonly onWillDispose: (session: ChatSession, chatSessionType: string, id: string) => void
	) {
		this._optionsCache = new Map<string, string>();
		if (options) {
			for (const [key, value] of Object.entries(options)) {
				this._optionsCache.set(key, value);
			}
		}
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
	private readonly _contentProvidersBySessionType: Map<string, Map<number, IChatSessionContentProvider>> = new Map();
	private readonly _contributions: Map<string, IChatSessionsExtensionPoint[]> = new Map();
	private readonly _disposableStores: Map<string, DisposableStore> = new Map();
	private readonly _contextKeys = new Set<string>();
	private readonly _onDidChangeSessionItems = this._register(new Emitter<string>());
	readonly onDidChangeSessionItems: Event<string> = this._onDidChangeSessionItems.event;
	private readonly _onDidChangeAvailability = this._register(new Emitter<void>());
	readonly onDidChangeAvailability: Event<void> = this._onDidChangeAvailability.event;
	private readonly _onDidChangeInProgress = this._register(new Emitter<void>());
	public get onDidChangeInProgress() { return this._onDidChangeInProgress.event; }
	private readonly inProgressMap: Map<string, number> = new Map();
	private readonly _sessionTypeOptions: Map<string, IChatSessionProviderOptionGroup[]> = new Map();
	private readonly _sessionTypeIcons: Map<string, ThemeIcon> = new Map();
	private readonly _sessionTypeWelcomeTitles: Map<string, string> = new Map();
	private readonly _sessionTypeWelcomeMessages: Map<string, string> = new Map();
	private readonly _sessionTypeWelcomeTips: Map<string, string> = new Map();
	private readonly _sessionTypeInputPlaceholders: Map<string, string> = new Map();
	private _activatingSessionTypes = new Set<string>();
	private _nextContentProviderHandle = 0;

	constructor(
		@ILogService private readonly _logService: ILogService,
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
						type: contribution.type,
						name: contribution.name,
						displayName: contribution.displayName,
						description: contribution.description,
						when: contribution.when,
						icon: contribution.icon,
						welcomeTitle: contribution.welcomeTitle,
						welcomeMessage: contribution.welcomeMessage,
						welcomeTips: contribution.welcomeTips,
						inputPlaceholder: contribution.inputPlaceholder,
						capabilities: contribution.capabilities,
						extensionDescription: ext.description,
						commands: contribution.commands
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
			displayName = 'Local Chat Agent';
		} else {
			displayName = this._getActiveContribution(chatSessionType)?.displayName;
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
		const extensionId = contribution.extensionDescription.identifier.value;
		const contributionKey = `${extensionId}.${contribution.type}`;

		// Track context keys from the when condition
		if (contribution.when) {
			const whenExpr = ContextKeyExpr.deserialize(contribution.when);
			if (whenExpr) {
				for (const key of whenExpr.keys()) {
					this._contextKeys.add(key);
				}
			}
		}

		if (!this._contributions.has(contribution.type)) {
			this._contributions.set(contribution.type, []);
		}
		this._contributions.get(contribution.type)!.push(contribution);

		// Store icon mapping if provided
		let icon: ThemeIcon | undefined;

		if (contribution.icon) {
			// Parse icon string - support both "$(iconId)" and "iconId" formats
			icon = contribution.icon.startsWith('$(') && contribution.icon.endsWith(')')
				? ThemeIcon.fromString(contribution.icon)
				: ThemeIcon.fromId(contribution.icon);
		}

		if (icon) {
			this._sessionTypeIcons.set(contribution.type, icon);
		}

		// Store welcome title, message, tips, and input placeholder if provided
		if (contribution.welcomeTitle) {
			this._sessionTypeWelcomeTitles.set(contribution.type, contribution.welcomeTitle);
		}
		if (contribution.welcomeMessage) {
			this._sessionTypeWelcomeMessages.set(contribution.type, contribution.welcomeMessage);
		}
		if (contribution.welcomeTips) {
			this._sessionTypeWelcomeTips.set(contribution.type, contribution.welcomeTips);
		}
		if (contribution.inputPlaceholder) {
			this._sessionTypeInputPlaceholders.set(contribution.type, contribution.inputPlaceholder);
		}

		this._evaluateAvailability();

		return {
			dispose: () => {
				const contributions = this._contributions.get(contribution.type);
				if (contributions) {
					const index = contributions.findIndex(c => c.extensionDescription.identifier.value === extensionId);
					if (index >= 0) {
						contributions.splice(index, 1);
						if (contributions.length === 0) {
							this._contributions.delete(contribution.type);
							// Clean up associated data when no contributions remain for this type
							this._sessionTypeIcons.delete(contribution.type);
							this._sessionTypeWelcomeTitles.delete(contribution.type);
							this._sessionTypeWelcomeMessages.delete(contribution.type);
							this._sessionTypeWelcomeTips.delete(contribution.type);
							this._sessionTypeInputPlaceholders.delete(contribution.type);
						}
					}
				}

				const store = this._disposableStores.get(contributionKey);
				if (store) {
					store.dispose();
					this._disposableStores.delete(contributionKey);
				}

				this._evaluateAvailability();
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

	/**
	 * Get the active contribution for a session type. If multiple contributions are available,
	 * return the first one that matches its when condition.
	 */
	private _getActiveContribution(sessionType: string): IChatSessionsExtensionPoint | undefined {
		const contributions = this._contributions.get(sessionType);
		if (!contributions || contributions.length === 0) {
			return undefined;
		}

		// Return the first available contribution
		for (const contribution of contributions) {
			if (this._isContributionAvailable(contribution)) {
				return contribution;
			}
		}

		return undefined;
	}

	private _registerMenuItems(contribution: IChatSessionsExtensionPoint): IDisposable {
		return MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
			command: {
				id: `${NEW_CHAT_SESSION_ACTION_ID}.${contribution.type}`,
				title: localize('interactiveSession.openNewSessionEditor', "New {0}", contribution.displayName),
				icon: Codicon.plus,
				source: {
					id: contribution.extensionDescription.identifier.value,
					title: contribution.extensionDescription.displayName || contribution.extensionDescription.name,
				}
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
					title: localize2('interactiveSession.openNewSessionEditor', "New {0}", contribution.displayName),
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
						title: {
							fallback: localize('chatEditorContributionName', "{0}", contribution.displayName),
						}
					};
					const untitledId = `untitled-${generateUuid()}`;
					await editorService.openEditor({
						resource: ChatSessionUri.forSession(type, untitledId),
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

		// Track which session types need to be processed
		const sessionTypesToProcess = new Set<string>();

		// Collect all session types from contributions
		for (const sessionType of this._contributions.keys()) {
			sessionTypesToProcess.add(sessionType);
		}

		// Also check session types that might have disposed contributions
		for (const sessionType of this._disposableStores.keys()) {
			const parts = sessionType.split('.');
			if (parts.length >= 2) {
				const type = parts.slice(1).join('.'); // Remove extension id prefix
				sessionTypesToProcess.add(type);
			}
		}

		for (const sessionType of sessionTypesToProcess) {
			const activeContribution = this._getActiveContribution(sessionType);
			const contributionKey = activeContribution ? `${activeContribution.extensionDescription.identifier.value}.${sessionType}` : null;
			const isCurrentlyRegistered = contributionKey && this._disposableStores.has(contributionKey);
			const shouldBeRegistered = !!activeContribution;

			if (isCurrentlyRegistered && !shouldBeRegistered) {
				// Disable the contribution by disposing its disposable store
				const store = this._disposableStores.get(contributionKey!);
				if (store) {
					store.dispose();
					this._disposableStores.delete(contributionKey!);
				}
				// Also dispose any cached sessions for this contribution
				this._disposeSessionsForContribution(sessionType);
				hasChanges = true;
			} else if (!isCurrentlyRegistered && shouldBeRegistered && activeContribution) {
				// Enable the contribution by registering it
				this._enableContribution(activeContribution);
				hasChanges = true;
			} else if (isCurrentlyRegistered && shouldBeRegistered && activeContribution) {
				// Check if we need to switch to a different active contribution
				const currentActiveKey = Array.from(this._disposableStores.keys())
					.find(key => key.endsWith(`.${sessionType}`));
				const expectedKey = `${activeContribution.extensionDescription.identifier.value}.${sessionType}`;

				if (currentActiveKey && currentActiveKey !== expectedKey) {
					// Dispose current and enable new
					const store = this._disposableStores.get(currentActiveKey);
					if (store) {
						store.dispose();
						this._disposableStores.delete(currentActiveKey);
					}
					this._enableContribution(activeContribution);
					hasChanges = true;
				}
			}
		}

		if (hasChanges) {
			this._onDidChangeAvailability.fire();
			for (const provider of this._itemsProviders.values()) {
				this._onDidChangeItemsProviders.fire(provider);
			}
			for (const sessionType of sessionTypesToProcess) {
				this._onDidChangeSessionItems.fire(sessionType);
			}
		}
	}

	private _enableContribution(contribution: IChatSessionsExtensionPoint): void {
		const contributionKey = `${contribution.extensionDescription.identifier.value}.${contribution.type}`;
		const disposableStore = new DisposableStore();
		this._disposableStores.set(contributionKey, disposableStore);

		disposableStore.add(this._registerAgent(contribution));
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

	private _registerAgent(contribution: IChatSessionsExtensionPoint): IDisposable {
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
			slashCommands: contribution.commands ?? [],
			locations: [ChatAgentLocation.Chat],
			modes: [ChatModeKind.Agent, ChatModeKind.Ask],
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

		return this._chatAgentService.registerAgent(id, agentData);
	}

	getAllChatSessionContributions(): IChatSessionsExtensionPoint[] {
		const activeContributions: IChatSessionsExtensionPoint[] = [];
		for (const sessionType of this._contributions.keys()) {
			const activeContribution = this._getActiveContribution(sessionType);
			if (activeContribution) {
				activeContributions.push(activeContribution);
			}
		}
		return activeContributions;
	}

	getAllChatSessionItemProviders(): IChatSessionItemProvider[] {
		return [...this._itemsProviders.values()].filter(provider => {
			// Check if the provider's corresponding contribution is available
			const activeContribution = this._getActiveContribution(provider.chatSessionType);
			return !!activeContribution;
		});
	}

	async canResolveItemProvider(chatViewType: string): Promise<boolean> {
		await this._extensionService.whenInstalledExtensionsRegistered();

		// Check if any contribution exists for this type (even if not currently active)
		// This is important for session restoration when when clauses might not be evaluated yet
		const hasContributions = this._contributions.has(chatViewType);
		if (!hasContributions) {
			return false;
		}

		if (this._itemsProviders.has(chatViewType)) {
			return true;
		}

		// Prevent duplicate activation attempts for the same session type
		if (!this._activatingSessionTypes.has(chatViewType)) {
			this._activatingSessionTypes.add(chatViewType);
			try {
				await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);
			} finally {
				this._activatingSessionTypes.delete(chatViewType);
			}
		}

		return this._itemsProviders.has(chatViewType);
	}

	async canResolveContentProvider(chatViewType: string) {
		await this._extensionService.whenInstalledExtensionsRegistered();

		// Check if any contribution exists for this type (even if not currently active)
		// This is important for session restoration when when clauses might not be evaluated yet
		const hasContributions = this._contributions.has(chatViewType);
		if (!hasContributions) {
			return false;
		}

		// Check both provider maps
		if (this._contentProviders.has(chatViewType) || this._contentProvidersBySessionType.has(chatViewType)) {
			return true;
		}

		// Prevent duplicate activation attempts for the same session type
		if (!this._activatingSessionTypes.has(chatViewType)) {
			this._activatingSessionTypes.add(chatViewType);
			try {
				await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);
			} finally {
				this._activatingSessionTypes.delete(chatViewType);
			}
		}

		return this._contentProviders.has(chatViewType) || this._contentProvidersBySessionType.has(chatViewType);
	}

	public async provideChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]> {
		if (!(await this.canResolveItemProvider(chatSessionType))) {
			return [];
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
		// Generate a unique handle for this provider registration
		const handle = this._nextContentProviderHandle++;

		// Keep the legacy single provider map for backward compatibility
		this._contentProviders.set(chatSessionType, provider);

		// Also store by handle to support multiple providers
		if (!this._contentProvidersBySessionType.has(chatSessionType)) {
			this._contentProvidersBySessionType.set(chatSessionType, new Map());
		}
		this._contentProvidersBySessionType.get(chatSessionType)!.set(handle, provider);

		return {
			dispose: () => {
				// Remove from multi-provider map
				const providers = this._contentProvidersBySessionType.get(chatSessionType);
				if (providers) {
					providers.delete(handle);
					if (providers.size === 0) {
						this._contentProvidersBySessionType.delete(chatSessionType);
					}
				}

				// Only delete from legacy map if this was the last provider
				if (!this._contentProvidersBySessionType.has(chatSessionType)) {
					this._contentProviders.delete(chatSessionType);

					// Remove all sessions that were created by this provider
					for (const [key, session] of this._sessions) {
						if (session.chatSessionType === chatSessionType) {
							session.dispose();
							this._sessions.delete(key);
						}
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

	public async provideChatSessionContent(chatSessionType: string, id: string, resource: URI, token: CancellationToken): Promise<ChatSession> {
		if (!(await this.canResolveContentProvider(chatSessionType))) {
			throw Error(`Can not find provider for ${chatSessionType}`);
		}

		// Try to get provider from the multi-provider map first, then fall back to legacy single provider
		let provider: IChatSessionContentProvider | undefined;
		const providers = this._contentProvidersBySessionType.get(chatSessionType);
		if (providers && providers.size > 0) {
			// Use the first available provider (any provider can restore the session)
			provider = Array.from(providers.values())[0];
		} else {
			provider = this._contentProviders.get(chatSessionType);
		}

		if (!provider) {
			throw Error(`Can not find provider for ${chatSessionType}`);
		}

		const sessionKey = `${chatSessionType}_${id}`;
		const existingSessionData = this._sessions.get(sessionKey);
		if (existingSessionData) {
			return existingSessionData.session;
		}

		const session = await provider.provideChatSessionContent(id, resource, token);
		const sessionData = new ContributedChatSessionData(session, chatSessionType, id, session.options, this._onWillDisposeSession.bind(this));

		this._sessions.set(sessionKey, sessionData);

		return session;
	}

	private _onWillDisposeSession(session: ChatSession, chatSessionType: string, id: string): void {
		const sessionKey = `${chatSessionType}_${id}`;
		this._sessions.delete(sessionKey);
	}

	public getSessionOption(chatSessionType: string, id: string, optionId: string): string | undefined {
		const sessionKey = `${chatSessionType}_${id}`;
		const session = this._sessions.get(sessionKey);
		return session?.getOption(optionId);
	}

	public setSessionOption(chatSessionType: string, id: string, optionId: string, value: string): boolean {
		const sessionKey = `${chatSessionType}_${id}`;
		const session = this._sessions.get(sessionKey);
		return !!session?.setOption(optionId, value);
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

	/**
	 * Store option groups for a session type
	 */
	public setOptionGroupsForSessionType(chatSessionType: string, handle: number, optionGroups?: IChatSessionProviderOptionGroup[]): void {
		if (optionGroups) {
			this._sessionTypeOptions.set(chatSessionType, optionGroups);
		} else {
			this._sessionTypeOptions.delete(chatSessionType);
		}
	}

	/**
	 * Get available option groups for a session type
	 */
	public getOptionGroupsForSessionType(chatSessionType: string): IChatSessionProviderOptionGroup[] | undefined {
		return this._sessionTypeOptions.get(chatSessionType);
	}

	private _optionsChangeCallback?: (chatSessionType: string, sessionId: string, updates: ReadonlyArray<{ optionId: string; value: string }>) => Promise<void>;

	/**
	 * Set the callback for notifying extensions about option changes
	 */
	public setOptionsChangeCallback(callback: (chatSessionType: string, sessionId: string, updates: ReadonlyArray<{ optionId: string; value: string }>) => Promise<void>): void {
		this._optionsChangeCallback = callback;
	}

	/**
	 * Notify extension about option changes for a session
	 */
	public async notifySessionOptionsChange(chatSessionType: string, sessionId: string, updates: ReadonlyArray<{ optionId: string; value: string }>): Promise<void> {
		if (!updates.length) {
			return;
		}
		if (this._optionsChangeCallback) {
			await this._optionsChangeCallback(chatSessionType, sessionId, updates);
		}
		for (const u of updates) {
			this.setSessionOption(chatSessionType, sessionId, u.optionId, u.value);
		}
	}

	/**
	 * Get the icon for a specific session type
	 */
	public getIconForSessionType(chatSessionType: string): ThemeIcon | undefined {
		return this._sessionTypeIcons.get(chatSessionType);
	}

	/**
	 * Get the welcome title for a specific session type
	 */
	public getWelcomeTitleForSessionType(chatSessionType: string): string | undefined {
		return this._sessionTypeWelcomeTitles.get(chatSessionType);
	}

	/**
	 * Get the welcome message for a specific session type
	 */
	public getWelcomeMessageForSessionType(chatSessionType: string): string | undefined {
		return this._sessionTypeWelcomeMessages.get(chatSessionType);
	}

	/**
	 * Get the input placeholder for a specific session type
	 */
	public getInputPlaceholderForSessionType(chatSessionType: string): string | undefined {
		return this._sessionTypeInputPlaceholders.get(chatSessionType);
	}

	/**
	 * Get the capabilities for a specific session type
	 */
	public getCapabilitiesForSessionType(chatSessionType: string): IChatAgentAttachmentCapabilities | undefined {
		const activeContribution = this._getActiveContribution(chatSessionType);
		return activeContribution?.capabilities;
	}

	/**
	 * Get the welcome tips for a specific session type
	 */
	public getWelcomeTipsForSessionType(chatSessionType: string): string | undefined {
		return this._sessionTypeWelcomeTips.get(chatSessionType);
	}
}

registerSingleton(IChatSessionsService, ChatSessionsService, InstantiationType.Delayed);
