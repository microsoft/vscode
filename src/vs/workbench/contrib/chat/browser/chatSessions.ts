/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { $, append, getActiveWindow } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeNode, ITreeRenderer, ITreeContextMenuEvent } from '../../../../base/browser/ui/tree/tree.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { isMarkdownString } from '../../../../base/common/htmlContent.js';
import * as nls from '../../../../nls.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { GroupModelChangeKind } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { Extensions, IEditableData, IViewContainersRegistry, IViewDescriptor, IViewDescriptorService, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IChatSessionItem, IChatSessionItemProvider, IChatSessionsExtensionPoint, IChatSessionsService, ChatSessionStatus } from '../common/chatSessionsService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../common/constants.js';
import { IChatWidget, IChatWidgetService, ChatViewId } from './chat.js';
import { ChatViewPane } from './chatViewPane.js';
import { ChatEditorInput } from './chatEditorInput.js';
import { IChatService } from '../common/chatService.js';
import { ChatSessionUri } from '../common/chatUri.js';
import './media/chatSessions.css';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import Severity from '../../../../base/common/severity.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { timeout } from '../../../../base/common/async.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';

export const VIEWLET_ID = 'workbench.view.chat.sessions';

type ChatSessionItemWithProvider = IChatSessionItem & {
	readonly provider: IChatSessionItemProvider;
};

// Helper function to create context overlay for session items
function getSessionItemContextOverlay(session: IChatSessionItem, provider?: IChatSessionItemProvider): [string, any][] {
	const overlay: [string, any][] = [];
	if (provider) {
		overlay.push([ChatContextKeys.sessionType.key, provider.chatSessionType]);
	}

	return overlay;
}

// Extended interface for local chat session items that includes editor information or widget information
interface ILocalChatSessionItem extends IChatSessionItem {
	editor?: EditorInput;
	group?: IEditorGroup;
	widget?: IChatWidget;
	sessionType: 'editor' | 'widget';
	description?: string;
	status?: ChatSessionStatus;
}


export class ChatSessionsView extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatSessions';

	private isViewContainerRegistered = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		// Initial check
		this.updateViewContainerRegistration();

		// Listen for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentSessionsViewLocation)) {
				this.updateViewContainerRegistration();
			}
		}));
	}

	private updateViewContainerRegistration(): void {
		const location = this.configurationService.getValue<string>(ChatConfiguration.AgentSessionsViewLocation);

		if (location === 'view' && !this.isViewContainerRegistered) {
			this.registerViewContainer();
		} else if (location !== 'view' && this.isViewContainerRegistered) {
			// Note: VS Code doesn't support unregistering view containers
			// Once registered, they remain registered for the session
			// but you could hide them or make them conditional through 'when' clauses
		}
	}

	private registerViewContainer(): void {
		if (this.isViewContainerRegistered) {
			return;
		}

		Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer(
			{
				id: VIEWLET_ID,
				title: nls.localize2('chat.sessions', "Chat Sessions"),
				ctorDescriptor: new SyncDescriptor(ChatSessionsViewPaneContainer),
				hideIfEmpty: false,
				icon: registerIcon('chat-sessions-icon', Codicon.commentDiscussion, 'Icon for Chat Sessions View'),
				order: 10
			}, ViewContainerLocation.Sidebar);
	}
}

// Local Chat Sessions Provider - tracks open editors as chat sessions
class LocalChatSessionsProvider extends Disposable implements IChatSessionItemProvider {
	static readonly CHAT_WIDGET_VIEW_ID = 'workbench.panel.chat.view.copilot';
	readonly chatSessionType = 'local';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	readonly onDidChangeChatSessionItems = Event.None;

	// Track the current editor set to detect actual new additions
	private currentEditorSet = new Set<string>();

