/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { $, append } from '../../../../../../base/browser/dom.js';
import { IActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { IBaseActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ITreeContextMenuEvent, ITreeNode } from '../../../../../../base/browser/ui/tree/tree.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { coalesce } from '../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { FuzzyScore } from '../../../../../../base/common/filters.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { TreeFindMatchType, TreeFindMode } from '../../../../../../base/browser/ui/tree/abstractTree.js';
import { IAsyncFindProvider, IAsyncFindResult, IAsyncFindToggles } from '../../../../../../base/browser/ui/tree/asyncDataTree.js';
import { truncate } from '../../../../../../base/common/strings.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import * as nls from '../../../../../../nls.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
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
import { IViewPaneOptions, ViewPane } from '../../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatService } from '../../../common/chatService.js';
import { IChatSessionItemProvider, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatConfiguration, ChatEditorTitleMaxLength } from '../../../common/constants.js';
import { ACTION_ID_OPEN_CHAT } from '../../actions/chatActions.js';
import { ChatViewId, IChatWidgetService } from '../../chat.js';
import { IChatEditorOptions } from '../../chatEditor.js';
import { ChatSessionTracker } from '../chatSessionTracker.js';
import { ChatSessionItemWithProvider, findExistingChatEditorByUri, getSessionItemContextOverlay, NEW_CHAT_SESSION_ACTION_ID } from '../common.js';
import { LocalChatSessionsProvider } from '../localChatSessionsProvider.js';
import { GettingStartedDelegate, GettingStartedRenderer, IGettingStartedItem, SessionsDataSource, SessionsDelegate, SessionsRenderer } from './sessionsTreeRenderer.js';

// Identity provider for session items
class SessionsIdentityProvider {
	getId(element: ChatSessionItemWithProvider): string {
		return element.resource.toString();
	}
}

// Accessibility provider for session items
class SessionsAccessibilityProvider {
	getWidgetAriaLabel(): string {
		return nls.localize('chatSessions', 'Chat Sessions');
	}

	getAriaLabel(element: ChatSessionItemWithProvider): string | null {
		return element.label;
	}
}

// Word-based fuzzy find provider for sessions
class ChatSessionsFindProvider implements IAsyncFindProvider<ChatSessionItemWithProvider> {
	private pattern: string = '';
	private matchType: TreeFindMatchType = TreeFindMatchType.Contiguous;
	private matchedSessions: Set<ChatSessionItemWithProvider> = new Set();
	private tree: WorkbenchAsyncDataTree<IChatSessionItemProvider, ChatSessionItemWithProvider, FuzzyScore> | undefined;
	private isSearchActive: boolean = false;

	constructor(
		private readonly provider: IChatSessionItemProvider,
	) { }

	setTree(tree: WorkbenchAsyncDataTree<IChatSessionItemProvider, ChatSessionItemWithProvider, FuzzyScore>): void {
		this.tree = tree;
	}

	/**
	 * Converts a session to searchable text combining label, id and description
	 */
	private getSearchableText(session: ChatSessionItemWithProvider): string {
		const parts = [
			session.label || '',
			session.id || '',
			typeof session.description === 'string' ? session.description : (session.description?.value || '')
		];
		return parts.filter(text => text.length > 0).join(' ');
	}

	/**
	 * Word-based fuzzy matching: each search word must appear in the searchable text in order
	 * but can be separated by other text
	 */
	private matches(pattern: string, searchableText: string, matchType: TreeFindMatchType): boolean {
		if (!pattern) {
			return true;
		}

		const textLower = searchableText.toLowerCase();

		if (matchType === TreeFindMatchType.Contiguous) {
			// Exact substring match
			return textLower.includes(pattern.toLowerCase());
		}

		// Word-based fuzzy matching (default)
		const words = pattern.split(/\s+/).filter(w => w.length > 0);
		let currentPosition = 0;

		// Each word must appear in order in the text
		for (const word of words) {
			const wordLower = word.toLowerCase();
			const foundIndex = textLower.indexOf(wordLower, currentPosition);

			if (foundIndex === -1) {
				return false; // Word not found
			}

			currentPosition = foundIndex + wordLower.length;
		}

		return true; // All words found in order
	}

	/**
	 * Gets all rendered sessions from the tree's visible nodes, including nested/collapsed items
	 */
	private getAllSessionsFromTree(): ChatSessionItemWithProvider[] {
		if (!this.tree) {
			return [];
		}

		const sessions: ChatSessionItemWithProvider[] = [];

		// Get the provider node
		if (!this.tree.hasNode(this.provider)) {
			return sessions;
		}

		// Recursively collect all session nodes
		const collectSessions = (node: ITreeNode<ChatSessionItemWithProvider | IChatSessionItemProvider, FuzzyScore>) => {
			if (node.children) {
				for (const child of node.children) {
					// Filter out the provider node itself, keep only items with an id
					if (child.element && child.element !== this.provider && 'id' in child.element) {
						sessions.push(child.element as ChatSessionItemWithProvider);
					}
					// Recursively collect from nested children
					collectSessions(child);
				}
			}
		};

		const providerNode = this.tree.getNode(this.provider);
		collectSessions(providerNode);

		return sessions;
	}

	async find(pattern: string, toggles: IAsyncFindToggles, token: CancellationToken): Promise<IAsyncFindResult<ChatSessionItemWithProvider> | undefined> {
		this.pattern = pattern;
		this.matchType = toggles.matchType;
		this.matchedSessions.clear();
		this.isSearchActive = true; // Mark search as active

		// Get all sessions from the tree's rendered nodes (fast, no async I/O)
		const allSessions = this.getAllSessionsFromTree();

		// Count matches synchronously
		let matchCount = 0;
		for (const session of allSessions) {
			const searchableText = this.getSearchableText(session);
			if (this.matches(this.pattern, searchableText, this.matchType)) {
				this.matchedSessions.add(session);
				matchCount++;
			}
		}

		if (this.tree) {
			this.tree.refilter();
		}

		// If we found matches, return result with isMatch callback that uses the pre-calculated set
		if (matchCount > 0) {
			return {
				matchCount,
				isMatch: (session: ChatSessionItemWithProvider) => {
					return this.matchedSessions.has(session);
				}
			};
		}

		// If we found no matches, return undefined to allow the tree's built-in matching to run
		// This prevents showing "No results found" when the built-in fuzzy matcher might have hits
		return undefined;
	}

	isVisible(element: ChatSessionItemWithProvider): boolean {
		// If no search is active, show everything
		if (!this.isSearchActive) {
			return true;
		}

		// If this element matches, show it
		if (this.matchedSessions.has(element)) {
			return true;
		}

		// For parent/group nodes (nodes that have children in the tree),
		// check if any descendant matches. Only show parent if it has matching children.
		if (this.tree && this.tree.hasNode(element)) {
			const node = this.tree.getNode(element);
			if (node.children && node.children.length > 0) {
				// Check if any child (recursively) has a match
				const hasMatchingChild = this.hasMatchingDescendant(node);
				if (hasMatchingChild) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Recursively checks if a node or any of its descendants have a matching session
	 */
	private hasMatchingDescendant(node: ITreeNode<ChatSessionItemWithProvider | IChatSessionItemProvider, FuzzyScore>): boolean {
		if (!node.children) {
			return false;
		}

		for (const child of node.children) {
			// Only check elements that are actual sessions
			if (child.element && this.matchedSessions.has(child.element as ChatSessionItemWithProvider)) {
				return true;
			}
			// Recursively check descendants
			if (this.hasMatchingDescendant(child)) {
				return true;
			}
		}

		return false;
	}

	startSession(): void {
		this.matchedSessions.clear();
		this.pattern = '';
		this.isSearchActive = false;
	}

	async endSession(): Promise<void> {
		this.matchedSessions.clear();
		this.pattern = '';
		this.isSearchActive = false;
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
		private readonly viewId: string,
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
		this.minimumBodySize = 44;

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

		if (provider) { // TODO: Why can this be undefined?
			this.scopedContextKeyService.createKey('chatSessionType', provider.chatSessionType);
		}
	}

	override shouldShowWelcome(): boolean {
		return this._isEmpty;
	}

	public override createActionViewItem(action: IAction, options: IBaseActionViewItemOptions): IActionViewItem | undefined {
		if (action.id.startsWith(NEW_CHAT_SESSION_ACTION_ID)) {
			return this.getChatSessionDropdown(action, options);
		}
		return super.createActionViewItem(action, options);
	}

	private getChatSessionDropdown(defaultAction: IAction, options: IBaseActionViewItemOptions) {
		const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
			id: defaultAction.id,
			title: defaultAction.label,
			icon: Codicon.plus,
		}, undefined, undefined, undefined, undefined);

		const menu = this.menuService.createMenu(MenuId.ChatSessionsMenu, this.scopedContextKeyService);

		const actions = menu.getActions({ shouldForwardArgs: true });
		const primaryActions = getActionBarActions(
			actions,
			'submenu',
		).primary.filter(action => {
			if (action instanceof MenuItemAction && defaultAction instanceof MenuItemAction) {
				if (!action.item.source?.id || !defaultAction.item.source?.id) {
					return false;
				}
				if (action.item.source.id === defaultAction.item.source.id) {
					return true;
				}
			}
			return false;
		});

		if (!primaryActions || primaryActions.length === 0) {
			return;
		}

		const dropdownAction = new Action(
			'selectNewChatSessionOption',
			nls.localize('chatSession.selectOption', 'More...'),
			'codicon-chevron-down',
			true
		);

		const dropdownActions: IAction[] = [];

		primaryActions.forEach(element => {
			dropdownActions.push(element);
		});

		return this.instantiationService.createInstance(
			DropdownWithPrimaryActionViewItem,
			primaryAction,
			dropdownAction,
			dropdownActions,
			'',
			options
		);
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

		container.classList.add('chat-sessions-view');

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
		const findProvider = new ChatSessionsFindProvider(this.provider);

		// Use the existing ResourceLabels service for consistent styling
		const renderer = this.instantiationService.createInstance(SessionsRenderer, this.viewDescriptorService.getViewLocationById(this.viewId));
		this._register(renderer);

		const getResourceForElement = (element: ChatSessionItemWithProvider): URI | null => {
			if (element.id === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID) {
				return null;
			}

			return element.resource;
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
						return nls.localize('chatSessions.dragLabel', "{0} agent sessions", elements.length);
					},
					drop: () => { },
					onDragOver: () => false,
					dispose: () => { },
				},
				accessibilityProvider,
				identityProvider,
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (session: ChatSessionItemWithProvider) => {
						const parts = [
							session.label || '',
							session.id || '',
							typeof session.description === 'string' ? session.description : (session.description?.value || '')
						];
						return parts.filter(text => text.length > 0).join(' ');
					}
				},
				multipleSelectionSupport: false,
				overrideStyles: {
					listBackground: undefined
				},
				paddingBottom: SessionsDelegate.ITEM_HEIGHT,
				setRowLineHeight: false,
				defaultFindMatchType: TreeFindMatchType.Contiguous,
				defaultFindMode: TreeFindMode.Filter,
				findProvider
			}
		) as WorkbenchAsyncDataTree<IChatSessionItemProvider, ChatSessionItemWithProvider, FuzzyScore>;

		// Set the tree reference in the find provider for accessing node data
		findProvider.setTree(this.tree);

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

		this._register(this.tree.onMouseDblClick(e => {
			const scrollingByPage = this.configurationService.getValue<boolean>('workbench.list.scrollByPage');
			if (e.element === null && !scrollingByPage) {
				if (this.provider?.chatSessionType && this.provider.chatSessionType !== localChatSessionType) {
					this.commandService.executeCommand(`workbench.action.chat.openNewSessionEditor.${this.provider?.chatSessionType}`);
				} else {
					this.commandService.executeCommand(ACTION_ID_OPEN_CHAT);
				}
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
		try {
			// Check first if we already have an open editor for this session
			const existingEditor = findExistingChatEditorByUri(session.resource, this.editorGroupsService);
			if (existingEditor) {
				await this.editorService.openEditor(existingEditor.editor, existingEditor.group);
				return;
			}
			if (this.chatWidgetService.getWidgetBySessionResource(session.resource)) {
				return;
			}

			if (session.id === LocalChatSessionsProvider.HISTORY_NODE_ID) {
				// Don't try to open the "Show history..." node itself
				return;
			}

			if (session.id === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID) {
				await this.viewsService.openView(ChatViewId);
				return;
			}

			const options: IChatEditorOptions = {
				pinned: true,
				ignoreInView: true,
				title: {
					preferred: truncate(session.label, ChatEditorTitleMaxLength),
				},
				preserveFocus: true,
			};
			await this.editorService.openEditor({
				resource: session.resource,
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
		const sessionWithProvider = session;

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
