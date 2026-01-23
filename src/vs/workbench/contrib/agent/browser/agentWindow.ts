/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { $, append, clearNode, Dimension, h } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { IChatSessionFileChange } from '../../chat/common/chatSessionsService.js';
import { AgentTitleBarStatusWidget } from '../../chat/browser/agentSessions/experiments/agentTitleBarStatusWidget.js';
import { Event, ValueWithChangeEvent } from '../../../../base/common/event.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { isWindows, isLinux } from '../../../../base/common/platform.js';
import { SplitView, Orientation, Sizing } from '../../../../base/browser/ui/splitview/splitview.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IMultiDiffEditorModel, IDocumentDiffItem } from '../../../../editor/browser/widget/multiDiffEditor/model.js';
import { RefCounted } from '../../../../editor/browser/widget/diffEditor/utils.js';
import { IWorkbenchUIElementFactory } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { ITerminalService, ITerminalGroupService, ITerminalChatService, TerminalConnectionState } from '../../terminal/browser/terminal.js';
import { IEmbedderTerminalService } from '../../../services/terminal/common/embedderTerminalService.js';
import { AgentWelcomeView } from './agentWelcomeView.js';
import { AgentSessionController, AgentChatWidgetService, IAgentSessionElements, IAgentSessionCallbacks } from './agentSessionController.js';
import { IAgentSession, getAgentChangesSummary } from '../../chat/browser/agentSessions/agentSessionsModel.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';

// Side-effect import: Register terminal chat agent tools contribution
import '../../terminalContrib/chatAgentTools/browser/terminal.chatAgentTools.contribution.js';

export class AgentWindow extends Disposable {

	private _welcomeView: AgentWelcomeView | undefined;
	private _splitView: SplitView<number> | undefined;
	private _splitViewResizeObserver: ResizeObserver | undefined;
	private _sessionController: AgentSessionController | undefined;
	private _chatWidgetService: AgentChatWidgetService | undefined;

	// Layout elements populated by createLayout()
	private _elements: {
		header: { root: HTMLElement; statusWidget: HTMLElement };
		sessions: { root: HTMLElement; newSessionButton: HTMLElement; items: HTMLElement };
		chat: { root: HTMLElement; header: HTMLElement; headerTitle: HTMLElement; widgetContainer: HTMLElement; toggleChanges: HTMLElement };
		changes: { root: HTMLElement };
		container: HTMLElement;
	} | undefined;

	private get elements() {
		if (!this._elements) {
			throw new Error('AgentWindow layout not initialized');
		}
		return this._elements;
	}

	private _changesPaneVisible: boolean = false;
	private _changesEmptyEl: HTMLElement | undefined;
	private _multiDiffEditorContainer: HTMLElement | undefined;
	private _multiDiffEditor: MultiDiffEditorWidget | undefined;
	private _multiDiffModelStore: DisposableStore | undefined;
	private _changesResizeObserver: ResizeObserver | undefined;

	constructor(
		private readonly instantiationService: IInstantiationService,
		private readonly logService: ILogService
	) {
		super();
	}

	/**
	 * Shows a status message in the given container using DOM utilities.
	 */
	private showStatusMessage(container: HTMLElement, message: string, className: string = 'agent-sessions-empty'): void {
		clearNode(container);
		const messageEl = $(`.${className}`);
		messageEl.textContent = message;
		append(container, messageEl);
	}

	private _createHeaderElements() {
		const statusWidget = $('div.agent-status-widget');
		const elements = h('div.agent-header@root', [
			h('h1', ['Agent']),
			statusWidget,
		]);
		return { ...elements, statusWidget };
	}

	private _createSessionsElements() {
		const newSessionButton = $('div.agent-sessions-new-button-container');
		const items = $('div.agent-sessions-items');
		const elements = h('div.agent-sessions-list@root', [
			h('div.agent-sessions-header', [
				h('span.agent-sessions-header-title', ['Sessions']),
				h('div.agent-sessions-toolbar'),
			]),
			newSessionButton,
			items,
		]);
		return { ...elements, newSessionButton, items };
	}

