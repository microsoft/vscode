/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSessions.css';
import * as DOM from '../../../../base/browser/dom.js';
import { $, append, getActiveWindow } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IListVirtualDelegate, IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeNode, ITreeRenderer, ITreeContextMenuEvent } from '../../../../base/browser/ui/tree/tree.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { isMarkdownString } from '../../../../base/common/htmlContent.js';
import { IChatSessionRecommendation } from '../../../../base/common/product.js';
import * as nls from '../../../../nls.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
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
import { EditorInput } from '../../../common/editor/editorInput.js';
import { Extensions, IEditableData, IViewContainersRegistry, IViewDescriptor, IViewDescriptorService, IViewsRegistry, ViewContainerLocation } from '../../../common/views.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IExtensionGalleryService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IChatSessionItem, IChatSessionItemProvider, IChatSessionsExtensionPoint, IChatSessionsService, ChatSessionStatus } from '../common/chatSessionsService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../common/constants.js';
import { IChatWidget, IChatWidgetService, ChatViewId } from './chat.js';
import { ChatViewPane } from './chatViewPane.js';
import { ChatEditorInput } from './chatEditorInput.js';
import { IChatEditorOptions } from './chatEditor.js';
import { IChatService } from '../common/chatService.js';
import { ChatSessionUri } from '../common/chatUri.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import Severity from '../../../../base/common/severity.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { timeout } from '../../../../base/common/async.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { fillEditorsDragData } from '../../../browser/dnd.js';
import { IChatModel } from '../common/chatModel.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ChatSessionItemWithProvider, getChatSessionType, isChatSession } from './chatSessions/common.js';
import { ChatSessionTracker } from './chatSessions/chatSessionTracker.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { allowedChatMarkdownHtmlTags } from './chatMarkdownRenderer.js';
import product from '../../../../platform/product/common/product.js';
import { truncate } from '../../../../base/common/strings.js';

export const VIEWLET_ID = 'workbench.view.chat.sessions';

// Helper function to update relative time for chat sessions (similar to timeline)
function updateRelativeTime(item: ChatSessionItemWithProvider, lastRelativeTime: string | undefined): string | undefined {
	if (item.timing?.startTime) {
		item.relativeTime = fromNow(item.timing.startTime);
		item.relativeTimeFullWord = fromNow(item.timing.startTime, false, true);
		if (lastRelativeTime === undefined || item.relativeTime !== lastRelativeTime) {
			lastRelativeTime = item.relativeTime;
			item.hideRelativeTime = false;
		} else {
			item.hideRelativeTime = true;
		}
	} else {
		// Clear timestamp properties if no timestamp
		item.relativeTime = undefined;
		item.relativeTimeFullWord = undefined;
		item.hideRelativeTime = false;
	}

	return lastRelativeTime;
}

// Helper function to extract timestamp from session item
function extractTimestamp(item: IChatSessionItem): number | undefined {
	// Use timing.startTime if available from the API
	if (item.timing?.startTime) {
		return item.timing.startTime;
	}

	// For other items, timestamp might already be set
	if ('timestamp' in item) {
		return (item as any).timestamp;
	}

	return undefined;
}

// Helper function to sort sessions by timestamp (newest first)
function sortSessionsByTimestamp(sessions: ChatSessionItemWithProvider[]): void {
	sessions.sort((a, b) => {
		const aTime = a.timing?.startTime ?? 0;
		const bTime = b.timing?.startTime ?? 0;
		return bTime - aTime; // newest first
	});
}

// Helper function to apply time grouping to a list of sessions
function applyTimeGrouping(sessions: ChatSessionItemWithProvider[]): void {
	let lastRelativeTime: string | undefined;
	sessions.forEach(session => {
		lastRelativeTime = updateRelativeTime(session, lastRelativeTime);
	});
}

// Helper function to process session items with timestamps, sorting, and grouping
function processSessionsWithTimeGrouping(sessions: ChatSessionItemWithProvider[]): void {
	// Only process if we have sessions with timestamps
	if (sessions.some(session => session.timing?.startTime !== undefined)) {
		sortSessionsByTimestamp(sessions);
		applyTimeGrouping(sessions);
	}
}

// Helper function to create context overlay for session items
function getSessionItemContextOverlay(session: IChatSessionItem, provider?: IChatSessionItemProvider): [string, any][] {
	const overlay: [string, any][] = [];
	if (provider) {
		overlay.push([ChatContextKeys.sessionType.key, provider.chatSessionType]);
	}

	// Mark history items
	const isHistoryItem = session.id.startsWith('history-');
	overlay.push([ChatContextKeys.isHistoryItem.key, isHistoryItem]);

	return overlay;
}

// Extended interface for local chat session items that includes editor information or widget information
export interface ILocalChatSessionItem extends IChatSessionItem {
	editor?: EditorInput;
	group?: IEditorGroup;
	widget?: IChatWidget;
	sessionType: 'editor' | 'widget';
	description?: string;
	status?: ChatSessionStatus;
}

