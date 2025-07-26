/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSessions.css';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { Extensions, IViewContainersRegistry, IViewDescriptorService, ViewContainerLocation, IViewsRegistry, IViewDescriptor } from '../../../common/views.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IChatSessionItem, IChatSessionItemProvider, IChatSessionsService } from '../common/chatSessionsService.js';
import { IAsyncDataSource, ITreeRenderer, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { ResourceLabels, IResourceLabel } from '../../../browser/labels.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { append, $, getActiveWindow } from '../../../../base/browser/dom.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorGroupsService, IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { GroupModelChangeKind } from '../../../common/editor.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ChatEditorInput } from './chatEditorInput.js';
import { IChatWidgetService, IChatWidget } from './chat.js';
import { ChatAgentLocation, ChatConfiguration } from '../common/constants.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IChatEditorOptions } from './chatEditor.js';
import { ChatSessionUri } from '../common/chatUri.js';

export const VIEWLET_ID = 'workbench.view.chat.sessions';

// Extended interface for local chat session items that includes editor information or widget information
interface ILocalChatSessionItem extends IChatSessionItem {
	editor?: EditorInput;
	group?: IEditorGroup;
	widget?: IChatWidget;
	sessionType: 'editor' | 'widget';
	description?: string;
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
	readonly label = 'Local Chat Sessions';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

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
			// Listen for model changes to detect title changes
			// Since setCustomTitle doesn't fire an event, we listen to general model changes
			this._register(model.onDidChange(() => {
				this._onDidChange.fire();
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

	async provideChatSessionItems(token: CancellationToken): Promise<ILocalChatSessionItem[]> {
		const sessions: ILocalChatSessionItem[] = [];
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
		if (chatWidget) {
			sessions.push({
				id: LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID,
				label: chatWidget.viewModel?.model.title || nls.localize2('chat.sessions.chatView', "Chat").value,
				description: nls.localize('chat.sessions.chatView.description', "Chat View"),
				iconPath: Codicon.chatSparkle,
				widget: chatWidget,
				sessionType: 'widget'
			});
		}

		// Build editor-based sessions in the order specified by editorOrder
		this.editorOrder.forEach((editorKey, index) => {
			const editorInfo = editorMap.get(editorKey);
			if (editorInfo) {
				const sessionId = `local-${editorInfo.group.id}-${index}`;
				sessions.push({
					id: sessionId,
					label: editorInfo.editor.getName(),
					iconPath: Codicon.commentDiscussion,
					editor: editorInfo.editor,
					group: editorInfo.group,
					sessionType: 'editor'
				});
			}
		});

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

	private getAllChatSessionProviders(): IChatSessionItemProvider[] {
		if (this.localProvider) {
			return [this.localProvider, ...this.chatSessionsService.getChatSessionItemProviders()];
		} else {
			return this.chatSessionsService.getChatSessionItemProviders();
		}
	}

	private refreshProviderTree(chatSessionType: string): void {
		// Find the provider with the matching chatSessionType
		const providers = this.getAllChatSessionProviders();
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
		const contributions = await this.chatSessionsService.getChatSessionContributions();
		await Promise.all(contributions.map(contrib => this.chatSessionsService.canResolveItemProvider(contrib.id)));
		const currentProviders = this.getAllChatSessionProviders();
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
		this.registerViews();
	}

	private async registerViews() {
		const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
		const providers = this.getAllChatSessionProviders();

		if (container && providers.length > 0) {
			const viewDescriptorsToRegister: IViewDescriptor[] = [];
			let index = 1;

			providers.forEach(provider => {
				// Only register if not already registered
				if (!this.registeredViewDescriptors.has(provider.chatSessionType)) {
					const viewDescriptor: IViewDescriptor = {
						id: `${VIEWLET_ID}.${provider.chatSessionType}`,
						name: {
							value: provider.label,
							original: provider.label,
						},
						ctorDescriptor: new SyncDescriptor(SessionsViewPane, [provider]),
						canToggleVisibility: true,
						canMoveView: true,
						order: provider.chatSessionType === 'local' ? 0 : index++,
					};

					viewDescriptorsToRegister.push(viewDescriptor);
					this.registeredViewDescriptors.set(provider.chatSessionType, viewDescriptor);
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
class SessionsDataSource implements IAsyncDataSource<IChatSessionItemProvider, IChatSessionItem> {
	constructor(
		private readonly provider: IChatSessionItemProvider
	) { }

	hasChildren(element: IChatSessionItemProvider | IChatSessionItem): boolean {
		// Only the provider (root) has children
		return element === this.provider;
	}

	async getChildren(element: IChatSessionItemProvider | IChatSessionItem): Promise<IChatSessionItem[]> {
		if (element === this.provider) {
			try {
				const items = await this.provider.provideChatSessionItems(CancellationToken.None);
				return items.map(item => ({ ...item, provider: this.provider }));
			} catch (error) {
				return [];
			}
		}
		return [];
	}
}

// Tree delegate for session items
class SessionsDelegate implements IListVirtualDelegate<IChatSessionItem> {
	static readonly ITEM_HEIGHT = 22;

	getHeight(element: IChatSessionItem): number {
		return SessionsDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: IChatSessionItem): string {
		return SessionsRenderer.TEMPLATE_ID;
	}
}

// Template data for session items
interface ISessionTemplateData {
	container: HTMLElement;
	resourceLabel: IResourceLabel;
	actionBar: ActionBar;
}

// Renderer for session items in the tree
class SessionsRenderer extends Disposable implements ITreeRenderer<IChatSessionItem, FuzzyScore, ISessionTemplateData> {
	static readonly TEMPLATE_ID = 'session';
	private appliedIconColorStyles = new Set<string>();

	constructor(
		private readonly labels: ResourceLabels,
		@IThemeService private readonly themeService: IThemeService
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
			console.log('No color found for colorId:', colorId);
		}
	}

	get templateId(): string {
		return SessionsRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): ISessionTemplateData {
		const element = append(container, $('.chat-session-item'));
		const resourceLabel = this.labels.create(element, { supportHighlights: true });
		const actionBar = new ActionBar(container);

		return {
			container: element,
			resourceLabel,
			actionBar
		};
	}

	renderElement(element: ITreeNode<IChatSessionItem, FuzzyScore>, index: number, templateData: ISessionTemplateData): void {
		const session = element.element;

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
			icon: iconTheme || iconUri
		});
	}

	disposeTemplate(templateData: ISessionTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.actionBar.dispose();
	}
}

// Sessions view pane for a specific provider
class SessionsViewPane extends ViewPane {
	private tree?: WorkbenchAsyncDataTree<IChatSessionItemProvider, IChatSessionItem, FuzzyScore>;
	private treeContainer?: HTMLElement;
	private dataSource?: SessionsDataSource;
	private labels?: ResourceLabels;

	constructor(
		private readonly provider: IChatSessionItemProvider,
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService protected override readonly instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IEditorService private readonly editorService: IEditorService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Listen for changes in the provider if it's a LocalChatSessionsProvider
		if (provider instanceof LocalChatSessionsProvider) {
			this._register(provider.onDidChange(() => {
				if (this.tree && this.isBodyVisible()) {
					this.tree.updateChildren(this.provider);
				}
			}));
		}
	}

	private isLocalChatSessionItem(item: IChatSessionItem): item is ILocalChatSessionItem {
		return ('editor' in item && 'group' in item) || ('widget' in item && 'sessionType' in item);
	}

	public refreshTree(): void {
		if (this.tree && this.isBodyVisible()) {
			this.tree.updateChildren(this.provider);
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.treeContainer = append(container, $('.chat-sessions-tree.show-file-icons'));
		this.treeContainer.classList.add('file-icon-themable-tree');

		this.labels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(this.labels);

		this.dataSource = new SessionsDataSource(this.provider);

		const delegate = new SessionsDelegate();
		const renderer = new SessionsRenderer(this.labels, this.themeService);
		this._register(renderer);

		this.tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'SessionsTree',
			this.treeContainer,
			delegate,
			[renderer],
			this.dataSource,
			{
				horizontalScrolling: false,
				setRowLineHeight: false,
				transformOptimization: false,
				identityProvider: {
					getId: (element: IChatSessionItem) => element.id
				},
				accessibilityProvider: {
					getAriaLabel: (element: IChatSessionItem) => element.label,
					getWidgetAriaLabel: () => nls.localize('chatSessions.treeAriaLabel', "Chat Sessions")
				},
				hideTwistiesOfChildlessElements: true,
				allowNonCollapsibleParents: true  // Allow nodes to be non-collapsible even if they have children
			}
		) as WorkbenchAsyncDataTree<IChatSessionItemProvider, IChatSessionItem, FuzzyScore>;

		this._register(this.tree);

		// Handle double-click and keyboard selection to open editors
		this._register(this.tree.onDidOpen(async e => {
			const element = e.element as IChatSessionItem & { provider: IChatSessionItemProvider };
			if (element && this.isLocalChatSessionItem(element)) {
				if (element.sessionType === 'editor' && element.editor && element.group) {
					// Open the chat editor
					await this.editorService.openEditor(element.editor, element.group);
				} else if (element.sessionType === 'widget' && element.widget) {
					this.viewsService.openView(element.id, true);
				}
			} else {
				const ckey = this.contextKeyService.createKey('chatSessionType', element.provider.chatSessionType);
				ckey.reset();

				await this.editorService.openEditor({
					resource: ChatSessionUri.forSession(element.provider.chatSessionType, element.id),
					options: { pinned: true } satisfies IChatEditorOptions
				});
			}
		}));

		// Handle visibility changes to load data
		this._register(this.onDidChangeBodyVisibility(async visible => {
			if (visible && this.tree) {
				await this.tree.setInput(this.provider);
			}
		}));

		// Initially load data if visible
		if (this.isBodyVisible() && this.tree) {
			this.tree.setInput(this.provider);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.tree) {
			this.tree.layout(height, width);
		}
	}

	override focus(): void {
		super.focus();
		if (this.tree) {
			this.tree.domFocus();
		}
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