	private _createChatElements() {
		const backButton = $('div.agent-chat-back-button.codicon.codicon-arrow-left');
		backButton.title = 'Back to Sessions';
		backButton.tabIndex = 0;
		backButton.setAttribute('role', 'button');
		backButton.addEventListener('click', () => this.showEmptyView());

		const toggleChanges = $('div.agent-toggle-changes-button.codicon.codicon-layout-sidebar-right-off');
		toggleChanges.title = 'Show Changes';
		toggleChanges.tabIndex = 0;
		toggleChanges.setAttribute('role', 'button');
		toggleChanges.addEventListener('click', () => this.toggleChangesPane());

		const elements = h('div.agent-chat-container@root', [
			h('div.agent-chat-header@header', { style: { display: 'none' } }, [
				backButton,
				h('div.agent-chat-header-title@headerTitle'),
				toggleChanges,
			]),
			h('div.agent-chat-widget-container@widgetContainer'),
		]);

		return { ...elements, toggleChanges };
	}

	private _createChangesElements() {
		return h('div.agent-changes-container@root', [
			h('div.agent-changes-header', [
				h('span.agent-changes-header-title', ['Changes']),
			]),
		]);
	}

	/**
	 * Creates the agent window layout structure using h() for declarative DOM creation.
	 * Follows VS Code pattern of separate h() calls per logical section.
	 */
	private createLayout(): void {
		const body = mainWindow.document.body;

		// Create element sections
		const header = this._createHeaderElements();
		const sessions = this._createSessionsElements();
		const chat = this._createChatElements();
		const changes = this._createChangesElements();

		// Create welcome view
		this._welcomeView = this._register(this.instantiationService.createInstance(AgentWelcomeView));

		// Create main container - only add sessions and chat initially
		// Changes pane is added dynamically when a session is selected via showChangesPane()
		const container = $('div.agent-container');
		append(container, sessions.root, chat.root);

		// Add welcome view to chat container (before widget container)
		chat.root.insertBefore(this._welcomeView.root, chat.widgetContainer);

		// Store all elements
		this._elements = { header, sessions, chat, changes, container };

		// Create session controller with element references and callbacks
		const sessionElements: IAgentSessionElements = {
			sessionsItems: sessions.items,
			sessionsNewButtonContainer: sessions.newSessionButton,
			chatHeader: chat.header,
			chatHeaderTitle: chat.headerTitle,
			chatWidgetContainer: chat.widgetContainer,
		};
		const sessionCallbacks: IAgentSessionCallbacks = {
			showWelcomeView: () => this._welcomeView?.show(),
			hideWelcomeView: () => this._welcomeView?.hide(),
			updateChangesPane: (session) => this.updateChangesPane(session),
		};
		this._sessionController = this._register(this.instantiationService.createInstance(
			AgentSessionController,
			sessionElements,
			sessionCallbacks,
			this._chatWidgetService
		));

		// Append to body
		append(body, header.root, container);
	}

	/**
	 * Register the stub chat widget service before creating the workbench.
	 */
	registerChatWidgetService(serviceCollection: ServiceCollection): void {
		this._chatWidgetService = new AgentChatWidgetService();
		serviceCollection.set(IChatWidgetService, this._chatWidgetService);
	}

	/**
	 * Register the stub terminal services before creating the workbench
	 */
	registerTerminalServices(serviceCollection: ServiceCollection): void {
		serviceCollection.set(ITerminalGroupService, createAgentTerminalGroupService());
		serviceCollection.set(ITerminalService, createAgentTerminalService());
		serviceCollection.set(IEmbedderTerminalService, createAgentEmbedderTerminalService());
		serviceCollection.set(ITerminalChatService, createAgentTerminalChatService());
	}

