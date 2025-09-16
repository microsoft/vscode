/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { append, $ } from '../../../../../../base/browser/dom.js';
import { ITreeContextMenuEvent } from '../../../../../../base/browser/ui/tree/tree.js';
import { coalesce } from '../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { FuzzyScore } from '../../../../../../base/common/filters.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { truncate } from '../../../../../../base/common/strings.js';
import { URI } from '../../../../../../base/common/uri.js';
import * as nls from '../../../../../../nls.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree, WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../../browser/dnd.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { ViewPane, IViewPaneOptions } from '../../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatService } from '../../../common/chatService.js';
import { IChatSessionItemProvider } from '../../../common/chatSessionsService.js';
import { ChatSessionUri } from '../../../common/chatUri.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatWidgetService, ChatViewId } from '../../chat.js';
import { IChatEditorOptions } from '../../chatEditor.js';
import { ChatEditorInput } from '../../chatEditorInput.js';
import { ChatViewPane } from '../../chatViewPane.js';
import { ChatSessionTracker } from '../chatSessionTracker.js';
import { ChatSessionItemWithProvider, findExistingChatEditorByUri, isLocalChatSessionItem, getSessionItemContextOverlay } from '../common.js';
import { LocalChatSessionsProvider } from '../localChatSessionsProvider.js';
import { GettingStartedDelegate, GettingStartedRenderer, IGettingStartedItem, SessionsDataSource, SessionsDelegate, SessionsRenderer } from './sessionsTreeRenderer.js';

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


export class SessionsViewPane extends ViewPane {
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
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
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

		const getResourceForElement = (element: ChatSessionItemWithProvider): URI | null => {
			if (element.id === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID) {
				return null;
			}

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
						if (element.id === LocalChatSessionsProvider.HISTORY_NODE_ID) {
							return null;
						}
						return getResourceForElement(element)?.toString() ?? null;
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
			if (e.element && e.element.id !== LocalChatSessionsProvider.HISTORY_NODE_ID) {
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

	private async openChatSession(session: ChatSessionItemWithProvider) {
		if (!session || !session.id) {
			return;
		}

		try {
			// Check first if we already have an open editor for this session
			const uri = ChatSessionUri.forSession(session.provider.chatSessionType, session.id);
			const existingEditor = findExistingChatEditorByUri(uri, session.id, this.editorGroupsService);
			if (existingEditor) {
				await this.editorService.openEditor(existingEditor.editor, existingEditor.groupId);
				return;
			}
			if (this.chatWidgetService.getWidgetBySessionId(session.id)) {
				return;
			}

			if (session.id === LocalChatSessionsProvider.HISTORY_NODE_ID) {
				// Don't try to open the "Show history..." node itself
				return;
			}

			// Handle history items first
			if (isLocalChatSessionItem(session)) {
				const options: IChatEditorOptions = {
					target: { sessionId: session.id },
					pinned: true,
					ignoreInView: true,
					preserveFocus: true,
				};
				await this.editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options });
				return;
			} else if (session.id === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID) {
				const chatViewPane = await this.viewsService.openView(ChatViewId) as ChatViewPane;
				if (chatViewPane) {
					await chatViewPane.loadSession(session.id);
				}
				return;
			}

			const options: IChatEditorOptions = {
				pinned: true,
				ignoreInView: true,
				preferredTitle: truncate(session.label, 30),
				preserveFocus: true,
			};
			await this.editorService.openEditor({
				resource: ChatSessionUri.forSession(session.provider.chatSessionType, session.id),
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
		const contextOverlay = getSessionItemContextOverlay(
			session,
			sessionWithProvider.provider,
			this.chatWidgetService,
			this.chatService,
			this.editorGroupsService
		);
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