	// Maintain ordered list of editor keys to preserve consistent ordering
	private editorOrder: string[] = [];

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		this.initializeCurrentEditorSet();
		this.registerEditorListeners();
		this.registerWidgetListeners();
	}

	private registerWidgetListeners(): void {
		// Listen for new chat widgets being added/removed
		this._register(this.chatWidgetService.onDidAddWidget(widget => {
			// Only fire for chat view instance
			if (widget.location === ChatAgentLocation.Panel &&
				typeof widget.viewContext === 'object' &&
				'viewId' in widget.viewContext &&
				widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID) {
				this._onDidChange.fire();

				// Listen for view model changes on this widget
				this._register(widget.onDidChangeViewModel(() => {
					this._onDidChange.fire();
				}));

				// Listen for title changes on the current model
				this.registerModelTitleListener(widget);
			}
		}));

		// Check for existing chat widgets and register listeners
		const existingWidgets = this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Panel)
			.filter(widget => typeof widget.viewContext === 'object' && 'viewId' in widget.viewContext && widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID);

		existingWidgets.forEach(widget => {
			this._register(widget.onDidChangeViewModel(() => {
				this._onDidChange.fire();
				this.registerModelTitleListener(widget);
			}));

			// Register title listener for existing widget
			this.registerModelTitleListener(widget);
		});
	}

	private registerModelTitleListener(widget: IChatWidget): void {
		const model = widget.viewModel?.model;
		if (model) {
			// Listen for model changes, specifically for title changes via setCustomTitle
			this._register(model.onDidChange((e) => {
				// Fire change events for all title-related changes to refresh the tree
				if (!e || e.kind === 'setCustomTitle') {
					this._onDidChange.fire();
				}
			}));
		}
	}

	private initializeCurrentEditorSet(): void {
		this.currentEditorSet.clear();
		this.editorOrder = []; // Reset the order

		this.editorGroupService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (this.isLocalChatSession(editor)) {
					const key = this.getEditorKey(editor, group);
					this.currentEditorSet.add(key);
					this.editorOrder.push(key);
				}
			});
		});
	}

	private getEditorKey(editor: EditorInput, group: IEditorGroup): string {
		return `${group.id}-${editor.typeId}-${editor.resource?.toString() || editor.getName()}`;
	}

	private registerEditorListeners(): void {
		// Listen to all groups for editor changes
		this.editorGroupService.groups.forEach(group => this.registerGroupListeners(group));

		// Listen for new groups
		this._register(this.editorGroupService.onDidAddGroup(group => {
			this.registerGroupListeners(group);
			this.initializeCurrentEditorSet(); // Refresh our tracking
			this._onDidChange.fire();
		}));

		this._register(this.editorGroupService.onDidRemoveGroup(() => {
			this.initializeCurrentEditorSet(); // Refresh our tracking
			this._onDidChange.fire();
		}));
	}

	private isLocalChatSession(editor?: EditorInput): boolean {
		if (!(editor instanceof ChatEditorInput)) {
			return false; // Only track ChatEditorInput instances
		}
		return editor.resource?.scheme === 'vscode-chat-editor';
	}

	private registerGroupListeners(group: IEditorGroup): void {
		this._register(group.onDidModelChange(e => {
			if (!this.isLocalChatSession(e.editor)) {
				return;
			}
			switch (e.kind) {
				case GroupModelChangeKind.EDITOR_OPEN:
					// Only fire change if this is a truly new editor
					if (e.editor) {
						const editorKey = this.getEditorKey(e.editor, group);
						if (!this.currentEditorSet.has(editorKey)) {
							this.currentEditorSet.add(editorKey);
							this.editorOrder.push(editorKey); // Append to end
							this._onDidChange.fire();
						}
					}
					break;
				case GroupModelChangeKind.EDITOR_CLOSE:
					// Remove from our tracking set and fire change
					if (e.editor) {
						const editorKey = this.getEditorKey(e.editor, group);
						this.currentEditorSet.delete(editorKey);
						const index = this.editorOrder.indexOf(editorKey);
						if (index > -1) {
							this.editorOrder.splice(index, 1);
						}
					}
					this._onDidChange.fire();
					break;
				case GroupModelChangeKind.EDITOR_MOVE:
					// Just refresh the set without resetting the order
					this.currentEditorSet.clear();
					this.editorGroupService.groups.forEach(group => {
						group.editors.forEach(editor => {
							const key = this.getEditorKey(editor, group);
							this.currentEditorSet.add(key);
						});
					});
					this._onDidChange.fire();
					break;
				case GroupModelChangeKind.EDITOR_ACTIVE:
					// Editor became active - no need to change our list
					// This happens when clicking on tabs or opening editors
					break;
				case GroupModelChangeKind.EDITOR_LABEL:
					this._onDidChange.fire();
					break;
			}
		}));
	}

	async provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]> {
		const sessions: IChatSessionItem[] = [];
		console.log('[LocalChatSessionsProvider] Providing chat session items...');

		// Create a map to quickly find editors by their key
		const editorMap = new Map<string, { editor: EditorInput; group: IEditorGroup }>();

		this.editorGroupService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (editor instanceof ChatEditorInput) {
					const key = this.getEditorKey(editor, group);
					editorMap.set(key, { editor, group });
				}
			});
		});

		// Add chat view instance
		const chatWidget = this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Panel)
			.find(widget => typeof widget.viewContext === 'object' && 'viewId' in widget.viewContext && widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID);
		console.log('[LocalChatSessionsProvider] Found chat widget:', !!chatWidget);
		if (chatWidget) {
			const widgetSession: ILocalChatSessionItem = {
				id: LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID,
				label: chatWidget.viewModel?.model.title || nls.localize2('chat.sessions.chatView', "Chat").value,
				description: nls.localize('chat.sessions.chatView.description', "Chat View"),
				iconPath: Codicon.chatSparkle,
				widget: chatWidget,
				sessionType: 'widget'
			};
			sessions.push(widgetSession);
		}

		// Build editor-based sessions in the order specified by editorOrder
		console.log('[LocalChatSessionsProvider] Editor order length:', this.editorOrder.length);

		// Add a hardcoded test item to verify tree rendering works
		sessions.push({
			id: 'test-hardcoded-session',
			label: 'Test Hardcoded Session',
			iconPath: Codicon.commentDiscussion,
		});

		this.editorOrder.forEach((editorKey, index) => {
			const editorInfo = editorMap.get(editorKey);
			if (editorInfo) {
				const sessionId = `local-${editorInfo.group.id}-${index}`;
				const editorSession: ILocalChatSessionItem = {
					id: sessionId,
					label: editorInfo.editor.getName(),
					iconPath: Codicon.commentDiscussion,
					editor: editorInfo.editor,
					group: editorInfo.group,
					sessionType: 'editor'
				};
				sessions.push(editorSession);
			}
		});

		console.log('[LocalChatSessionsProvider] Total sessions found:', sessions.length);

		// Add "Show history..." node at the end
		const historyNode: IChatSessionItem = {
			id: 'show-history',
			label: nls.localize('chat.sessions.showHistory', "Show history..."),
			iconPath: Codicon.history
		};
		sessions.push(historyNode);

		return sessions;
	}
}