	async startup(): Promise<void> {
		// Create the layout structure programmatically
		this.createLayout();

		this.initializeSplitView();

		try {
			this.showStatusMessage(this.elements.sessions.items, 'Loading sessions...');

			this.logService.info('[Agent] Services initialized, loading agent sessions...');

			// Start workbench contributions - this registers all MainThread* handlers
			this.logService.info('[Agent] Starting workbench contributions...');
			this.instantiationService.invokeFunction(accessor => {
				Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).start(accessor);
			});
			this.logService.info('[Agent] Workbench contributions started');

			// Trigger theme service to apply styles
			this.logService.info('[Agent] Applying theme styles...');
			const themeService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IWorkbenchThemeService));
			const currentTheme = themeService.getColorTheme();
			this.logService.info('[Agent] Current theme:', currentTheme.label, 'type:', currentTheme.type);

			// Apply theme type class to body (vs, vs-dark, hc-black, hc-light)
			const body = mainWindow.document.body;
			body.classList.add(`vs-${currentTheme.type === 'light' ? '' : currentTheme.type}`);
			if (currentTheme.type === 'light') {
				body.classList.add('vs');
			} else if (currentTheme.type === 'dark') {
				body.classList.add('vs-dark');
			} else if (currentTheme.type === 'hcDark' || currentTheme.type === 'hcLight') {
				body.classList.add(`hc-${currentTheme.type === 'hcDark' ? 'black' : 'light'}`);
			}

			// Apply platform class to body (mac, windows, linux) for font-family styling
			const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
			body.classList.add(platformClass);

			// Add agent status widget to title bar
			const action = new Action('workbench.action.quickchat.toggle', 'Chat');
			const statusWidget = this.instantiationService.createInstance(AgentTitleBarStatusWidget, action, undefined);
			statusWidget.render(this.elements.header.statusWidget);
			this._register(statusWidget);

			// Get the extension management service to query installed extensions
			const extensionManagementService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IWorkbenchExtensionManagementService)) as IWorkbenchExtensionManagementService;

			this.logService.info('[Agent] Checking installed extensions...');

			// Get installed extensions from the extension management service
			const installedExtensions = await extensionManagementService.getInstalled();

			this.logService.info('[Agent] Found', installedExtensions.length, 'extensions');

			// Show the welcome view immediately so user can start typing while sessions load
			this._sessionController?.showEmptyView();
			this.hideChangesPane();

			// Load agent sessions (runs in parallel with welcome view being ready)
			await this._sessionController?.loadSessions();

		} catch (error) {
			this.showStatusMessage(this.elements.sessions.items, `Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private initializeSplitView(): void {
		const container = this.elements.container;
		const sessionsContainer = this.elements.sessions.root;
		const chatContainer = this.elements.chat.root;

		container.style.display = 'block';
		container.style.position = 'relative';

		this._splitView = this._register(new SplitView<number>(container, { orientation: Orientation.HORIZONTAL }));
		this._splitView.addView({
			onDidChange: Event.None,
			element: sessionsContainer,
			minimumSize: 220,
			maximumSize: 520,
			layout: (width, _offset, height) => {
				sessionsContainer.style.width = `${width}px`;
				if (typeof height === 'number') {
					sessionsContainer.style.height = `${height}px`;
				}
			}
		}, 300);
		this._splitView.addView({
			onDidChange: Event.None,
			element: chatContainer,
			minimumSize: 320,
			maximumSize: Number.MAX_VALUE,
			layout: (width, _offset, height) => {
				chatContainer.style.width = `${width}px`;
				if (typeof height === 'number') {
					chatContainer.style.height = `${height}px`;
				}
			}
		}, Sizing.Distribute);

		// Note: Changes pane is added dynamically when a session is selected
		// Initially we only show 2 columns: sessions list | empty view placeholder
		this._changesPaneVisible = false;

		const layout = () => {
			if (!this._splitView) {
				return;
			}
			const rect = container.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				this._splitView.layout(rect.width, rect.height);
			}
		};

		layout();
		if (this._splitViewResizeObserver) {
			this._splitViewResizeObserver.disconnect();
		}
		this._splitViewResizeObserver = new ResizeObserver(() => layout());
		this._splitViewResizeObserver.observe(container);
		this._register({ dispose: () => this._splitViewResizeObserver?.disconnect() });
	}

	/**
	 * Shows the changes pane (3rd column) by adding it to the SplitView.
	 * Called when a session is selected.
	 */
	private showChangesPane(): void {
		if (this._changesPaneVisible || !this._splitView) {
			return;
		}

		const changesContainer = this.elements.changes.root;
		this._splitView.addView({
			onDidChange: Event.None,
			element: changesContainer,
			minimumSize: 300,
			maximumSize: Number.MAX_VALUE,
			layout: (width, _offset, height) => {
				changesContainer.style.width = `${width}px`;
				if (typeof height === 'number') {
					changesContainer.style.height = `${height}px`;
				}
			}
		}, Sizing.Distribute, 2); // Add at index 2 (after sessions and chat)

		this._changesPaneVisible = true;
		this.updateToggleChangesButtonLabel();
	}

	/**
	 * Hides the changes pane (3rd column) by removing it from the SplitView.
	 * Called when returning to the empty/welcome view or when user toggles it off.
	 */
	private hideChangesPane(): void {
		if (!this._changesPaneVisible || !this._splitView) {
			return;
		}

		// Clean up the changes pane content
		this.disposeMultiDiffEditor();

		// Remove the changes view from SplitView (it's at index 2)
		this._splitView.removeView(2);
		this._changesPaneVisible = false;
		this.updateToggleChangesButtonLabel();
	}

	/**
	 * Toggles the changes pane visibility.
	 * Called when the user clicks the toggle button in the header.
	 */
	private toggleChangesPane(): void {
		if (this._changesPaneVisible) {
			this.hideChangesPane();
		} else {
			this.showChangesPane();
		}
	}

	/**
	 * Updates the toggle changes button icon to reflect current visibility state.
	 */
	private updateToggleChangesButtonLabel(): void {
		const toggleChangesButton = this.elements.chat.toggleChanges;
		if (this._changesPaneVisible) {
			toggleChangesButton.classList.remove('codicon-layout-sidebar-right-off');
			toggleChangesButton.classList.add('codicon-layout-sidebar-right');
			toggleChangesButton.title = 'Hide Changes';
		} else {
			toggleChangesButton.classList.remove('codicon-layout-sidebar-right');
			toggleChangesButton.classList.add('codicon-layout-sidebar-right-off');
			toggleChangesButton.title = 'Show Changes';
		}
	}

	/**
	 * Updates the changes pane with file changes from the selected session.
	 * Uses MultiDiffEditorWidget to show all file diffs at once.
	 */
	private async updateChangesPane(session: IAgentSession | undefined): Promise<void> {
		// Dispose previous model store
		this.disposeMultiDiffEditor();

		if (!session) {
			this.showChangesEmpty('Select a session to view changes');
			return;
		}

		const changes = session.changes;
		if (!changes) {
			this.showChangesEmpty('No changes in this session');
			return;
		}

		// Handle both detailed changes array and summary object
		if (!Array.isArray(changes)) {
			// Summary object - show summary message
			const summary = getAgentChangesSummary(changes);
			if (!summary || summary.files === 0) {
				this.showChangesEmpty('No file changes');
				return;
			}
			this.showChangesEmpty(`${summary.files} file${summary.files > 1 ? 's' : ''} changed (+${summary.insertions} -${summary.deletions})`);
			return;
		}

		const fileChanges = changes as IChatSessionFileChange[];
		if (fileChanges.length === 0) {
			this.showChangesEmpty('No file changes');
			return;
		}

		const textModelService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) =>
			accessor.get(ITextModelService)
		);

		// Hide empty message if showing
		if (this._changesEmptyEl) {
			this._changesEmptyEl.style.display = 'none';
		}

		// Create multi-diff editor if not exists
		if (!this._multiDiffEditor) {
			this._multiDiffEditorContainer = $('.agent-multi-diff-editor');
			this._multiDiffEditorContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden;';
			append(this.elements.changes.root, this._multiDiffEditorContainer);

			const workbenchUIElementFactory: IWorkbenchUIElementFactory = {};
			this._multiDiffEditor = this._register(this.instantiationService.createInstance(
				MultiDiffEditorWidget,
				this._multiDiffEditorContainer,
				workbenchUIElementFactory,
			));

			// Set up resize observer
			this._changesResizeObserver = new ResizeObserver(() => this.layoutMultiDiffEditor());
			this._changesResizeObserver.observe(this.elements.changes.root);
			this._register({ dispose: () => this._changesResizeObserver?.disconnect() });
		}

		// Show the editor container
		if (this._multiDiffEditorContainer) {
			this._multiDiffEditorContainer.style.display = 'flex';
		}

		// Create document items from file changes
		this._multiDiffModelStore = new DisposableStore();
		const documents: RefCounted<IDocumentDiffItem>[] = [];

		for (const change of fileChanges) {
			try {
				const modifiedRef = await textModelService.createModelReference(change.modifiedUri);
				this._multiDiffModelStore.add(modifiedRef);

				let originalRef: IReference<IResolvedTextEditorModel> | undefined;
				if (change.originalUri) {
					originalRef = await textModelService.createModelReference(change.originalUri);
					this._multiDiffModelStore.add(originalRef);
				}

				const docItem: IDocumentDiffItem = {
					original: originalRef?.object.textEditorModel,
					modified: modifiedRef.object.textEditorModel,
				};

				documents.push(RefCounted.createOfNonDisposable(docItem, { dispose: () => { } }, this));
			} catch (error) {
				this.logService.error('[Agent] Error loading file for diff:', error);
			}
		}

		if (documents.length === 0) {
			this.showChangesEmpty('Could not load file changes');
			return;
		}

		// Create and set model
		const model: IMultiDiffEditorModel = {
			documents: ValueWithChangeEvent.const(documents),
		};

		const viewModel = this._multiDiffEditor.createViewModel(model);
		this._multiDiffEditor.setViewModel(viewModel);
		this.layoutMultiDiffEditor();
	}

	/**
	 * Shows an empty/message state in the changes pane.
	 */
	private showChangesEmpty(message: string): void {
		// Hide multi-diff editor if showing empty
		if (this._multiDiffEditor) {
			this._multiDiffEditor.setViewModel(undefined);
		}
		if (this._multiDiffEditorContainer) {
			this._multiDiffEditorContainer.style.display = 'none';
		}

		// Update or create empty message element
		if (this._changesEmptyEl) {
			this._changesEmptyEl.textContent = message;
			this._changesEmptyEl.style.display = 'block';
		} else {
			this._changesEmptyEl = $('.agent-changes-empty');
			this._changesEmptyEl.textContent = message;
			append(this.elements.changes.root, this._changesEmptyEl);
		}
	}

	/**
	 * Layouts the multi-diff editor to fit its container.
	 */
	private layoutMultiDiffEditor(): void {
		if (this._multiDiffEditor && this._elements) {
			const rect = this.elements.changes.root.getBoundingClientRect();
			const headerHeight = 40; // Approximate header height
			if (rect.width > 0 && rect.height > headerHeight) {
				this._multiDiffEditor.layout(new Dimension(rect.width, rect.height - headerHeight));
			}
		}
	}

	/**
	 * Disposes the multi-diff editor model store.
	 */
	private disposeMultiDiffEditor(): void {
		if (this._multiDiffModelStore) {
			this._multiDiffModelStore.dispose();
			this._multiDiffModelStore = undefined;
		}

		if (this._multiDiffEditor) {
			this._multiDiffEditor.setViewModel(undefined);
		}
	}

	private showEmptyView(): void {
		this._sessionController?.showEmptyView();
		// Hide the changes pane (return to 2-column layout)
		this.hideChangesPane();
	}
}

/**
 * Creates a stub ITerminalGroupService for Agent Window.
 * Provides empty terminal state so terminal chat tools get valid responses.
 */
export function createAgentTerminalGroupService(): ITerminalGroupService {
	const service = {
		_serviceBrand: undefined,
		activeInstance: undefined,
		instances: [],
		groups: [],
		activeGroup: undefined,
		activeGroupIndex: 0,
		lastAccessedMenu: 'inline-tab',
		onDidChangeActiveGroup: Event.None,
		onDidDisposeGroup: Event.None,
		onDidShow: Event.None,
		onDidChangeGroups: Event.None,
		onDidChangePanelOrientation: Event.None,
		onDidDisposeInstance: Event.None,
		onDidFocusInstance: Event.None,
		onDidChangeInstanceCapability: Event.None,
		onDidChangeActiveInstance: Event.None,
		onDidChangeInstances: Event.None,
		createGroup: () => { throw new Error('Not implemented in Agent Window'); },
		getGroupForInstance: () => undefined,
		moveGroup: () => { },
		moveGroupToEnd: () => { },
		moveInstance: () => { },
		unsplitInstance: () => { },
		joinInstances: () => { },
		instanceIsSplit: () => false,
		getGroupLabels: () => [],
		setActiveGroupByIndex: () => { },
		setActiveGroupToNext: () => { },
		setActiveGroupToPrevious: () => { },
		setActiveInstanceByIndex: () => { },
		setContainer: () => { },
		showPanel: async () => { },
		hidePanel: () => { },
		focusTabs: () => { },
		focusHover: () => { },
		setActiveInstance: () => { },
		focusActiveInstance: async () => { },
		focusInstance: async () => { },
		getInstanceFromResource: () => undefined,
		focusFindWidget: () => { },
		hideFindWidget: () => { },
		findNext: () => { },
		findPrevious: () => { },
		updateVisibility: () => { },
	};
	return service as unknown as ITerminalGroupService;
}

/**
 * Creates a stub ITerminalService for Agent Window.
 * Provides empty terminal state so terminal chat tools get valid responses.
 */
export function createAgentTerminalService(): ITerminalService {
	const service = {
		_serviceBrand: undefined,
		instances: [],
		foregroundInstances: [],
		detachedInstances: [],
		isProcessSupportRegistered: false,
		connectionState: TerminalConnectionState.Connected,
		whenConnected: Promise.resolve(),
		restoredGroupCount: 0,
		activeInstance: undefined,
		onDidCreateInstance: Event.None,
		onDidChangeInstanceDimensions: Event.None,
		onDidRequestStartExtensionTerminal: Event.None,
		onDidRegisterProcessSupport: Event.None,
		onDidChangeConnectionState: Event.None,
		onDidChangeActiveGroup: Event.None,
		onAnyInstanceData: Event.None,
		onAnyInstanceDataInput: Event.None,
		onAnyInstanceIconChange: Event.None,
		onAnyInstanceMaximumDimensionsChange: Event.None,
		onAnyInstancePrimaryStatusChange: Event.None,
		onAnyInstanceProcessIdReady: Event.None,
		onAnyInstanceSelectionChange: Event.None,
		onAnyInstanceTitleChange: Event.None,
		onAnyInstanceShellTypeChanged: Event.None,
		onAnyInstanceAddedCapabilityType: Event.None,
		onDidDisposeInstance: Event.None,
		onDidFocusInstance: Event.None,
		onDidChangeActiveInstance: Event.None,
		onDidChangeInstances: Event.None,
		onDidChangeInstanceCapability: Event.None,
		createTerminal: async () => { throw new Error('Not implemented in Agent Window'); },
		createAndFocusTerminal: async () => { throw new Error('Not implemented in Agent Window'); },
		createDetachedTerminal: async () => { throw new Error('Not implemented in Agent Window'); },
		getInstanceFromId: () => undefined,
		getReconnectedTerminals: () => undefined,
		getActiveOrCreateInstance: async () => { throw new Error('Not implemented in Agent Window'); },
		revealTerminal: async () => { },
		showBackgroundTerminal: async () => { },
		revealActiveTerminal: async () => { },
		moveToEditor: () => { },
		moveIntoNewEditor: () => { },
		moveToTerminalView: async () => { },
		getPrimaryBackend: () => undefined,
		setNextCommandId: async () => { },
		refreshActiveGroup: () => { },
		registerProcessSupport: () => { },
		showProfileQuickPick: async () => undefined,
		setContainers: () => { },
		createOnInstanceEvent: () => ({
			event: Event.None,
			dispose: () => { },
		}),
		createOnInstanceCapabilityEvent: () => ({
			event: Event.None,
			dispose: () => { },
		}),
	};
	return service as unknown as ITerminalService;
}

/**
 * Creates a stub IEmbedderTerminalService for Agent Window.
 * Provides empty embedder terminal state.
 */
export function createAgentEmbedderTerminalService(): IEmbedderTerminalService {
	const service = {
		_serviceBrand: undefined,
		onDidCreateTerminal: Event.None,
		createTerminal: () => { },
	};
	return service as unknown as IEmbedderTerminalService;
}

/**
 * Creates a stub ITerminalChatService for Agent Window.
 * Manages terminal instances associated with chat sessions.
 */
export function createAgentTerminalChatService(): ITerminalChatService {
	const service = {
		_serviceBrand: undefined,
		onDidRegisterTerminalInstanceWithToolSession: Event.None,
		registerTerminalInstanceWithToolSession: () => { },
		getTerminalInstanceByToolSessionId: async () => undefined,
		getToolSessionTerminalInstances: () => [],
		getToolSessionIdForInstance: () => undefined,
		registerTerminalInstanceWithChatSession: () => { },
		getChatSessionResourceForInstance: () => undefined,
		getChatSessionIdForInstance: () => undefined,
		isBackgroundTerminal: () => false,
		registerProgressPart: () => ({ dispose: () => { } }),
		setFocusedProgressPart: () => { },
		clearFocusedProgressPart: () => { },
		getFocusedProgressPart: () => undefined,
		getMostRecentProgressPart: () => undefined,
		setChatSessionAutoApproval: () => { },
		hasChatSessionAutoApproval: () => false,
		addSessionAutoApproveRule: () => { },
		getSessionAutoApproveRules: () => ({}),
	};
	return service as unknown as ITerminalChatService;
}