interface IGettingStartedItem {
	id: string;
	label: string;
	commandId: string;
	icon?: ThemeIcon;
	args?: any[];
}

class GettingStartedDelegate implements IListVirtualDelegate<IGettingStartedItem> {
	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return 'gettingStartedItem';
	}
}

interface IGettingStartedTemplateData {
	resourceLabel: IResourceLabel;
}

class GettingStartedRenderer implements IListRenderer<IGettingStartedItem, IGettingStartedTemplateData> {
	readonly templateId = 'gettingStartedItem';

	constructor(private readonly labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): IGettingStartedTemplateData {
		const resourceLabel = this.labels.create(container, { supportHighlights: true });
		return { resourceLabel };
	}

	renderElement(element: IGettingStartedItem, index: number, templateData: IGettingStartedTemplateData): void {
		templateData.resourceLabel.setResource({
			name: element.label,
			resource: undefined
		}, {
			icon: element.icon,
			hideIcon: false
		});
		templateData.resourceLabel.element.setAttribute('data-command', element.commandId);
	}

	disposeTemplate(templateData: IGettingStartedTemplateData): void {
		templateData.resourceLabel.dispose();
	}
}

export class ChatSessionsView extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatSessions';

	private isViewContainerRegistered = false;
	private localProvider: LocalChatSessionsProvider | undefined;
	private readonly sessionTracker: ChatSessionTracker;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this.sessionTracker = this._register(this.instantiationService.createInstance(ChatSessionTracker));
		this.setupEditorTracking();

		// Create and register the local chat sessions provider immediately
		// This ensures it's available even when the view container is not initialized
		this.localProvider = this._register(this.instantiationService.createInstance(LocalChatSessionsProvider));
		this._register(this.chatSessionsService.registerChatSessionItemProvider(this.localProvider));

		// Initial check
		this.updateViewContainerRegistration();

		// Listen for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentSessionsViewLocation)) {
				this.updateViewContainerRegistration();
			}
		}));
	}

	private setupEditorTracking(): void {
		this._register(this.sessionTracker.onDidChangeEditors(e => {
			this.chatSessionsService.notifySessionItemsChanged(e.sessionType);
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
				ctorDescriptor: new SyncDescriptor(ChatSessionsViewPaneContainer, [this.sessionTracker]),
				hideIfEmpty: false,
				icon: registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, 'Icon for Chat Sessions View'),
				order: 6
			}, ViewContainerLocation.Sidebar);
	}
}

// Local Chat Sessions Provider - tracks open editors as chat sessions
class LocalChatSessionsProvider extends Disposable implements IChatSessionItemProvider {
	static readonly CHAT_WIDGET_VIEW_ID = 'workbench.panel.chat.view.copilot';
	readonly chatSessionType = 'local';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	readonly _onDidChangeChatSessionItems = this._register(new Emitter<void>());
	public get onDidChangeChatSessionItems() { return this._onDidChangeChatSessionItems.event; }

	// Track the current editor set to detect actual new additions
	private currentEditorSet = new Set<string>();

	// Maintain ordered list of editor keys to preserve consistent ordering
	private editorOrder: string[] = [];

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this.initializeCurrentEditorSet();
		this.registerWidgetListeners();

		this._register(this.chatService.onDidDisposeSession(() => {
			this._onDidChange.fire();
		}));