// Chat sessions container
class ChatSessionsViewPaneContainer extends ViewPaneContainer {
	private localProvider: LocalChatSessionsProvider | undefined;
	private registeredViewDescriptors: Map<string, IViewDescriptor> = new Map();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionService extensionService: IExtensionService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService logService: ILogService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super(
			VIEWLET_ID,
			{
				mergeViewWithContainerWhenSingleView: false,
			},
			instantiationService,
			configurationService,
			layoutService,
			contextMenuService,
			telemetryService,
			extensionService,
			themeService,
			storageService,
			contextService,
			viewDescriptorService,
			logService
		);

		// Create and register the local chat sessions provider
		this.localProvider = this._register(this.instantiationService.createInstance(LocalChatSessionsProvider));
		this._register(this.chatSessionsService.registerChatSessionItemProvider(this.localProvider));

		// Note: Chat history is now integrated into the local provider as a hierarchical child
		// No separate history provider needed

		this.updateViewRegistration();

		// Listen for provider changes and register/unregister views accordingly
		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => {
			this.updateViewRegistration();
		}));

		// Listen for session items changes and refresh the appropriate provider tree
		this._register(this.chatSessionsService.onDidChangeSessionItems((chatSessionType) => {
			this.refreshProviderTree(chatSessionType);
		}));

		// Listen for contribution availability changes and update view registration
		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			this.updateViewRegistration();
		}));
	}

	override getTitle(): string {
		const title = nls.localize('chat.sessions.title', "Chat Sessions");
		return title;
	}

	private getAllChatSessionItemProviders(): IChatSessionItemProvider[] {
		return coalesce([
			this.localProvider,
			...this.chatSessionsService.getAllChatSessionItemProviders()
		]);
	}

	private refreshProviderTree(chatSessionType: string): void {
		// Find the provider with the matching chatSessionType
		const providers = this.getAllChatSessionItemProviders();
		const targetProvider = providers.find(provider => provider.chatSessionType === chatSessionType);

		if (targetProvider) {
			// Find the corresponding view and refresh its tree
			const viewId = `${VIEWLET_ID}.${chatSessionType}`;
			const view = this.getView(viewId) as SessionsViewPane | undefined;
			if (view) {
				view.refreshTree();
			}
		}
	}

	private async updateViewRegistration(): Promise<void> {
		// prepare all chat session providers
		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		await Promise.all(contributions.map(contrib => this.chatSessionsService.canResolveItemProvider(contrib.type)));
		const currentProviders = this.getAllChatSessionItemProviders();
		const currentProviderIds = new Set(currentProviders.map(p => p.chatSessionType));

		// Find views that need to be unregistered (providers that are no longer available)
		const viewsToUnregister: IViewDescriptor[] = [];
		for (const [providerId, viewDescriptor] of this.registeredViewDescriptors.entries()) {
			if (!currentProviderIds.has(providerId)) {
				viewsToUnregister.push(viewDescriptor);
				this.registeredViewDescriptors.delete(providerId);
			}
		}

		// Unregister removed views
		if (viewsToUnregister.length > 0) {
			const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
			if (container) {
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).deregisterViews(viewsToUnregister, container);
			}
		}

		// Register new views
		this.registerViews(contributions);
	}

	private async registerViews(extensionPointContributions: IChatSessionsExtensionPoint[]) {
		const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
		const providers = this.getAllChatSessionItemProviders();

		if (container && providers.length > 0) {
			const viewDescriptorsToRegister: IViewDescriptor[] = [];
			let index = 1;

			providers.forEach(provider => {
				// Only register if not already registered
				if (!this.registeredViewDescriptors.has(provider.chatSessionType)) {
					let displayName = '';
					if (provider.chatSessionType === 'local') {
						displayName = 'Local Chat Sessions';
					} else if (provider.chatSessionType === 'history') {
						displayName = 'Chat History';
					} else {
						const extContribution = extensionPointContributions.find(c => c.type === provider.chatSessionType);
						if (!extContribution) {
							this.logService.warn(`No extension contribution found for chat session type: ${provider.chatSessionType}`);
							return; // Skip if no contribution found
						}
						displayName = extContribution.displayName;
					}
					const viewDescriptor: IViewDescriptor = {
						id: `${VIEWLET_ID}.${provider.chatSessionType}`,
						name: {
							value: displayName,
							original: displayName,
						},
						ctorDescriptor: new SyncDescriptor(SessionsViewPane, [provider]),
						canToggleVisibility: true,
						canMoveView: true,
						order: provider.chatSessionType === 'local' ? 0 : provider.chatSessionType === 'history' ? 1 : index++,
					};

					viewDescriptorsToRegister.push(viewDescriptor);
					this.registeredViewDescriptors.set(provider.chatSessionType, viewDescriptor);

					if (provider.chatSessionType === 'local') {
						const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
						this._register(viewsRegistry.registerViewWelcomeContent(viewDescriptor.id, {
							content: nls.localize('chatSessions.noResults', "No local chat sessions\n[Start a Chat](command:workbench.action.openChat)"),
						}));
					}
				}
			});

			if (viewDescriptorsToRegister.length > 0) {
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews(viewDescriptorsToRegister, container);
			}
		}
	}

	override dispose(): void {
		// Unregister all views before disposal
		if (this.registeredViewDescriptors.size > 0) {
			const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
			if (container) {
				const allRegisteredViews = Array.from(this.registeredViewDescriptors.values());
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).deregisterViews(allRegisteredViews, container);
			}
			this.registeredViewDescriptors.clear();
		}

		super.dispose();
	}
}


