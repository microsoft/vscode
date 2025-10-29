/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import * as resources from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IRelaxedExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditableData } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { ChatEditorInput } from '../browser/chatEditorInput.js';
import { IChatAgentAttachmentCapabilities, IChatAgentData, IChatAgentRequest, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatSessionStatus, IChatSession, IChatSessionContentProvider, IChatSessionItem, IChatSessionItemProvider, IChatSessionProviderOptionGroup, IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType, SessionOptionsChangedCallback } from '../common/chatSessionsService.js';
import { AGENT_SESSIONS_VIEWLET_ID, ChatAgentLocation, ChatModeKind } from '../common/constants.js';
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
					description: localize('chatSessionsExtPoint.name', 'Name of the dynamically registered chat participant (eg: @agent). Must not contain whitespace.'),
					type: 'string',
					pattern: '^[\\w-]+$'
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
					anyOf: [{
						type: 'string'
					},
					{
						type: 'object',
						properties: {
							light: {
								description: localize('icon.light', 'Icon path when a light theme is used'),
								type: 'string'
							},
							dark: {
								description: localize('icon.dark', 'Icon path when a dark theme is used'),
								type: 'string'
							}
						}
					}]
				},
				order: {
					description: localize('chatSessionsExtPoint.order', 'Order in which this item should be displayed.'),
					type: 'integer'
				},
				alternativeIds: {
					description: localize('chatSessionsExtPoint.alternativeIds', 'Alternative identifiers for backward compatibility.'),
					type: 'array',
					items: {
						type: 'string'
					}
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
		readonly session: IChatSession,
		readonly chatSessionType: string,
		readonly resource: URI,
		readonly options: Record<string, string> | undefined,
		private readonly onWillDispose: (resource: URI) => void
	) {
		this._optionsCache = new Map<string, string>();
		if (options) {
			for (const [key, value] of Object.entries(options)) {
				this._optionsCache.set(key, value);
			}
		}
		this._disposableStore = new DisposableStore();
		this._disposableStore.add(this.session.onWillDispose(() => {
			this.onWillDispose(this.resource);
		}));
	}

	dispose(): void {
		this._disposableStore.dispose();
	}
}


export class ChatSessionsService extends Disposable implements IChatSessionsService {
	readonly _serviceBrand: undefined;

	private readonly _itemsProviders: Map</* type */ string, IChatSessionItemProvider> = new Map();

	private readonly _contributions: Map</* type */ string, { readonly contribution: IChatSessionsExtensionPoint; readonly extension: IRelaxedExtensionDescription }> = new Map();
	private readonly _contributionDisposables = this._register(new DisposableMap</* type */ string>());

	private readonly _contentProviders: Map</* scheme */ string, IChatSessionContentProvider> = new Map();
	private readonly _alternativeIdMap: Map</* alternativeId */ string, /* primaryType */ string> = new Map();
	private readonly _contextKeys = new Set<string>();

	private readonly _onDidChangeItemsProviders = this._register(new Emitter<IChatSessionItemProvider>());
	readonly onDidChangeItemsProviders: Event<IChatSessionItemProvider> = this._onDidChangeItemsProviders.event;

	private readonly _onDidChangeSessionItems = this._register(new Emitter<string>());
	readonly onDidChangeSessionItems: Event<string> = this._onDidChangeSessionItems.event;

	private readonly _onDidChangeAvailability = this._register(new Emitter<void>());
	readonly onDidChangeAvailability: Event<void> = this._onDidChangeAvailability.event;

	private readonly _onDidChangeInProgress = this._register(new Emitter<void>());
	public get onDidChangeInProgress() { return this._onDidChangeInProgress.event; }

	private readonly _onDidChangeContentProviderSchemes = this._register(new Emitter<{ readonly added: string[]; readonly removed: string[] }>());
	public get onDidChangeContentProviderSchemes() { return this._onDidChangeContentProviderSchemes.event; }