		// Listen for global session items changes for our session type
		this._register(this.chatSessionsService.onDidChangeSessionItems((sessionType) => {
			if (sessionType === this.chatSessionType) {
				this.initializeCurrentEditorSet();
				this._onDidChange.fire();
			}
		}));
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
					if (widget.viewModel) {
						this.registerProgressListener(widget.viewModel.model.requestInProgressObs);
					}
				}));

				// Listen for title changes on the current model
				this.registerModelTitleListener(widget);
				if (widget.viewModel) {
					this.registerProgressListener(widget.viewModel.model.requestInProgressObs);
				}
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
			if (widget.viewModel) {
				this.registerProgressListener(widget.viewModel.model.requestInProgressObs);
			}
		});
	}

	private registerProgressListener(observable: IObservable<boolean>) {
		const progressEvent = Event.fromObservableLight(observable);
		this._register(progressEvent(() => {
			this._onDidChangeChatSessionItems.fire();
		}));
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

	private isLocalChatSession(editor?: EditorInput): boolean {
		// For the LocalChatSessionsProvider, we only want to track sessions that are actually 'local' type
		if (!isChatSession(editor)) {
			return false;
		}

		if (!(editor instanceof ChatEditorInput)) {
			return false;
		}

		const sessionType = getChatSessionType(editor);
		return sessionType === 'local';
	}

	private modelToStatus(model: IChatModel): ChatSessionStatus | undefined {
		if (model.requestInProgress) {
			return ChatSessionStatus.InProgress;
		} else {
			const requests = model.getRequests();
			if (requests.length > 0) {
				// Check if the last request was completed successfully or failed
				const lastRequest = requests[requests.length - 1];
				if (lastRequest && lastRequest.response) {
					if (lastRequest.response.isCanceled || lastRequest.response.result?.errorDetails) {
						return ChatSessionStatus.Failed;
					} else if (lastRequest.response.isComplete) {
						return ChatSessionStatus.Completed;
					} else {
						return ChatSessionStatus.InProgress;
					}
				}
			}
		}
		return;
	}

	async provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]> {
		const sessions: ChatSessionItemWithProvider[] = [];
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
		const status = chatWidget?.viewModel?.model ? this.modelToStatus(chatWidget.viewModel.model) : undefined;
		const widgetSession: ILocalChatSessionItem & ChatSessionItemWithProvider = {
			id: LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID,
			label: chatWidget?.viewModel?.model.title || nls.localize2('chat.sessions.chatView', "Chat").value,
			description: nls.localize('chat.sessions.chatView.description', "Chat View"),
			iconPath: Codicon.chatSparkle,
			widget: chatWidget,
			sessionType: 'widget',
			status,
			provider: this
		};
		sessions.push(widgetSession);

		// Build editor-based sessions in the order specified by editorOrder
		this.editorOrder.forEach((editorKey, index) => {
			const editorInfo = editorMap.get(editorKey);
			if (editorInfo) {
				const sessionId = `local-${editorInfo.group.id}-${index}`;

				// Determine status and timestamp for editor-based session
				let status: ChatSessionStatus | undefined;
				let timestamp: number | undefined;
				if (editorInfo.editor instanceof ChatEditorInput && editorInfo.editor.sessionId) {
					const model = this.chatService.getSession(editorInfo.editor.sessionId);
					if (model) {
						status = this.modelToStatus(model);
						// Get the last interaction timestamp from the model
						const requests = model.getRequests();
						if (requests.length > 0) {
							const lastRequest = requests[requests.length - 1];
							timestamp = lastRequest.timestamp;
						} else {
							// Fallback to current time if no requests yet
							timestamp = Date.now();
						}
					}
				}

				const editorSession: ILocalChatSessionItem & ChatSessionItemWithProvider = {
					id: sessionId,
					label: editorInfo.editor.getName(),
					iconPath: Codicon.chatSparkle,
					editor: editorInfo.editor,
					group: editorInfo.group,
					sessionType: 'editor',
					status,
					provider: this,
					timing: {
						startTime: timestamp ?? 0
					}
				};
				sessions.push(editorSession);
			}
		});

		// Add "Show history..." node at the end
		const historyNode: IChatSessionItem = {
			id: 'show-history',
			label: nls.localize('chat.sessions.showHistory', "History"),
		};

		return [...sessions, historyNode];
	}
}

// Chat sessions container
class ChatSessionsViewPaneContainer extends ViewPaneContainer {
	private registeredViewDescriptors: Map<string, IViewDescriptor> = new Map();