// Chat sessions item data source for the tree
class SessionsDataSource implements IAsyncDataSource<IChatSessionItemProvider, ChatSessionItemWithProvider> {
	constructor(
		private readonly provider: IChatSessionItemProvider,
		private readonly chatService: IChatService,
		private readonly editorGroupService: IEditorGroupsService,
		private readonly chatWidgetService: IChatWidgetService
	) { }

	hasChildren(element: IChatSessionItemProvider | ChatSessionItemWithProvider): boolean {
		const isProvider = element === this.provider;
		console.log('[SessionsDataSource] hasChildren called for:', isProvider ? 'ROOT PROVIDER' : element, 'result:', isProvider);

		if (isProvider) {
			// Root provider always has children
			return true;
		}

		// Check if this is the "Show history..." node
		if ('id' in element && element.id === 'show-history') {
			console.log('[SessionsDataSource] Show history node - has children');
			return true;
		}

		// Individual session items don't have children
		return false;
	}

	async getChildren(element: IChatSessionItemProvider | ChatSessionItemWithProvider): Promise<ChatSessionItemWithProvider[]> {
		console.log('[SessionsDataSource] getChildren called for:', element === this.provider ? 'ROOT PROVIDER' : element);

		if (element === this.provider) {
			try {
				const items = await this.provider.provideChatSessionItems(CancellationToken.None);
				const result = items.map(item => ({ ...item, provider: this.provider }));
				console.log('[SessionsDataSource] Provider returned items:', result.length, result);
				return result;
			} catch (error) {
				console.error('[SessionsDataSource] Error getting items:', error);
				return [];
			}
		}

		// Check if this is the "Show history..." node
		if ('id' in element && element.id === 'show-history') {
			console.log('[SessionsDataSource] Getting history items...');
			// Get history items using integrated history logic
			return this.getHistoryItems();
		}

		// Individual session items don't have children
		console.log('[SessionsDataSource] Individual item - no children');
		return [];
	}

	private async getHistoryItems(): Promise<ChatSessionItemWithProvider[]> {
		try {
			console.log('[SessionsDataSource] Loading chat history...');

			// Get all chat history
			const allHistory = await this.chatService.getHistory();
			const activeSessionIds = this.getActiveSessionIds();

			// Filter to only include non-active sessions and sort by date
			const historyItems = allHistory
				.filter((detail: any) => !activeSessionIds.has(detail.sessionId))
				.sort((a: any, b: any) => (b.lastMessageDate ?? 0) - (a.lastMessageDate ?? 0));

			console.log('[SessionsDataSource] History items found:', historyItems.length);

			// Create history items with provider reference
			const result = historyItems.map((historyDetail: any): ChatSessionItemWithProvider => ({
				id: `history-${historyDetail.sessionId}`,
				label: historyDetail.title,
				iconPath: Codicon.history,
				provider: this.provider
			}));

			return result;
		} catch (error) {
			console.error('[SessionsDataSource] Error loading chat history:', error);
			return [];
		}
	}

