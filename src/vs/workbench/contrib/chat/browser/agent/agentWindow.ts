/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../../base/common/actions.js';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatWidget, IChatWidgetService, ISessionTypePickerDelegate } from '../chat.js';
import { ChatWidget, IChatWidgetStyles } from '../widget/chatWidget.js';
import { LocalAgentsSessionsProvider } from '../agentSessions/localAgentSessionsProvider.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { AgentSessionsControl, IAgentSessionsControlOptions } from '../agentSessions/agentSessionsControl.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IAgentSession } from '../agentSessions/agentSessionsModel.js';
import { IAgentSessionsFilter } from '../agentSessions/agentSessionsViewer.js';
import { AgentTitleBarStatusWidget } from '../agentSessions/experiments/agentTitleBarStatusWidget.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../common/contributions.js';
import { IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { isWindows, isLinux } from '../../../../../base/common/platform.js';
import { SplitView, Orientation, Sizing } from '../../../../../base/browser/ui/splitview/splitview.js';
import { editorForeground, editorBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * Stub chat widget service for Agent window
 * Delegates openSession to a callback handler
 */
class AgentChatWidgetService implements IChatWidgetService {
	declare readonly _serviceBrand: undefined;

	readonly lastFocusedWidget = undefined;
	readonly onDidAddWidget = Event.None;
	readonly onDidBackgroundSession = Event.None;

	private _openSessionHandler: ((resource: URI) => Promise<IChatWidget | undefined>) | undefined;

	setOpenSessionHandler(handler: (resource: URI) => Promise<IChatWidget | undefined>): void {
		this._openSessionHandler = handler;
	}

	async reveal(_widget: IChatWidget, _preserveFocus?: boolean): Promise<boolean> { return false; }
	async revealWidget(_preserveFocus?: boolean): Promise<IChatWidget | undefined> { return undefined; }

	getAllWidgets(): ReadonlyArray<IChatWidget> { return []; }
	getWidgetByInputUri(): IChatWidget | undefined { return undefined; }
	getWidgetBySessionResource(): IChatWidget | undefined { return undefined; }
	getWidgetsByLocations(): ReadonlyArray<IChatWidget> { return []; }

	async openSession(sessionResource: URI): Promise<IChatWidget | undefined> {
		if (this._openSessionHandler) {
			return this._openSessionHandler(sessionResource);
		}
		return undefined;
	}

	register(): IDisposable { return { dispose: () => { } }; }
}

// Create a trusted types policy for agent window HTML
const ttPolicy = createTrustedTypesPolicy('agentWindow', { createHTML: value => value });

export class AgentWindow extends Disposable {

	private _chatWidget: ChatWidget | undefined;
	private _welcomeChatWidget: ChatWidget | undefined;
	private _chatWidgetContainer: HTMLElement | undefined;
	private _resizeObserver: ResizeObserver | undefined;
	private _sessionsControl: AgentSessionsControl | undefined;
	private _sessionsResizeObserver: ResizeObserver | undefined;
	private _chatWidgetService: AgentChatWidgetService | undefined;
	private _splitView: SplitView<number> | undefined;
	private _splitViewResizeObserver: ResizeObserver | undefined;

	// Layout elements created programmatically
	private _headerEl!: HTMLElement;
	private _statusWidgetContainer!: HTMLElement;
	private _containerEl!: HTMLElement;
	private _sessionsListEl!: HTMLElement;
	private _sessionsItemsEl!: HTMLElement;
	private _newSessionButton!: HTMLButtonElement;
	private _chatContainerEl!: HTMLElement;
	private _chatEmptyEl!: HTMLElement;
	private _welcomeChatWidgetEl!: HTMLElement;
	private _chatWidgetContainerEl!: HTMLElement;

	constructor(
		private readonly instantiationService: IInstantiationService,
		private readonly logService: ILogService
	) {
		super();
	}

	private setInnerHTML(element: HTMLElement, html: string): void {
		if (ttPolicy) {
			element.innerHTML = ttPolicy.createHTML(html) as unknown as string;
		} else {
			element.innerHTML = html;
		}
	}

	/**
	 * Creates the agent window layout structure programmatically.
	 * This follows VS Code's pattern of using dom.$ and dom.h instead of static HTML.
	 */
	private createLayout(): void {
		const body = mainWindow.document.body;

		// Create header
		this._headerEl = $('.agent-header');
		const title = $('h1');
		title.textContent = 'Agent';
		this._statusWidgetContainer = $('.agent-status-widget');
		append(this._headerEl, title, this._statusWidgetContainer);

		// Create sessions list
		this._sessionsListEl = $('.agent-sessions-list');
		const sessionsHeader = $('.agent-sessions-header');
		const sessionsHeaderTitle = $('span.agent-sessions-header-title');
		sessionsHeaderTitle.textContent = 'Sessions';
		const sessionsToolbar = $('.agent-sessions-toolbar');
		this._newSessionButton = $('button.agent-sessions-toolbar-button') as HTMLButtonElement;
		this._newSessionButton.title = 'New Session';
		const addIcon = $(`i.codicon.${ThemeIcon.asClassName(Codicon.add)}`);
		append(this._newSessionButton, addIcon);
		append(sessionsToolbar, this._newSessionButton);
		append(sessionsHeader, sessionsHeaderTitle, sessionsToolbar);
		this._sessionsItemsEl = $('.agent-sessions-items');
		append(this._sessionsListEl, sessionsHeader, this._sessionsItemsEl);

		// Create chat container
		this._chatContainerEl = $('.agent-chat-container');

		// Create empty/welcome view
		this._chatEmptyEl = $('.agent-chat-empty');
		const welcomeContent = $('.agent-welcome-content');
		const welcomeTitle = $('.agent-welcome-title');
		welcomeTitle.textContent = 'Start a New Session';
		this._welcomeChatWidgetEl = $('.agent-welcome-chat-widget');
		const welcomeDescription = $('.agent-chat-empty-description');
		welcomeDescription.textContent = 'Describe what you want to build or ask a question to start a new agent session';
		append(welcomeContent, welcomeTitle, this._welcomeChatWidgetEl, welcomeDescription);
		append(this._chatEmptyEl, welcomeContent);

		// Create chat widget container
		this._chatWidgetContainerEl = $('.agent-chat-widget-container');
		append(this._chatContainerEl, this._chatEmptyEl, this._chatWidgetContainerEl);

		// Create main container
		this._containerEl = $('.agent-container');
		append(this._containerEl, this._sessionsListEl, this._chatContainerEl);

		// Append to body
		append(body, this._headerEl, this._containerEl);
	}

	/**
	 * Register the stub chat widget service before creating the workbench
	 */
	registerChatWidgetService(serviceCollection: ServiceCollection): void {
		this._chatWidgetService = new AgentChatWidgetService();
		serviceCollection.set(IChatWidgetService, this._chatWidgetService);
	}

	async startup(): Promise<void> {
		// Create the layout structure programmatically
		this.createLayout();

		this.initializeSplitView();

		try {
			this.setInnerHTML(this._sessionsItemsEl, '<div class="agent-sessions-empty">Loading sessions...</div>');

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
			statusWidget.render(this._statusWidgetContainer);
			this._register(statusWidget);

			// Get the extension management service to query installed extensions
			const extensionManagementService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IWorkbenchExtensionManagementService)) as IWorkbenchExtensionManagementService;

			this.logService.info('[Agent] Checking installed extensions...');

			// Get installed extensions from the extension management service
			const installedExtensions = await extensionManagementService.getInstalled();

			this.logService.info('[Agent] Found', installedExtensions.length, 'extensions');

			// Load agent sessions
			await this.loadSessions();

			// Add click handler for new session button
			this._newSessionButton.addEventListener('click', () => this.showEmptyView());

			// Show the welcome view by default when opening the agent window
			this.showEmptyView();

		} catch (error) {
			this.setInnerHTML(this._sessionsItemsEl, `<div class="agent-sessions-empty">Error: ${error instanceof Error ? error.message : String(error)}</div>`);
		}
	}

	private initializeSplitView(): void {
		const container = this._containerEl;
		const sessionsContainer = this._sessionsListEl;
		const chatContainer = this._chatContainerEl;

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

	private async loadSessions(): Promise<void> {
		const sessionsListEl = this._sessionsItemsEl;

		try {
			// Trigger lifecycle phase Ready to allow extension hosts to start
			// The NativeExtensionService waits for LifecyclePhase.Ready before initializing
			const lifecycleService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(ILifecycleService));
			this.logService.info('[Agent] Setting lifecycle phase to Ready...');
			lifecycleService.phase = LifecyclePhase.Ready;

			// Wait for extensions to be registered first
			// This ensures that extension-provided session providers are available
			const extensionService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IExtensionService));
			this.logService.info('[Agent] Waiting for extensions to be registered...');
			await extensionService.whenInstalledExtensionsRegistered();
			this.logService.info('[Agent] Extensions registered!');

			// First, manually instantiate the LocalAgentsSessionsProvider
			// This is needed because it's a workbench contribution that registers itself
			// with IChatSessionsService, but we don't have the full workbench lifecycle
			const localProvider = this._register(this.instantiationService.createInstance(LocalAgentsSessionsProvider));
			this.logService.info('[Agent] LocalAgentsSessionsProvider instantiated:', localProvider.chatSessionType);

			// Get the chat sessions service which aggregates all providers
			const chatSessionsService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IChatSessionsService));

			// Get the agent sessions service - accessing .model triggers lazy loading
			const agentSessionsService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IAgentSessionsService));

			// Debug: log available contributions
			const allContributions = chatSessionsService.getAllChatSessionContributions();
			this.logService.info('[Agent] Registered contributions:', allContributions.length, allContributions.map(c => c.type));

			// Clear loading message
			this.setInnerHTML(sessionsListEl, '');

			// Create a simple pass-through filter (show all sessions)
			const filterChangeEmitter = this._register(new Emitter<void>());
			const filter: IAgentSessionsFilter = {
				onDidChange: filterChangeEmitter.event,
				exclude: () => false, // Don't exclude any session
				getExcludes: () => ({
					providers: [],
					states: [],
					archived: false,
					read: false,
				}),
			};

			// Create AgentSessionsControl options
			const options: IAgentSessionsControlOptions = {
				overrideStyles: {
					listBackground: 'transparent',
				},
				filter,
				source: 'agentWindow',
				getHoverPosition: () => HoverPosition.RIGHT,
				trackActiveEditorSession: () => false, // We don't track active editor in agent window
			};

			// Create the AgentSessionsControl
			this.logService.info('[Agent] Creating AgentSessionsControl...');
			this._sessionsControl = this._register(this.instantiationService.createInstance(
				AgentSessionsControl,
				sessionsListEl,
				options
			));

			// Handle session opens by delegating to our ChatWidget display
			// The AgentSessionsControl calls chatWidgetService.openSession() which we intercept
			if (this._chatWidgetService) {
				this._chatWidgetService.setOpenSessionHandler(async (resource: URI) => {
					const session = agentSessionsService.model.getSession(resource);
					if (session) {
						await this.selectSession(session);
						return this._chatWidget;
					}
					return undefined;
				});
			}

			const model = agentSessionsService.model;
			this.logService.info('[Agent] Model sessions count:', model.sessions.length);

			// Set up resize observer for sessions list layout
			if (this._sessionsResizeObserver) {
				this._sessionsResizeObserver.disconnect();
			}
			this._sessionsResizeObserver = new ResizeObserver(() => {
				if (this._sessionsControl && sessionsListEl) {
					const rect = sessionsListEl.getBoundingClientRect();
					if (rect.height > 0 && rect.width > 0) {
						this._sessionsControl.layout(rect.height, rect.width);
					}
				}
			});
			this._sessionsResizeObserver.observe(sessionsListEl);

			// Initial layout
			const initialRect = sessionsListEl.getBoundingClientRect();
			if (initialRect.height > 0 && initialRect.width > 0) {
				this._sessionsControl.layout(initialRect.height, initialRect.width);
			}

			this.logService.info('[Agent] AgentSessionsControl created');

		} catch (error) {
			this.logService.error('[Agent] Error loading sessions:', error);
			this.setInnerHTML(sessionsListEl, `<div class="agent-sessions-empty">Failed to load sessions: ${error instanceof Error ? error.message : String(error)}</div>`);
		}
	}

	private async selectSession(session: IAgentSession): Promise<void> {
		this._chatEmptyEl.style.display = 'none';

		const chatWidgetContainer = this._chatWidgetContainerEl;
		chatWidgetContainer.style.display = 'flex';

		// Show loading state
		this.setInnerHTML(chatWidgetContainer, `
			<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground, #9d9d9d);">
				<div style="font-size: 14px;">Loading session...</div>
			</div>
		`);

		try {
			// Get services
			const chatService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IChatService));
			const chatSessionsService = this.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IChatSessionsService));

			// Ensure the session can be resolved (activates extension)
			const canResolve = await chatSessionsService.canResolveChatSession(session.resource);

			if (!canResolve) {
				this.setInnerHTML(chatWidgetContainer, `
					<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground, #9d9d9d);">
						<div style="font-size: 14px;">Cannot resolve session</div>
					</div>
				`);
				return;
			}

			// Load the session using IChatService
			const modelRef = await chatService.loadSessionForResource(session.resource, ChatAgentLocation.Chat, CancellationToken.None);

			if (!modelRef) {
				this.setInnerHTML(chatWidgetContainer, `
					<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground, #9d9d9d);">
						<div style="font-size: 14px;">Failed to load session</div>
					</div>
				`);
				return;
			}

			// Clean up previous widget if any
			if (this._chatWidget) {
				this._chatWidget.dispose();
				this._chatWidget = undefined;
			}

			// Clear the container
			this.setInnerHTML(chatWidgetContainer, '');

			// Create a new chat widget container that fills the parent
			this._chatWidgetContainer = mainWindow.document.createElement('div');
			this._chatWidgetContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100%; width: 100%; position: relative; min-height: 0;';
			chatWidgetContainer.appendChild(this._chatWidgetContainer);

			// Create the chat widget with proper styling (matching ChatViewPane)
			const styles: IChatWidgetStyles = {
				listForeground: 'var(--vscode-sideBar-foreground)',
				listBackground: 'var(--vscode-sideBar-background)',
				overlayBackground: 'var(--vscode-sideBar-background)',
				inputEditorBackground: 'var(--vscode-sideBar-background)',
				resultEditorBackground: 'var(--vscode-editor-background)',
			};

			this._chatWidget = this._register(this.instantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Chat,
				undefined, // viewContext
				{
					// Match ChatViewPane options for proper panel-style rendering
					renderFollowups: true,
					supportsFileReferences: true,
					enableImplicitContext: true,
					supportsChangingModes: false, // Read-only view of sessions
					enableWorkingSet: 'explicit',
					rendererOptions: {
						renderTextEditsAsSummary: () => true,
						referencesExpandedWhenEmptyResponse: false,
					},
				},
				styles
			));

			// Render the widget into the container
			this._chatWidget.render(this._chatWidgetContainer);

			// Set visible BEFORE setting model to avoid race condition
			// The onDidChangeItems() in setModel only renders if this._visible is true
			this._chatWidget.setVisible(true);

			// Set the model
			const model = modelRef.object;
			this._chatWidget.setModel(model);

			// Debug: Check viewModel state
			const viewModel = this._chatWidget.viewModel;
			if (viewModel) {
				viewModel.getItems();
			}

			// Clean up previous resize observer
			if (this._resizeObserver) {
				this._resizeObserver.disconnect();
				this._resizeObserver = undefined;
			}

			// Create a layout function using the outer container dimensions
			const doLayout = () => {
				if (this._chatWidget && chatWidgetContainer) {
					const rect = chatWidgetContainer.getBoundingClientRect();
					if (rect.height > 0 && rect.width > 0) {
						this._chatWidget.layout(rect.height, rect.width);
					}
				}
			};

			// Set up resize observer for the outer container
			this._resizeObserver = new ResizeObserver(() => {
				doLayout();
			});
			this._resizeObserver.observe(chatWidgetContainer);

			// Initial layout - defer to next frame to ensure DOM is ready
			mainWindow.requestAnimationFrame(() => {
				doLayout();
				// Double-check layout after a short delay
				mainWindow.setTimeout(() => doLayout(), 100);
			});

		} catch (error) {
			this.setInnerHTML(chatWidgetContainer, `
				<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground, #9d9d9d);">
					<div style="font-size: 14px;">Error loading session: ${error instanceof Error ? this.escapeHtml(error.message) : 'Unknown error'}</div>
				</div>
			`);
		}
	}

	private escapeHtml(text: string): string {
		const div = mainWindow.document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	private showEmptyView(): void {
		this._chatEmptyEl.style.display = 'flex';
		this._chatWidgetContainerEl.style.display = 'none';

		// Clean up previous session widget if any
		if (this._chatWidget) {
			this._chatWidget.dispose();
			this._chatWidget = undefined;
		}

		// Create welcome ChatWidget if not already created
		if (!this._welcomeChatWidget) {
			this.createWelcomeChatWidget(this._welcomeChatWidgetEl);
		}
	}

	private createWelcomeChatWidget(container: HTMLElement): void {
		// Create editor overflow widgets container for dropdowns to render properly
		const editorOverflowWidgetsDomNode = mainWindow.document.body.appendChild($('.chat-editor-overflow.monaco-editor'));
		this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		// Create ChatWidget with input on top (like AgentSessionsWelcome)
		const scopedContextKeyService = this._register(this.instantiationService.invokeFunction(accessor =>
			accessor.get(IContextKeyService).createScoped(container)
		));

		const scopedInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])
		));

		// Create a delegate for the session target picker with independent local state
		const onDidChangeActiveSessionProvider = this._register(new Emitter<AgentSessionProviders>());
		let selectedSessionProvider = AgentSessionProviders.Local;
		const sessionTypePickerDelegate: ISessionTypePickerDelegate = {
			getActiveSessionProvider: () => selectedSessionProvider,
			setActiveSessionProvider: (provider: AgentSessionProviders) => {
				selectedSessionProvider = provider;
				onDidChangeActiveSessionProvider.fire(provider);
			},
			onDidChangeActiveSessionProvider: onDidChangeActiveSessionProvider.event
		};

		this._welcomeChatWidget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{}, // Empty resource view context (like welcome page)
			{
				renderInputOnTop: true,
				renderFollowups: false,
				supportsFileReferences: true,
				enableImplicitContext: true,
				supportsChangingModes: true,
				editorOverflowWidgetsDomNode,
				sessionTypePickerDelegate,
				enableWorkingSet: 'explicit',
			},
			{
				listForeground: editorForeground,
				listBackground: editorBackground,
				overlayBackground: editorBackground,
				inputEditorBackground: editorBackground,
				resultEditorBackground: editorBackground,
			}
		));

		this._welcomeChatWidget.render(container);
		this._welcomeChatWidget.setVisible(true);

		// Start a chat session so the widget has a viewModel
		// This is necessary for actions like mode switching to work properly
		const chatService = scopedInstantiationService.invokeFunction(accessor => accessor.get(IChatService));
		const chatModelRef = chatService.startSession(ChatAgentLocation.Chat);
		this._register(chatModelRef);
		if (chatModelRef.object) {
			this._welcomeChatWidget.setModel(chatModelRef.object);
		}

		// Layout the chat widget - height for input area only (list is hidden by CSS)
		const chatWidth = Math.min(800, container.parentElement?.offsetWidth || 600);
		this._welcomeChatWidget.layout(200, chatWidth);

		// Focus the input when clicking
		this._welcomeChatWidget.focusInput();
	}
}