	constructor(
		private readonly sessionTracker: ChatSessionTracker,
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
		@IProductService private readonly productService: IProductService,
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
		return Array.from(this.chatSessionsService.getAllChatSessionItemProviders());
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

			// Separate providers by type and prepare display names
			const localProvider = providers.find(p => p.chatSessionType === 'local');
			const historyProvider = providers.find(p => p.chatSessionType === 'history');
			const otherProviders = providers.filter(p => p.chatSessionType !== 'local' && p.chatSessionType !== 'history');

			// Sort other providers alphabetically by display name
			const providersWithDisplayNames = otherProviders.map(provider => {
				const extContribution = extensionPointContributions.find(c => c.type === provider.chatSessionType);
				if (!extContribution) {
					this.logService.warn(`No extension contribution found for chat session type: ${provider.chatSessionType}`);
					return null;
				}
				return {
					provider,
					displayName: extContribution.displayName
				};
			}).filter(item => item !== null) as Array<{ provider: IChatSessionItemProvider; displayName: string }>;

			// Sort alphabetically by display name
			providersWithDisplayNames.sort((a, b) => a.displayName.localeCompare(b.displayName));

			// Register views in priority order: local, history, then alphabetically sorted others
			const orderedProviders = [
				...(localProvider ? [{ provider: localProvider, displayName: 'Local Chat Sessions', baseOrder: 0 }] : []),
				...(historyProvider ? [{ provider: historyProvider, displayName: 'History', baseOrder: 1 }] : []),
				...providersWithDisplayNames.map((item, index) => ({
					...item,
					baseOrder: 2 + index // Start from 2 for other providers
				}))
			];

			orderedProviders.forEach(({ provider, displayName, baseOrder }) => {
				// Only register if not already registered
				if (!this.registeredViewDescriptors.has(provider.chatSessionType)) {
					const viewDescriptor: IViewDescriptor = {
						id: `${VIEWLET_ID}.${provider.chatSessionType}`,
						name: {
							value: displayName,
							original: displayName,
						},
						ctorDescriptor: new SyncDescriptor(SessionsViewPane, [provider, this.sessionTracker]),
						canToggleVisibility: true,
						canMoveView: true,
						order: baseOrder, // Use computed order based on priority and alphabetical sorting
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

			const gettingStartedViewId = `${VIEWLET_ID}.gettingStarted`;
			if (!this.registeredViewDescriptors.has('gettingStarted')
				&& this.productService.chatSessionRecommendations
				&& this.productService.chatSessionRecommendations.length) {
				const gettingStartedDescriptor: IViewDescriptor = {
					id: gettingStartedViewId,
					name: {
						value: nls.localize('chat.sessions.gettingStarted', "Getting Started"),
						original: 'Getting Started',
					},
					ctorDescriptor: new SyncDescriptor(SessionsViewPane, [null, this.sessionTracker]),
					canToggleVisibility: true,
					canMoveView: true,
					order: 1000,
					collapsed: true,
				};
				viewDescriptorsToRegister.push(gettingStartedDescriptor);
				this.registeredViewDescriptors.set('gettingStarted', gettingStartedDescriptor);
			}

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
		private readonly sessionTracker: ChatSessionTracker,
	) {
	}

	hasChildren(element: IChatSessionItemProvider | ChatSessionItemWithProvider): boolean {
		const isProvider = element === this.provider;
		if (isProvider) {
			// Root provider always has children
			return true;
		}

		// Check if this is the "Show history..." node
		if ('id' in element && element.id === 'show-history') {
			return true;
		}

		return false;
	}

	async getChildren(element: IChatSessionItemProvider | ChatSessionItemWithProvider): Promise<ChatSessionItemWithProvider[]> {
		if (element === this.provider) {
			try {
				const items = await this.provider.provideChatSessionItems(CancellationToken.None);
				const itemsWithProvider = items.map(item => {
					const itemWithProvider: ChatSessionItemWithProvider = { ...item, provider: this.provider };

					// Extract timestamp using the helper function
					itemWithProvider.timing = { startTime: extractTimestamp(item) ?? 0 };

					return itemWithProvider;
				});

				// Add hybrid local editor sessions for this provider using the centralized service
				if (this.provider.chatSessionType !== 'local') {
					const hybridSessions = await this.sessionTracker.getHybridSessionsForProvider(this.provider);
					itemsWithProvider.push(...(hybridSessions as ChatSessionItemWithProvider[]));
				}

				// For non-local providers, apply time-based sorting and grouping
				if (this.provider.chatSessionType !== 'local') {
					processSessionsWithTimeGrouping(itemsWithProvider);
				}

				return itemsWithProvider;
			} catch (error) {
				return [];
			}
		}

		// Check if this is the "Show history..." node
		if ('id' in element && element.id === 'show-history') {
			return this.getHistoryItems();
		}

		// Individual session items don't have children
		return [];
	}

	private async getHistoryItems(): Promise<ChatSessionItemWithProvider[]> {
		try {
			// Get all chat history
			const allHistory = await this.chatService.getHistory();

			// Create history items with provider reference and timestamps
			const historyItems = allHistory.map((historyDetail: any): ChatSessionItemWithProvider => ({
				id: `history-${historyDetail.sessionId}`,
				label: historyDetail.title,
				iconPath: Codicon.chatSparkle,
				provider: this.provider,
				timing: {
					startTime: historyDetail.lastMessageDate ?? Date.now()
				}
			}));

			// Apply sorting and time grouping
			processSessionsWithTimeGrouping(historyItems);

			return historyItems;

		} catch (error) {
			return [];
		}
	}
}

// Tree delegate for session items
class SessionsDelegate implements IListVirtualDelegate<ChatSessionItemWithProvider> {
	static readonly ITEM_HEIGHT = 22;
	static readonly ITEM_HEIGHT_WITH_DESCRIPTION = 44; // Slightly smaller for cleaner look

	constructor(private readonly configurationService: IConfigurationService) { }

	getHeight(element: ChatSessionItemWithProvider): number {
		// Return consistent height for all items (single-line layout)
		if (element.description && this.configurationService.getValue(ChatConfiguration.ShowAgentSessionsViewDescription) && element.provider.chatSessionType !== 'local') {
			return SessionsDelegate.ITEM_HEIGHT_WITH_DESCRIPTION;
		} else {
			return SessionsDelegate.ITEM_HEIGHT;
		}
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
	timestamp: HTMLElement;
	descriptionRow: HTMLElement;
	descriptionLabel: HTMLElement;
	statisticsLabel: HTMLElement;
}

// Renderer for session items in the tree
class SessionsRenderer extends Disposable implements ITreeRenderer<IChatSessionItem, FuzzyScore, ISessionTemplateData> {
	static readonly TEMPLATE_ID = 'session';
	private appliedIconColorStyles = new Set<string>();
	private markdownRenderer: MarkdownRenderer;

	constructor(
		private readonly labels: ResourceLabels,
		@IThemeService private readonly themeService: IThemeService,
		@ILogService private readonly logService: ILogService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// Listen for theme changes to clear applied styles
		this._register(this.themeService.onDidColorThemeChange(() => {
			this.appliedIconColorStyles.clear();
		}));

		this.markdownRenderer = instantiationService.createInstance(MarkdownRenderer, {});
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
		const element = append(container, $('.chat-session-item'));

		// Create a container that holds the label, timestamp, and actions
		const contentContainer = append(element, $('.session-content'));
		const resourceLabel = this.labels.create(contentContainer, { supportHighlights: true });
		const descriptionRow = append(element, $('.description-row'));
		const descriptionLabel = append(descriptionRow, $('span.description'));
		const statisticsLabel = append(descriptionRow, $('span.statistics'));

		// Create timestamp container and element
		const timestampContainer = append(contentContainer, $('.timestamp-container'));
		const timestamp = append(timestampContainer, $('.timestamp'));

		const actionsContainer = append(contentContainer, $('.actions'));
		const actionBar = new ActionBar(actionsContainer);
		const elementDisposable = new DisposableStore();

		return {
			container: element,
			resourceLabel,
			actionBar,
			elementDisposable,
			timestamp,
			descriptionRow,
			descriptionLabel,
			statisticsLabel,
		};
	}

	statusToIcon(status?: ChatSessionStatus) {
		switch (status) {
			case ChatSessionStatus.InProgress:
				return Codicon.loading;
			case ChatSessionStatus.Completed:
				return Codicon.pass;
			case ChatSessionStatus.Failed:
				return Codicon.error;
			default:
				return Codicon.circleOutline;
		}

	}

	renderElement(element: ITreeNode<IChatSessionItem, FuzzyScore>, index: number, templateData: ISessionTemplateData): void {
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
		if (!session.iconPath && session.id !== 'show-history') {
			iconTheme = this.statusToIcon(session.status);
		} else {
			iconTheme = session.iconPath;
		}

		if (iconTheme?.color?.id) {
			this.applyIconColorStyle(iconTheme.id, iconTheme.color.id);
		}

		const renderDescriptionOnSecondRow = this.configurationService.getValue(ChatConfiguration.ShowAgentSessionsViewDescription) && sessionWithProvider.provider.chatSessionType !== 'local';

		if (renderDescriptionOnSecondRow && session.description) {
			templateData.container.classList.toggle('multiline', true);
			templateData.descriptionRow.style.display = 'flex';
			if (typeof session.description === 'string') {
				templateData.descriptionLabel.textContent = session.description;
			} else {
				templateData.elementDisposable.add(this.markdownRenderer.render(session.description, {
					sanitizerConfig: {
						replaceWithPlaintext: true,
						allowedTags: {
							override: allowedChatMarkdownHtmlTags,
						},
						allowedLinkSchemes: { augment: [product.urlProtocol] }
					},
				}, templateData.descriptionLabel));
				templateData.elementDisposable.add(DOM.addDisposableListener(templateData.descriptionLabel, 'mousedown', e => e.stopPropagation()));
				templateData.elementDisposable.add(DOM.addDisposableListener(templateData.descriptionLabel, 'click', e => e.stopPropagation()));
				templateData.elementDisposable.add(DOM.addDisposableListener(templateData.descriptionLabel, 'auxclick', e => e.stopPropagation()));
			}

			DOM.clearNode(templateData.statisticsLabel);
			const insertionNode = append(templateData.statisticsLabel, $('span.insertions'));
			insertionNode.textContent = session.statistics ? `+${session.statistics.insertions}` : '';
			const deletionNode = append(templateData.statisticsLabel, $('span.deletions'));
			deletionNode.textContent = session.statistics ? `-${session.statistics.deletions}` : '';
		} else {
			templateData.container.classList.toggle('multiline', false);
		}

		// Set the resource label
		templateData.resourceLabel.setResource({
			name: session.label,
			description: !renderDescriptionOnSecondRow && 'description' in session && typeof session.description === 'string' ? session.description : '',
			resource: iconResource
		}, {
			fileKind: undefined,
			icon: iconTheme,
			title: 'tooltip' in session && session.tooltip ?
				(typeof session.tooltip === 'string' ? session.tooltip :
					isMarkdownString(session.tooltip) ? {
						markdown: session.tooltip,
						markdownNotSupportedFallback: session.tooltip.value
					} : undefined) :
				undefined
		});

		// Handle timestamp display and grouping
		const hasTimestamp = sessionWithProvider.timing?.startTime !== undefined;
		if (hasTimestamp) {
			templateData.timestamp.textContent = sessionWithProvider.relativeTime ?? '';
			templateData.timestamp.ariaLabel = sessionWithProvider.relativeTimeFullWord ?? '';
			templateData.timestamp.parentElement!.classList.toggle('timestamp-duplicate', sessionWithProvider.hideRelativeTime === true);
			templateData.timestamp.parentElement!.style.display = '';
		} else {
			// Hide timestamp container if no timestamp available
			templateData.timestamp.parentElement!.style.display = 'none';
		}

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
		// Hide the existing resource label element and session content
		const existingResourceLabelElement = container.querySelector('.monaco-icon-label') as HTMLElement;
		if (existingResourceLabelElement) {
			existingResourceLabelElement.style.display = 'none';
		}

		// Hide the session content container to avoid layout conflicts
		const sessionContentElement = container.querySelector('.session-content') as HTMLElement;
		if (sessionContentElement) {
			sessionContentElement.style.display = 'none';
		}

		// Create a simple container that mimics the file explorer's structure
		const editContainer = DOM.append(container, DOM.$('.explorer-item.explorer-item-edited'));

		// Add the icon
		const iconElement = DOM.append(editContainer, DOM.$('.codicon'));
		if (session.iconPath && ThemeIcon.isThemeIcon(session.iconPath)) {
			iconElement.classList.add(`codicon-${session.iconPath.id}`);
		} else {
			iconElement.classList.add('codicon-file'); // Default file icon
		}

		// Create the input box directly
		const inputBox = new InputBox(editContainer, this.contextViewService, {
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

			// Clean up the edit container
			editContainer.style.display = 'none';
			editContainer.remove();

			// Restore the original resource label
			if (existingResourceLabelElement) {
				existingResourceLabelElement.style.display = '';
			}

			// Restore the session content container
			const sessionContentElement = container.querySelector('.session-content') as HTMLElement;
			if (sessionContentElement) {
				sessionContentElement.style.display = '';
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
						// Do nothing - context menu is open
					} else {
						break;
					}
				}

				done(inputBox.isInputValid(), true);
			})
		];

		const disposableStore = new DisposableStore();
		disposables.forEach(d => disposableStore.add(d));
		disposableStore.add(toDisposable(() => done(false, false)));
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
	private list: WorkbenchList<IGettingStartedItem> | undefined;
	private treeContainer: HTMLElement | undefined;
	private messageElement?: HTMLElement;
	private _isEmpty: boolean = true;

	constructor(
		private readonly provider: IChatSessionItemProvider,
		private readonly sessionTracker: ChatSessionTracker,
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
		@IProgressService private readonly progressService: IProgressService,
		@IMenuService private readonly menuService: IMenuService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Listen for changes in the provider if it's a LocalChatSessionsProvider
		if (provider instanceof LocalChatSessionsProvider) {
			this._register(provider.onDidChange(() => {
				if (this.tree && this.isBodyVisible()) {
					this.refreshTreeWithProgress();
				}
			}));
		}

		// Listen for configuration changes to refresh view when description display changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.ShowAgentSessionsViewDescription)) {
				if (this.tree && this.isBodyVisible()) {
					this.refreshTreeWithProgress();
				}
			}
		}));
	}