	private getActiveSessionIds(): Set<string> {
		const activeSessionIds = new Set<string>();

		// Collect session IDs from current chat widget
		const chatWidget = this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Panel)
			.find(widget => typeof widget.viewContext === 'object' && 'viewId' in widget.viewContext && widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID);

		if (chatWidget?.viewModel?.model.sessionId) {
			activeSessionIds.add(chatWidget.viewModel.model.sessionId);
		}

		// Collect session IDs from current editors
		this.editorGroupService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (editor instanceof ChatEditorInput && editor.sessionId) {
					activeSessionIds.add(editor.sessionId);
				}
			});
		});

		return activeSessionIds;
	}
}

// Tree delegate for session items
class SessionsDelegate implements IListVirtualDelegate<ChatSessionItemWithProvider> {
	static readonly ITEM_HEIGHT = 22;
	static readonly ITEM_HEIGHT_WITH_DESCRIPTION = 38; // Slightly smaller for cleaner look

	getHeight(element: ChatSessionItemWithProvider): number {
		// Return consistent height for all items (single-line layout)
		return SessionsDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: ChatSessionItemWithProvider): string {
		return SessionsRenderer.TEMPLATE_ID;
	}
}

// Template data for session items
interface ISessionTemplateData {
	container: HTMLElement;
	resourceLabel: IResourceLabel;
	actionBar: ActionBar;
	elementDisposable: DisposableStore;
}

// Renderer for session items in the tree
class SessionsRenderer extends Disposable implements ITreeRenderer<IChatSessionItem, FuzzyScore, ISessionTemplateData> {
	static readonly TEMPLATE_ID = 'session';
	private appliedIconColorStyles = new Set<string>();

	constructor(
		private readonly labels: ResourceLabels,
		@IThemeService private readonly themeService: IThemeService,
		@ILogService private readonly logService: ILogService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		// Listen for theme changes to clear applied styles
		this._register(this.themeService.onDidColorThemeChange(() => {
			this.appliedIconColorStyles.clear();
		}));
	}

	private applyIconColorStyle(iconId: string, colorId: string): void {
		const styleKey = `${iconId}-${colorId}`;
		if (this.appliedIconColorStyles.has(styleKey)) {
			return; // Already applied
		}

		const colorTheme = this.themeService.getColorTheme();
		const color = colorTheme.getColor(colorId);

		if (color) {
			// Target the ::before pseudo-element where the actual icon is rendered
			const css = `.monaco-workbench .chat-session-item .monaco-icon-label.codicon-${iconId}::before { color: ${color} !important; }`;
			const activeWindow = getActiveWindow();

			const styleId = `chat-sessions-icon-${styleKey}`;
			const existingStyle = activeWindow.document.getElementById(styleId);
			if (existingStyle) {
				existingStyle.textContent = css;
			} else {
				const styleElement = activeWindow.document.createElement('style');
				styleElement.id = styleId;
				styleElement.textContent = css;
				activeWindow.document.head.appendChild(styleElement);

				// Clean up on dispose
				this._register({
					dispose: () => {
						const activeWin = getActiveWindow();
						const style = activeWin.document.getElementById(styleId);
						if (style) {
							style.remove();
						}
					}
				});
			}

			this.appliedIconColorStyles.add(styleKey);
		} else {
			this.logService.debug('No color found for colorId:', colorId);
		}
	}

	private isLocalChatSessionItem(item: IChatSessionItem): item is ILocalChatSessionItem {
		return ('editor' in item && 'group' in item) || ('widget' in item && 'sessionType' in item);
	}