	private readonly inProgressMap: Map<string, number> = new Map();
	private readonly _sessionTypeOptions: Map<string, IChatSessionProviderOptionGroup[]> = new Map();
	private readonly _sessionTypeIcons: Map<string, ThemeIcon | { light: URI; dark: URI }> = new Map();
	private readonly _sessionTypeWelcomeTitles: Map<string, string> = new Map();
	private readonly _sessionTypeWelcomeMessages: Map<string, string> = new Map();
	private readonly _sessionTypeWelcomeTips: Map<string, string> = new Map();
	private readonly _sessionTypeInputPlaceholders: Map<string, string> = new Map();

	private readonly _sessions = new ResourceMap<ContributedChatSessionData>();
	private readonly _editableSessions = new ResourceMap<IEditableData>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMenuService private readonly _menuService: IMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService
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
					if (contribution.type === 'openai-codex' && !this._configurationService.getValue<boolean>('chat.experimental.codex.enabled')) {
						continue;
					}

					this._register(this.registerContribution(contribution, ext.description));
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

		if (chatSessionType === localChatSessionType) {
			displayName = 'Local Chat Agent';
		} else {
			displayName = this._contributions.get(chatSessionType)?.contribution.displayName;
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
			const items = await this.getChatSessionItems(chatSessionType, CancellationToken.None);
			const inProgress = items.filter(item => item.status === ChatSessionStatus.InProgress);
			this.reportInProgress(chatSessionType, inProgress.length);
		} catch (error) {
			this._logService.warn(`Failed to update in-progress status for chat session type '${chatSessionType}':`, error);
		}
	}

	private registerContribution(contribution: IChatSessionsExtensionPoint, ext: IRelaxedExtensionDescription): IDisposable {
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

		this._contributions.set(contribution.type, { contribution, extension: ext });

		// Register alternative IDs if provided
		if (contribution.alternativeIds) {
			for (const altId of contribution.alternativeIds) {
				if (this._alternativeIdMap.has(altId)) {
					this._logService.warn(`Alternative ID '${altId}' is already mapped to '${this._alternativeIdMap.get(altId)}'. Remapping to '${contribution.type}'.`);
				}
				this._alternativeIdMap.set(altId, contribution.type);
			}
		}

		// Store icon mapping if provided
		let icon: ThemeIcon | { dark: URI; light: URI } | undefined;

		if (contribution.icon) {
			// Parse icon string - support ThemeIcon format or file path from extension
			if (typeof contribution.icon === 'string') {
				icon = contribution.icon.startsWith('$(') && contribution.icon.endsWith(')')
					? ThemeIcon.fromString(contribution.icon)
					: ThemeIcon.fromId(contribution.icon);
			} else {
				icon = {
					dark: resources.joinPath(ext.extensionLocation, contribution.icon.dark),
					light: resources.joinPath(ext.extensionLocation, contribution.icon.light)
				};
			}
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
				this._contributions.delete(contribution.type);
				// Remove alternative ID mappings
				if (contribution.alternativeIds) {
					for (const altId of contribution.alternativeIds) {
						if (this._alternativeIdMap.get(altId) === contribution.type) {
							this._alternativeIdMap.delete(altId);
						}
					}
				}
				this._sessionTypeIcons.delete(contribution.type);
				this._sessionTypeWelcomeTitles.delete(contribution.type);
				this._sessionTypeWelcomeMessages.delete(contribution.type);
				this._sessionTypeWelcomeTips.delete(contribution.type);
				this._sessionTypeInputPlaceholders.delete(contribution.type);
				this._contributionDisposables.deleteAndDispose(contribution.type);
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
	 * Resolves a session type to its primary type, checking for alternative IDs.
	 * @param sessionType The session type or alternative ID to resolve
	 * @returns The primary session type, or undefined if not found or not available
	 */
	private _resolveToPrimaryType(sessionType: string): string | undefined {
		// Try to find the primary type first
		const contribution = this._contributions.get(sessionType)?.contribution;
		if (contribution) {
			// If the contribution is available, use it
			if (this._isContributionAvailable(contribution)) {
				return sessionType;
			}
			// If not available, fall through to check for alternatives
		}

		// Check if this is an alternative ID, or if the primary type is not available
		const primaryType = this._alternativeIdMap.get(sessionType);
		if (primaryType) {
			const altContribution = this._contributions.get(primaryType)?.contribution;
			if (altContribution && this._isContributionAvailable(altContribution)) {
				this._logService.info(`Resolving chat session type '${sessionType}' to alternative type '${primaryType}'`);
				return primaryType;
			}
		}

		return undefined;
	}

	private _registerMenuItems(contribution: IChatSessionsExtensionPoint, extensionDescription: IRelaxedExtensionDescription): IDisposable {
		// If provider registers anything for the create submenu, let it fully control the creation
		const contextKeyService = this._contextKeyService.createOverlay([
			['chatSessionType', contribution.type]
		]);

		const menuActions = this._menuService.getMenuActions(MenuId.ChatSessionsCreateSubMenu, contextKeyService);
		if (menuActions?.length) {
			return MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
				group: 'navigation',
				title: localize('interactiveSession.chatSessionSubMenuTitle', "Create chat session"),
				icon: Codicon.plus,
				order: 1,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', `${AGENT_SESSIONS_VIEWLET_ID}.${contribution.type}`)
				),
				submenu: MenuId.ChatSessionsCreateSubMenu,
				isSplitButton: menuActions.length > 1
			});
		} else {
			// We control creation instead
			return MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
				command: {
					id: `${NEW_CHAT_SESSION_ACTION_ID}.${contribution.type}`,
					title: localize('interactiveSession.openNewSessionEditor', "New {0}", contribution.displayName),
					icon: Codicon.plus,
					source: {
						id: extensionDescription.identifier.value,
						title: extensionDescription.displayName || extensionDescription.name,
					}
				},
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', `${AGENT_SESSIONS_VIEWLET_ID}.${contribution.type}`)
				),
			});
		}
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
					const resource = URI.from({
						scheme: type,
						path: `/untitled-${generateUuid()}`,
					});
					await editorService.openEditor({ resource, options });
				} catch (e) {
					logService.error(`Failed to open new '${type}' chat session editor`, e);
				}
			}
		});
	}

	private _evaluateAvailability(): void {
		let hasChanges = false;
		for (const { contribution, extension } of this._contributions.values()) {
			const isCurrentlyRegistered = this._contributionDisposables.has(contribution.type);
			const shouldBeRegistered = this._isContributionAvailable(contribution);
			if (isCurrentlyRegistered && !shouldBeRegistered) {
				// Disable the contribution by disposing its disposable store
				this._contributionDisposables.deleteAndDispose(contribution.type);

				// Also dispose any cached sessions for this contribution
				this._disposeSessionsForContribution(contribution.type);
				hasChanges = true;
			} else if (!isCurrentlyRegistered && shouldBeRegistered) {
				// Enable the contribution by registering it
				this._enableContribution(contribution, extension);
				hasChanges = true;
			}
		}
		if (hasChanges) {
			this._onDidChangeAvailability.fire();
			for (const provider of this._itemsProviders.values()) {
				this._onDidChangeItemsProviders.fire(provider);
			}
			for (const { contribution } of this._contributions.values()) {
				this._onDidChangeSessionItems.fire(contribution.type);
			}
		}
	}

	private _enableContribution(contribution: IChatSessionsExtensionPoint, ext: IRelaxedExtensionDescription): void {
		const disposableStore = new DisposableStore();
		this._contributionDisposables.set(contribution.type, disposableStore);

		disposableStore.add(this._registerAgent(contribution, ext));
		disposableStore.add(this._registerCommands(contribution));
		disposableStore.add(this._registerMenuItems(contribution, ext));
	}

	private _disposeSessionsForContribution(contributionId: string): void {
		// Find and dispose all sessions that belong to this contribution
		const sessionsToDispose: URI[] = [];
		for (const [sessionResource, sessionData] of this._sessions) {
			if (sessionData.chatSessionType === contributionId) {
				sessionsToDispose.push(sessionResource);
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

	private _registerAgent(contribution: IChatSessionsExtensionPoint, ext: IRelaxedExtensionDescription): IDisposable {
		const { type: id, name, displayName, description } = contribution;
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
			extensionId: ext.identifier,
			extensionVersion: ext.version,
			extensionDisplayName: ext.displayName || ext.name,
			extensionPublisherId: ext.publisher,
		};

		return this._chatAgentService.registerAgent(id, agentData);
	}

	getAllChatSessionContributions(): IChatSessionsExtensionPoint[] {
		return Array.from(this._contributions.values(), x => x.contribution)
			.filter(contribution => this._isContributionAvailable(contribution));
	}

	getAllChatSessionItemProviders(): IChatSessionItemProvider[] {
		return [...this._itemsProviders.values()].filter(provider => {
			// Check if the provider's corresponding contribution is available
			const contribution = this._contributions.get(provider.chatSessionType)?.contribution;
			return !contribution || this._isContributionAvailable(contribution);
		});
	}

	async hasChatSessionItemProvider(chatViewType: string): Promise<boolean> {
		await this._extensionService.whenInstalledExtensionsRegistered();
		const resolvedType = this._resolveToPrimaryType(chatViewType);
		if (resolvedType) {
			chatViewType = resolvedType;
		}

		const contribution = this._contributions.get(chatViewType)?.contribution;
		if (contribution && !this._isContributionAvailable(contribution)) {
			return false;
		}

		if (this._itemsProviders.has(chatViewType)) {
			return true;
		}

		await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);

		return this._itemsProviders.has(chatViewType);
	}

	async canResolveChatSession(chatSessionResource: URI) {
		await this._extensionService.whenInstalledExtensionsRegistered();
		const resolvedType = this._resolveToPrimaryType(chatSessionResource.scheme) || chatSessionResource.scheme;
		const contribution = this._contributions.get(resolvedType)?.contribution;
		if (contribution && !this._isContributionAvailable(contribution)) {
			return false;
		}

		if (this._contentProviders.has(chatSessionResource.scheme)) {
			return true;
		}

		await this._extensionService.activateByEvent(`onChatSession:${chatSessionResource.scheme}`);
		return this._contentProviders.has(chatSessionResource.scheme);
	}

	async getAllChatSessionItems(token: CancellationToken): Promise<Array<{ readonly chatSessionType: string; readonly items: IChatSessionItem[] }>> {
		return Promise.all(Array.from(this.getAllChatSessionContributions(), async contrib => {
			return {
				chatSessionType: contrib.type,
				items: await this.getChatSessionItems(contrib.type, token)
			};
		}));
	}

	private async getChatSessionItems(chatSessionType: string, token: CancellationToken): Promise<IChatSessionItem[]> {
		if (!(await this.hasChatSessionItemProvider(chatSessionType))) {
			return [];
		}

		const resolvedType = this._resolveToPrimaryType(chatSessionType);
		if (resolvedType) {
			chatSessionType = resolvedType;
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
		if (this._contentProviders.has(chatSessionType)) {
			throw new Error(`Content provider for ${chatSessionType} is already registered.`);
		}

		this._contentProviders.set(chatSessionType, provider);
		this._onDidChangeContentProviderSchemes.fire({ added: [chatSessionType], removed: [] });

		return {
			dispose: () => {
				this._contentProviders.delete(chatSessionType);

				this._onDidChangeContentProviderSchemes.fire({ added: [], removed: [chatSessionType] });

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

	/**
	 * Creates a new chat session by delegating to the appropriate provider
	 * @param chatSessionType The type of chat session provider to use
	 * @param options Options for the new session including the request
	 * @param token A cancellation token
	 * @returns A session ID for the newly created session
	 */
	public async getNewChatSessionItem(chatSessionType: string, options: {
		request: IChatAgentRequest;
		metadata?: any;
	}, token: CancellationToken): Promise<IChatSessionItem> {
		if (!(await this.hasChatSessionItemProvider(chatSessionType))) {
			throw Error(`Cannot find provider for ${chatSessionType}`);
		}

		const resolvedType = this._resolveToPrimaryType(chatSessionType);
		if (resolvedType) {
			chatSessionType = resolvedType;
		}


		const provider = this._itemsProviders.get(chatSessionType);
		if (!provider?.provideNewChatSessionItem) {
			throw Error(`Provider for ${chatSessionType} does not support creating sessions`);
		}
		const chatSessionItem = await provider.provideNewChatSessionItem(options, token);
		this._onDidChangeSessionItems.fire(chatSessionType);
		return chatSessionItem;
	}

	public async getOrCreateChatSession(sessionResource: URI, token: CancellationToken): Promise<IChatSession> {
		if (!(await this.canResolveChatSession(sessionResource))) {
			throw Error(`Can not find provider for ${sessionResource}`);
		}
		const resolvedType = this._resolveToPrimaryType(sessionResource.scheme) || sessionResource.scheme;
		const provider = this._contentProviders.get(resolvedType);
		if (!provider) {
			throw Error(`Can not find provider for ${sessionResource}`);
		}

		const existingSessionData = this._sessions.get(sessionResource);
		if (existingSessionData) {
			return existingSessionData.session;
		}

		const session = await provider.provideChatSessionContent(sessionResource, token);
		const sessionData = new ContributedChatSessionData(session, sessionResource.scheme, sessionResource, session.options, this._onWillDisposeSession.bind(this));

		this._sessions.set(sessionResource, sessionData);

		return session;
	}

	private _onWillDisposeSession(sessionResource: URI): void {
		this._sessions.delete(sessionResource);
	}

	public hasAnySessionOptions(sessionResource: URI): boolean {
		const session = this._sessions.get(sessionResource);
		return !!session && !!session.options && Object.keys(session.options).length > 0;
	}

	public getSessionOption(sessionResource: URI, optionId: string): string | undefined {
		const session = this._sessions.get(sessionResource);
		return session?.getOption(optionId);
	}

	public setSessionOption(sessionResource: URI, optionId: string, value: string): boolean {
		const session = this._sessions.get(sessionResource);
		return !!session?.setOption(optionId, value);
	}

	// Implementation of editable session methods
	public async setEditableSession(sessionResource: URI, data: IEditableData | null): Promise<void> {
		if (!data) {
			this._editableSessions.delete(sessionResource);
		} else {
			this._editableSessions.set(sessionResource, data);
		}
		// Trigger refresh of the session views that might need to update their rendering
		this._onDidChangeSessionItems.fire(localChatSessionType);
	}

	public getEditableData(sessionResource: URI): IEditableData | undefined {
		return this._editableSessions.get(sessionResource);
	}

	public isEditable(sessionResource: URI): boolean {
		return this._editableSessions.has(sessionResource);
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

	private _optionsChangeCallback?: SessionOptionsChangedCallback;

	/**
	 * Set the callback for notifying extensions about option changes
	 */
	public setOptionsChangeCallback(callback: SessionOptionsChangedCallback): void {
		this._optionsChangeCallback = callback;
	}

	/**
	 * Notify extension about option changes for a session
	 */
	public async notifySessionOptionsChange(sessionResource: URI, updates: ReadonlyArray<{ optionId: string; value: string }>): Promise<void> {
		if (!updates.length) {
			return;
		}
		if (this._optionsChangeCallback) {
			await this._optionsChangeCallback(sessionResource, updates);
		}
		for (const u of updates) {
			this.setSessionOption(sessionResource, u.optionId, u.value);
		}
	}

	/**
	 * Get the icon for a specific session type
	 */
	public getIconForSessionType(chatSessionType: string): ThemeIcon | URI | undefined {
		const sessionTypeIcon = this._sessionTypeIcons.get(chatSessionType);

		if (ThemeIcon.isThemeIcon(sessionTypeIcon)) {
			return sessionTypeIcon;
		}

		if (isDark(this._themeService.getColorTheme().type)) {
			return sessionTypeIcon?.dark;
		} else {
			return sessionTypeIcon?.light;
		}
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
		const contribution = this._contributions.get(chatSessionType)?.contribution;
		return contribution?.capabilities;
	}

	/**
	 * Get the welcome tips for a specific session type
	 */
	public getWelcomeTipsForSessionType(chatSessionType: string): string | undefined {
		return this._sessionTypeWelcomeTips.get(chatSessionType);
	}

	public getContentProviderSchemes(): string[] {
		return Array.from(this._contentProviders.keys());
	}
}

registerSingleton(IChatSessionsService, ChatSessionsService, InstantiationType.Delayed);