	override shouldShowWelcome(): boolean {
		return this._isEmpty;
	}

	private isLocalChatSessionItem(item: IChatSessionItem): item is ILocalChatSessionItem {
		return ('editor' in item && 'group' in item) || ('widget' in item && 'sessionType' in item);
	}

	public refreshTree(): void {
		if (this.tree && this.isBodyVisible()) {
			this.refreshTreeWithProgress();
		}
	}

	private isEmpty() {
		// Check if the tree has the provider node and get its children count
		if (!this.tree?.hasNode(this.provider)) {
			return true;
		}
		const providerNode = this.tree.getNode(this.provider);
		const childCount = providerNode.children?.length || 0;

		return childCount === 0;
	}

	/**
	 * Updates the empty state message based on current tree data.
	 * Uses the tree's existing data to avoid redundant provider calls.
	 */
	private updateEmptyState(): void {
		try {
			const newEmptyState = this.isEmpty();
			if (newEmptyState !== this._isEmpty) {
				this._isEmpty = newEmptyState;
				this._onDidChangeViewWelcomeState.fire();
			}
		} catch (error) {
			this.logService.error('Error checking tree data for empty state:', error);
		}
	}

	/**
	 * Refreshes the tree data with progress indication.
	 * Shows a progress indicator while the tree updates its children from the provider.
	 */
	private async refreshTreeWithProgress(): Promise<void> {
		if (!this.tree) {
			return;
		}

		try {
			await this.progressService.withProgress(
				{
					location: this.id, // Use the view ID as the progress location
					title: nls.localize('chatSessions.refreshing', 'Refreshing chat sessions...'),
				},
				async () => {
					await this.tree!.updateChildren(this.provider);
				}
			);

			// Check for empty state after refresh using tree data
			this.updateEmptyState();
		} catch (error) {
			// Log error but don't throw to avoid breaking the UI
			this.logService.error('Error refreshing chat sessions tree:', error);
		}
	}