	get templateId(): string {
		return SessionsRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ISessionTemplateData {
		console.log('[SessionsRenderer] renderTemplate called');

		const element = append(container, $('.chat-session-item'));

		// Create a container that holds both the label and actions
		const contentContainer = append(element, $('.session-content'));
		const resourceLabel = this.labels.create(contentContainer, { supportHighlights: true });
		const actionsContainer = append(contentContainer, $('.actions'));
		const actionBar = new ActionBar(actionsContainer);
		const elementDisposable = new DisposableStore();

		return {
			container: element,
			resourceLabel,
			actionBar,
			elementDisposable
		};
	}

	renderElement(element: ITreeNode<IChatSessionItem, FuzzyScore>, index: number, templateData: ISessionTemplateData): void {
		console.log('[SessionsRenderer] renderElement called for:', element.element.label, element.element);

		const session = element.element;
		const sessionWithProvider = session as ChatSessionItemWithProvider;

		// Clear previous element disposables
		templateData.elementDisposable.clear();

		// Add CSS class for local sessions
		if (sessionWithProvider.provider.chatSessionType === 'local') {
			templateData.container.classList.add('local-session');
		} else {
			templateData.container.classList.remove('local-session');
		}

		// Add CSS classes for history items
		if ('type' in session && session.type === 'history-item') {
			templateData.container.setAttribute('data-history-item', 'true');
		} else {
			templateData.container.removeAttribute('data-history-item');
		}

		// Clear any previous element disposables
		if (templateData.elementDisposable) {
			templateData.elementDisposable.dispose();
		}

		// Get the actual session ID for editable data lookup
		let actualSessionId: string | undefined;
		if (this.isLocalChatSessionItem(session)) {
			if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
				actualSessionId = session.editor.sessionId;
			} else if (session.sessionType === 'widget' && session.widget) {
				actualSessionId = session.widget.viewModel?.model.sessionId;
			}
		}

		// Check if this session is being edited using the actual session ID
		const editableData = actualSessionId ? this.chatSessionsService.getEditableData(actualSessionId) : undefined;
		if (editableData) {
			// Render input box for editing
			templateData.actionBar.clear();
			const editDisposable = this.renderInputBox(templateData.container, session, editableData);
			templateData.elementDisposable = editDisposable;
			return;
		}

		// Normal rendering - clear the action bar in case it was used for editing
		templateData.actionBar.clear();

		// Handle different icon types
		let iconResource: URI | undefined;
		let iconTheme: ThemeIcon | undefined;
		let iconUri: URI | undefined;

		if (session.iconPath) {
			if (session.iconPath instanceof URI) {
				// Check if it's a data URI - if so, use it as icon option instead of resource
				if (session.iconPath.scheme === 'data') {
					iconUri = session.iconPath;
				} else {
					iconResource = session.iconPath;
				}
			} else if (ThemeIcon.isThemeIcon(session.iconPath)) {
				iconTheme = session.iconPath;
			} else {
				// Handle {light, dark} structure
				iconResource = session.iconPath.light;
			}
		}
		// Apply color styling if specified
		if (iconTheme?.color?.id) {
			this.applyIconColorStyle(iconTheme.id, iconTheme.color.id);
		}

		// Set the resource label
		templateData.resourceLabel.setResource({
			name: session.label,
			description: 'description' in session && typeof session.description === 'string' ? session.description : '',
			resource: iconResource
		}, {
			fileKind: undefined,
			icon: iconTheme || iconUri,
			title: 'tooltip' in session && session.tooltip ?
				(typeof session.tooltip === 'string' ? session.tooltip :
					isMarkdownString(session.tooltip) ? {
						markdown: session.tooltip,
						markdownNotSupportedFallback: session.tooltip.value
					} : undefined) :
				undefined
		});

		// Create context overlay for this specific session item
		const contextOverlay = getSessionItemContextOverlay(session, sessionWithProvider.provider);

		const contextKeyService = this.contextKeyService.createOverlay(contextOverlay);

		// Create menu for this session item
		const menu = templateData.elementDisposable.add(
			this.menuService.createMenu(MenuId.ChatSessionsMenu, contextKeyService)
		);

		// Setup action bar with contributed actions
		const setupActionBar = () => {
			templateData.actionBar.clear();

			// Create marshalled context for command execution
			const marshalledSession = {
				session: session,
				$mid: MarshalledId.ChatSessionContext
			};

			const actions = menu.getActions({ arg: marshalledSession, shouldForwardArgs: true });

			const { primary } = getActionBarActions(
				actions,
				'inline',
			);

			templateData.actionBar.push(primary, { icon: true, label: false });

			// Set context for the action bar
			templateData.actionBar.context = session;
		};

		// Setup initial action bar and listen for menu changes
		templateData.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
		setupActionBar();
	}

	disposeElement(_element: ITreeNode<IChatSessionItem, FuzzyScore>, _index: number, templateData: ISessionTemplateData): void {
		templateData.elementDisposable.clear();
	}