	/**
	 * Loads initial tree data with progress indication.
	 * Shows a progress indicator while the tree loads data from the provider.
	 */
	private async loadDataWithProgress(): Promise<void> {
		if (!this.tree) {
			return;
		}

		try {
			await this.progressService.withProgress(
				{
					location: this.id, // Use the view ID as the progress location
					title: nls.localize('chatSessions.loading', 'Loading chat sessions...'),
				},
				async () => {
					await this.tree!.setInput(this.provider);
				}
			);

			// Check for empty state after loading using tree data
			this.updateEmptyState();
		} catch (error) {
			// Log error but don't throw to avoid breaking the UI
			this.logService.error('Error loading chat sessions data:', error);
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// For Getting Started view (null provider), show simple list
		if (this.provider === null) {
			this.renderGettingStartedList(container);
			return;
		}

		this.treeContainer = DOM.append(container, DOM.$('.chat-sessions-tree-container'));
		// Create message element for empty state
		this.messageElement = append(container, $('.chat-sessions-message'));
		this.messageElement.style.display = 'none';
		// Create the tree components
		const dataSource = new SessionsDataSource(this.provider, this.chatService, this.sessionTracker);
		const delegate = new SessionsDelegate(this.configurationService);
		const identityProvider = new SessionsIdentityProvider();
		const accessibilityProvider = new SessionsAccessibilityProvider();

		// Use the existing ResourceLabels service for consistent styling
		const labels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		const renderer = this.instantiationService.createInstance(SessionsRenderer, labels);
		this._register(renderer);

		const getResourceForElement = (element: ChatSessionItemWithProvider): URI => {
			return ChatSessionUri.forSession(element.provider.chatSessionType, element.id);
		};

		this.tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'ChatSessions',
			this.treeContainer,
			delegate,
			[renderer],
			dataSource,
			{
				dnd: {
					onDragStart: (data, originalEvent) => {
						try {
							const elements = data.getData() as ChatSessionItemWithProvider[];
							const uris = coalesce(elements.map(getResourceForElement));
							this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
						} catch {
							// noop
						}
					},
					getDragURI: (element: ChatSessionItemWithProvider) => {
						return getResourceForElement(element).toString();
					},
					getDragLabel: (elements: ChatSessionItemWithProvider[]) => {
						if (elements.length === 1) {
							return elements[0].label;
						}
						return nls.localize('chatSessions.dragLabel', "{0} chat sessions", elements.length);
					},
					drop: () => { },
					onDragOver: () => false,
					dispose: () => { },
				},
				accessibilityProvider,
				identityProvider,
				multipleSelectionSupport: false,
				overrideStyles: {
					listBackground: undefined
				},
				setRowLineHeight: false

			}
		) as WorkbenchAsyncDataTree<IChatSessionItemProvider, ChatSessionItemWithProvider, FuzzyScore>;

		// Set the input
		this.tree.setInput(this.provider);

		// Register tree events
		this._register(this.tree.onDidOpen((e) => {
			if (e.element) {
				this.openChatSession(e.element);
			}
		}));

		// Register context menu event for right-click actions
		this._register(this.tree.onContextMenu((e) => {
			if (e.element && e.element.id !== 'show-history') {
				this.showContextMenu(e);
			}
		}));

		// Handle visibility changes to load data
		this._register(this.onDidChangeBodyVisibility(async visible => {
			if (visible && this.tree) {
				await this.loadDataWithProgress();
			}
		}));

		// Initially load data if visible
		if (this.isBodyVisible() && this.tree) {
			this.loadDataWithProgress();
		}

		this._register(this.tree);
	}