	private renderInputBox(container: HTMLElement, session: IChatSessionItem, editableData: IEditableData): DisposableStore {
		// Find the resource label element and hide it
		const resourceLabelElement = container.querySelector('.monaco-icon-label') as HTMLElement;
		if (resourceLabelElement) {
			resourceLabelElement.style.display = 'none';
		}

		// Create a container div for the input box that matches the resource label layout
		const inputContainer = DOM.append(container, DOM.$('.session-input-container'));

		// Create icon element matching the original session icon
		let iconElement: HTMLElement | undefined;
		if (session.iconPath) {
			iconElement = DOM.append(inputContainer, DOM.$('.session-input-icon.codicon'));
			if (ThemeIcon.isThemeIcon(session.iconPath)) {
				iconElement.classList.add(`codicon-${session.iconPath.id}`);
			}
		}

		// Create the input box
		const inputBox = new InputBox(inputContainer, this.contextViewService, {
			validationOptions: {
				validation: (value) => {
					const message = editableData.validationMessage(value);
					if (!message || message.severity !== Severity.Error) {
						return null;
					}
					return {
						content: message.content,
						formatContent: true,
						type: MessageType.ERROR
					};
				}
			},
			ariaLabel: nls.localize('chatSessionInputAriaLabel', "Type session name. Press Enter to confirm or Escape to cancel."),
			inputBoxStyles: defaultInputBoxStyles,
		});

		inputBox.value = session.label;
		inputBox.focus();
		inputBox.select({ start: 0, end: session.label.length });

		const done = createSingleCallFunction((success: boolean, finishEditing: boolean) => {
			const value = inputBox.value;

			// Clean up our input container
			if (inputContainer && inputContainer.parentNode) {
				inputContainer.parentNode.removeChild(inputContainer);
			}

			// Restore the original resource label
			if (resourceLabelElement) {
				resourceLabelElement.style.display = '';
			}

			if (finishEditing) {
				editableData.onFinish(value, success);
			}
		});

		const showInputBoxNotification = () => {
			if (inputBox.isInputValid()) {
				const message = editableData.validationMessage(inputBox.value);
				if (message) {
					inputBox.showMessage({
						content: message.content,
						formatContent: true,
						type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
					});
				} else {
					inputBox.hideMessage();
				}
			}
		};
		showInputBoxNotification();

		const disposables: IDisposable[] = [
			inputBox,
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: StandardKeyboardEvent) => {
				if (e.equals(KeyCode.Enter)) {
					if (!inputBox.validate()) {
						done(true, true);
					}
				} else if (e.equals(KeyCode.Escape)) {
					done(false, true);
				}
			}),
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, () => {
				showInputBoxNotification();
			}),
			DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, async () => {
				while (true) {
					await timeout(0);

					const ownerDocument = inputBox.inputElement.ownerDocument;
					if (!ownerDocument.hasFocus()) {
						break;
					}
					if (DOM.isActiveElement(inputBox.inputElement)) {
						return;
					} else if (DOM.isHTMLElement(ownerDocument.activeElement) && DOM.hasParentWithClass(ownerDocument.activeElement, 'context-view')) {
						await Event.toPromise(this.contextMenuService.onDidHideContextMenu);
					} else {
						break;
					}
				}

				done(inputBox.isInputValid(), true);
			})
		];

		const disposableStore = new DisposableStore();
		disposables.forEach(d => disposableStore.add(d));
		return disposableStore;
	}

	disposeTemplate(templateData: ISessionTemplateData): void {
		templateData.elementDisposable.dispose();
		templateData.resourceLabel.dispose();
		templateData.actionBar.dispose();
	}
}

// Identity provider for session items
class SessionsIdentityProvider {
	getId(element: ChatSessionItemWithProvider): string {
		return element.id;
	}
}

// Accessibility provider for session items
class SessionsAccessibilityProvider {
	getWidgetAriaLabel(): string {
		return nls.localize('chatSessions', 'Chat Sessions');
	}

	getAriaLabel(element: ChatSessionItemWithProvider): string | null {
		return element.label || element.id;
	}
}

class SessionsViewPane extends ViewPane {
	private tree: WorkbenchAsyncDataTree<IChatSessionItemProvider, ChatSessionItemWithProvider, FuzzyScore> | undefined;
	private treeContainer: HTMLElement | undefined;

	constructor(
		private readonly provider: IChatSessionItemProvider,
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IViewsService private readonly viewsService: IViewsService,
		@ILogService private readonly logService: ILogService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		console.log('[SessionsViewPane] renderBody called, container:', container);
		super.renderBody(container);

		this.treeContainer = DOM.append(container, DOM.$('.chat-sessions-tree-container'));
		console.log('[SessionsViewPane] Tree container created:', this.treeContainer);

		// Create the tree components
		const dataSource = new SessionsDataSource(this.provider, this.chatService, this.editorGroupsService, this.chatWidgetService);
		const delegate = new SessionsDelegate();
		const identityProvider = new SessionsIdentityProvider();
		const accessibilityProvider = new SessionsAccessibilityProvider();

		// Use the existing ResourceLabels service for consistent styling
		const labels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		const renderer = this.instantiationService.createInstance(SessionsRenderer, labels);

		this.tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'ChatSessions',
			this.treeContainer,
			delegate,
			[renderer],
			dataSource,
			{
				accessibilityProvider,
				identityProvider,
				multipleSelectionSupport: false,
				expandOnlyOnTwistieClick: true,
				overrideStyles: {
					listBackground: undefined
				}
			}
		) as WorkbenchAsyncDataTree<IChatSessionItemProvider, ChatSessionItemWithProvider, FuzzyScore>;

		console.log('[SessionsViewPane] Tree created:', this.tree);
		console.log('[SessionsViewPane] Renderer passed to tree:', renderer);

		// Set the input
		console.log('[SessionsViewPane] Setting tree input to provider:', this.provider.chatSessionType);
		this.tree.setInput(this.provider);

		// Try to ensure the tree has a proper size for rendering
		console.log('[SessionsViewPane] Tree container dimensions:', {
			width: this.treeContainer.clientWidth,
			height: this.treeContainer.clientHeight,
			offsetWidth: this.treeContainer.offsetWidth,
			offsetHeight: this.treeContainer.offsetHeight
		});

		// Force layout on the tree
		console.log('[SessionsViewPane] Calling tree.layout()');
		this.tree.layout(300, 400); // Give it a reasonable size

		// Register tree events
		this._register(this.tree.onDidOpen((e) => {
			if (e.element) {
				this.openChatSession(e.element);
			}
		}));

		// Register context menu event for right-click actions
		this._register(this.tree.onContextMenu((e) => {
			if (e.element) {
				this.showContextMenu(e);
			}
		}));

		this._register(this.tree);
	}

	refreshTree(): void {
		console.log('[SessionsViewPane] refreshTree called for provider:', this.provider);
		if (this.tree) {
			console.log('[SessionsViewPane] Updating tree children');
			this.tree.updateChildren(this.provider);
		} else {
			console.log('[SessionsViewPane] Tree is null, cannot refresh');
		}
	}

	private async openChatSession(element: ChatSessionItemWithProvider) {
		if (!element || !element.id) {
			return;
		}

		try {
			this.logService.info('[SessionsViewPane] Opening chat session:', element.id, element);

			if (element.id === 'show-history') {
				// Don't try to open the "Show history..." node itself
				return;
			}

			// Handle history items first
			if (element.id.startsWith('history-')) {
				const sessionId = element.id.substring('history-'.length);
				this.logService.info('[SessionsViewPane] Opening history session:', sessionId);

				// Load the historical session in the chat panel
				const chatViewPane = await this.viewsService.openView(ChatViewId) as ChatViewPane;
				if (chatViewPane) {
					await chatViewPane.loadSession(sessionId);
				}
				return;
			}

			// Handle local session items (active editors/widgets)
			if (this.isLocalChatSessionItem(element)) {
				if (element.sessionType === 'editor' && element.editor && element.group) {
					// Focus the existing editor
					this.logService.info('[SessionsViewPane] Focusing existing editor');
					await element.group.openEditor(element.editor, { pinned: true });
					return;
				} else if (element.sessionType === 'widget' && element.widget) {
					// Focus the chat widget
					this.logService.info('[SessionsViewPane] Focusing chat widget');
					const chatViewPane = await this.viewsService.openView(ChatViewId) as ChatViewPane;
					if (chatViewPane && element.widget.viewModel?.model) {
						await chatViewPane.loadSession(element.widget.viewModel.model.sessionId);
					}
					return;
				}
			}

			// For other session types, open as a new chat editor
			const sessionWithProvider = element as ChatSessionItemWithProvider;
			const sessionId = element.id;
			const providerType = sessionWithProvider.provider.chatSessionType;

			this.logService.info('[SessionsViewPane] Opening session as editor:', { sessionId, providerType });

			await this.editorService.openEditor({
				resource: ChatSessionUri.forSession(providerType, sessionId),
				options: { pinned: true }
			});

		} catch (error) {
			this.logService.error('[SessionsViewPane] Failed to open chat session:', error);
		}
	}

	private isLocalChatSessionItem(item: IChatSessionItem): item is ILocalChatSessionItem {
		return ('editor' in item && 'group' in item) || ('widget' in item && 'sessionType' in item);
	}

	private showContextMenu(e: ITreeContextMenuEvent<ChatSessionItemWithProvider>) {
		if (!e.element) {
			return;
		}

		const session = e.element;
		const sessionWithProvider = session as ChatSessionItemWithProvider;

		// Create context overlay for this specific session item
		const contextOverlay = getSessionItemContextOverlay(session, sessionWithProvider.provider);
		const contextKeyService = this.contextKeyService.createOverlay(contextOverlay);

		// Create marshalled context for command execution
		const marshalledSession = {
			session: session,
			$mid: MarshalledId.ChatSessionContext
		};

		this.contextMenuService.showContextMenu({
			menuId: MenuId.ChatSessionsMenu,
			menuActionOptions: { shouldForwardArgs: true },
			contextKeyService: contextKeyService,
			getAnchor: () => e.anchor,
			getActionsContext: () => marshalledSession,
		});
	}
}

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	command: {
		id: 'workbench.action.openChat',
		title: nls.localize2('interactiveSession.open', "New Chat Editor"),
		icon: Codicon.plus
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.equals('view', `${VIEWLET_ID}.local`),
});