	private renderGettingStartedList(container: HTMLElement): void {
		const listContainer = DOM.append(container, DOM.$('.getting-started-list-container'));
		const items: IGettingStartedItem[] = [
			{
				id: 'install-extensions',
				label: nls.localize('chatSessions.installExtensions', "Install Chat Extensions"),
				icon: Codicon.extensions,
				commandId: 'chat.sessions.gettingStarted'
			},
			{
				id: 'learn-more',
				label: nls.localize('chatSessions.learnMoreGHCodingAgent', "Learn More About GitHub Copilot coding agent"),
				commandId: 'vscode.open',
				icon: Codicon.book,
				args: [URI.parse('https://aka.ms/coding-agent-docs')]
			}
		];
		const delegate = new GettingStartedDelegate();

		// Create ResourceLabels instance for the renderer
		const labels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(labels);

		const renderer = new GettingStartedRenderer(labels);
		this.list = this.instantiationService.createInstance(
			WorkbenchList<IGettingStartedItem>,
			'GettingStarted',
			listContainer,
			delegate,
			[renderer],
			{
				horizontalScrolling: false,
			}
		);
		this.list.splice(0, 0, items);
		this._register(this.list.onDidOpen(e => {
			if (e.element) {
				this.commandService.executeCommand(e.element.commandId, ...e.element.args ?? []);
			}
		}));

		this._register(this.list);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.tree) {
			this.tree.layout(height, width);
		}
		if (this.list) {
			this.list.layout(height, width);
		}
	}

	private async openChatSession(element: ChatSessionItemWithProvider) {
		if (!element || !element.id) {
			return;
		}

		try {
			if (element.id === 'show-history') {
				// Don't try to open the "Show history..." node itself
				return;
			}

			// Handle history items first
			if (element.id.startsWith('history-')) {
				const sessionId = element.id.substring('history-'.length);
				const sessionWithProvider = element as ChatSessionItemWithProvider;

				// For local history sessions, use ChatEditorInput approach
				if (sessionWithProvider.provider.chatSessionType === 'local') {
					const options: IChatEditorOptions = {
						target: { sessionId },
						pinned: true,
						// Add a marker to indicate this session was opened from history
						ignoreInView: true,
					};
					await this.editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options });
				} else {
					// For external provider sessions, use ChatSessionUri approach
					const providerType = sessionWithProvider.provider.chatSessionType;
					const options: IChatEditorOptions = {
						pinned: true,
						preferredTitle: truncate(element.label, 20)

					};
					await this.editorService.openEditor({
						resource: ChatSessionUri.forSession(providerType, sessionId),
						options,
					});
				}
				return;
			}

			// Handle local session items (active editors/widgets)
			if (this.isLocalChatSessionItem(element)) {
				if (element.sessionType === 'editor' && element.editor && element.group) {
					// Focus the existing editor
					await element.group.openEditor(element.editor, { pinned: true });
					return;
				} else if (element.sessionType === 'widget') {
					// Focus the chat widget
					const chatViewPane = await this.viewsService.openView(ChatViewId) as ChatViewPane;
					if (chatViewPane && element?.widget?.viewModel?.model) {
						await chatViewPane.loadSession(element.widget.viewModel.model.sessionId);
					}
					return;
				}
			}

			// For other session types, open as a new chat editor
			const sessionWithProvider = element as ChatSessionItemWithProvider;
			const sessionId = element.id;
			const providerType = sessionWithProvider.provider.chatSessionType;

			const options: IChatEditorOptions = {
				pinned: true,
				ignoreInView: true,
				preferredTitle: truncate(element.label, 20),
			};
			await this.editorService.openEditor({
				resource: ChatSessionUri.forSession(providerType, sessionId),
				options,
			});

		} catch (error) {
			this.logService.error('[SessionsViewPane] Failed to open chat session:', error);
		}
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

		// Create menu for this session item to get actions
		const menu = this.menuService.createMenu(MenuId.ChatSessionsMenu, contextKeyService);

		// Get actions and filter for context menu (all actions that are NOT inline)
		const actions = menu.getActions({ arg: marshalledSession, shouldForwardArgs: true });

		const { secondary } = getActionBarActions(actions, 'inline'); this.contextMenuService.showContextMenu({
			getActions: () => secondary,
			getAnchor: () => e.anchor,
			getActionsContext: () => marshalledSession,
		});

		menu.dispose();
	}
}

class ChatSessionsGettingStartedAction extends Action2 {
	static readonly ID = 'chat.sessions.gettingStarted';

	constructor() {
		super({
			id: ChatSessionsGettingStartedAction.ID,
			title: nls.localize2('chat.sessions.gettingStarted.action', "Getting Started with Chat Sessions"),
			icon: Codicon.sendToRemoteAgent,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const productService = accessor.get(IProductService);
		const quickInputService = accessor.get(IQuickInputService);
		const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
		const extensionGalleryService = accessor.get(IExtensionGalleryService);

		const recommendations = productService.chatSessionRecommendations;
		if (!recommendations || recommendations.length === 0) {
			return;
		}

		const installedExtensions = await extensionManagementService.getInstalled();
		const isExtensionAlreadyInstalled = (extensionId: string) => {
			return installedExtensions.find(installed => installed.identifier.id === extensionId);
		};

		const quickPickItems = recommendations.map((recommendation: IChatSessionRecommendation) => {
			const extensionInstalled = !!isExtensionAlreadyInstalled(recommendation.extensionId);
			return {
				label: recommendation.displayName,
				description: recommendation.description,
				detail: extensionInstalled
					? nls.localize('chatSessions.extensionAlreadyInstalled', "'{0}' is already installed", recommendation.extensionName)
					: nls.localize('chatSessions.installExtension', "Installs '{0}'", recommendation.extensionName),
				extensionId: recommendation.extensionId,
				disabled: extensionInstalled,
			};
		});

		const selected = await quickInputService.pick(quickPickItems, {
			title: nls.localize('chatSessions.selectExtension', "Install Chat Extensions"),
			placeHolder: nls.localize('chatSessions.pickPlaceholder', "Choose extensions to enhance your chat experience"),
			canPickMany: true,
		});

		if (!selected) {
			return;
		}

		const galleryExtensions = await extensionGalleryService.getExtensions(selected.map(item => ({ id: item.extensionId })), CancellationToken.None);
		if (!galleryExtensions) {
			return;
		}
		await extensionManagementService.installGalleryExtensions(galleryExtensions.map(extension => ({ extension, options: { preRelease: productService.quality !== 'stable' } })));
	}
}

registerAction2(ChatSessionsGettingStartedAction);

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
