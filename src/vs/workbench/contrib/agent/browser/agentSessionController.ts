/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatWidget, IChatWidgetService } from '../../chat/browser/chat.js';
import { AgentSessionsControl, IAgentSessionsControlOptions } from '../../chat/browser/agentSessions/agentSessionsControl.js';
import { AgentSessionsFilter, IAgentSessionsFilterOptions } from '../../chat/browser/agentSessions/agentSessionsFilter.js';
import { IAgentSessionsService } from '../../chat/browser/agentSessions/agentSessionsService.js';
import { IAgentSession } from '../../chat/browser/agentSessions/agentSessionsModel.js';
import { LocalAgentsSessionsProvider } from '../../chat/browser/agentSessions/localAgentSessionsProvider.js';
import { ChatWidget, IChatWidgetStyles } from '../../chat/browser/widget/chatWidget.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { getChatSessionType } from '../../chat/common/model/chatUri.js';

/**
 * Stub chat widget service for Agent window.
 * Delegates openSession to a callback handler.
 */
export class AgentChatWidgetService implements IChatWidgetService {
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

/**
 * Session elements passed from AgentWindow for controller to manipulate.
 */
export interface IAgentSessionElements {
	sessionsItems: HTMLElement;
	sessionsNewButtonContainer: HTMLElement;
	chatHeader: HTMLElement;
	chatHeaderTitle: HTMLElement;
	chatWidgetContainer: HTMLElement;
}

/**
 * Callbacks for the session controller to communicate with the parent window.
 */
export interface IAgentSessionCallbacks {
	showWelcomeView(): void;
	hideWelcomeView(): void;
	updateChangesPane(session: IAgentSession | undefined): Promise<void>;
}

/**
 * Controller for managing agent sessions - loading, selection, and display.
 */
export class AgentSessionController extends Disposable {

	private _chatWidget: ChatWidget | undefined;
	private _chatWidgetContainer: HTMLElement | undefined;
	private _chatWidgetResizeObserver: ResizeObserver | undefined;
	private _sessionsControl: AgentSessionsControl | undefined;
	private _sessionsResizeObserver: ResizeObserver | undefined;
	private _newSessionButton: Button | undefined;
	private _agentSessionsFilter: AgentSessionsFilter | undefined;

	constructor(
		private readonly _elements: IAgentSessionElements,
		private readonly _callbacks: IAgentSessionCallbacks,
		private readonly _chatWidgetService: AgentChatWidgetService | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	/**
	 * Shows a status message in the given container.
	 */
	private _showStatusMessage(container: HTMLElement, message: string, className: string = 'agent-sessions-empty'): void {
		clearNode(container);
		const messageEl = $(`.${className}`);
		messageEl.textContent = message;
		append(container, messageEl);
	}

	/**
	 * Get the current chat widget.
	 */
	get chatWidget(): ChatWidget | undefined {
		return this._chatWidget;
	}

	/**
	 * Load and display agent sessions.
	 */
	async loadSessions(): Promise<void> {
		const sessionsListEl = this._elements.sessionsItems;

		try {
			// Trigger lifecycle phases to allow extension hosts and contributions to start
			const lifecycleService = this._instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(ILifecycleService));
			this._logService.info('[Agent] Setting lifecycle phase to Ready...');
			lifecycleService.phase = LifecyclePhase.Ready;
			this._logService.info('[Agent] Setting lifecycle phase to Restored...');
			lifecycleService.phase = LifecyclePhase.Restored;
			this._logService.info('[Agent] Setting lifecycle phase to Eventually...');
			lifecycleService.phase = LifecyclePhase.Eventually;

			// Wait for extensions to be registered first
			const extensionService = this._instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IExtensionService));
			this._logService.info('[Agent] Waiting for extensions to be registered...');
			await extensionService.whenInstalledExtensionsRegistered();
			this._logService.info('[Agent] Extensions registered!');

			// Manually instantiate the LocalAgentsSessionsProvider
			const localProvider = this._register(this._instantiationService.createInstance(LocalAgentsSessionsProvider));
			this._logService.info('[Agent] LocalAgentsSessionsProvider instantiated:', localProvider.chatSessionType);

			// Get the chat sessions service which aggregates all providers
			const chatSessionsService = this._instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IChatSessionsService));

			// Get the agent sessions service - accessing .model triggers lazy loading
			const agentSessionsService = this._instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IAgentSessionsService));

			// Debug: log available contributions
			const allContributions = chatSessionsService.getAllChatSessionContributions();
			this._logService.info('[Agent] Registered contributions:', allContributions.length, allContributions.map(c => c.type));

			// Create the "New Session" button
			this._newSessionButton = this._register(new Button(this._elements.sessionsNewButtonContainer, {
				...defaultButtonStyles,
				title: 'New Session',
			}));
			this._newSessionButton.label = 'New Session';
			this._register(this._newSessionButton.onDidClick(() => this.showEmptyView()));

			// Create the filter with date grouping enabled
			const filterOptions: IAgentSessionsFilterOptions = {
				filterMenuId: MenuId.AgentSessionsViewerFilterSubMenu,
				groupResults: () => true,
			};
			this._agentSessionsFilter = this._register(this._instantiationService.createInstance(AgentSessionsFilter, filterOptions));

			// Create AgentSessionsControl options
			const options: IAgentSessionsControlOptions = {
				overrideStyles: {
					listBackground: 'transparent',
				},
				filter: this._agentSessionsFilter,
				source: 'agentWindow',
				getHoverPosition: () => HoverPosition.RIGHT,
				trackActiveEditorSession: () => false,
			};

			// Access model - this triggers lazy loading and starts resolve()
			const model = agentSessionsService.model;

			// Wait for the model to finish resolving
			await model.resolve(undefined);

			// Now clear the loading message
			clearNode(sessionsListEl);

			// Show ongoing loading indicator when model is resolving
			this._register(model.onWillResolve(() => {
				if (this._sessionsControl) {
					sessionsListEl.classList.add('loading');
				}
			}));
			this._register(model.onDidResolve(() => {
				sessionsListEl.classList.remove('loading');
			}));

			// Create the AgentSessionsControl
			this._logService.info('[Agent] Creating AgentSessionsControl...');
			this._sessionsControl = this._register(this._instantiationService.createInstance(
				AgentSessionsControl,
				sessionsListEl,
				options
			));

			// Handle session opens by delegating to our ChatWidget display
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
			this._logService.info('[Agent] Model sessions count:', model.sessions.length);

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

			this._logService.info('[Agent] AgentSessionsControl created');

		} catch (error) {
			this._logService.error('[Agent] Error loading sessions:', error);
			this._showStatusMessage(sessionsListEl, `Failed to load sessions: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Select and display a session in the chat widget.
	 */
	async selectSession(session: IAgentSession): Promise<void> {
		this._callbacks.hideWelcomeView();
		this._elements.chatHeader.style.display = 'flex';
		this._elements.chatHeaderTitle.textContent = session.label;

		const chatWidgetContainer = this._elements.chatWidgetContainer;
		chatWidgetContainer.style.display = 'flex';

		// Update the changes pane with this session's file changes
		await this._callbacks.updateChangesPane(session);

		// Show loading state
		this._showStatusMessage(chatWidgetContainer, 'Loading session...', 'agent-chat-loading');

		try {
			// Get services
			const chatService = this._instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IChatService));
			const chatSessionsService = this._instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(IChatSessionsService));

			// Ensure the session can be resolved (activates extension)
			const canResolve = await chatSessionsService.canResolveChatSession(session.resource);

			if (!canResolve) {
				this._showStatusMessage(chatWidgetContainer, 'Cannot resolve session', 'agent-chat-loading');
				return;
			}

			// Load the session using IChatService
			const modelRef = await chatService.loadSessionForResource(session.resource, ChatAgentLocation.Chat, CancellationToken.None);

			if (!modelRef) {
				this._showStatusMessage(chatWidgetContainer, 'Failed to load session', 'agent-chat-loading');
				return;
			}

			// Clean up previous widget if any
			if (this._chatWidget) {
				this._chatWidget.dispose();
				this._chatWidget = undefined;
			}

			// Clear the container
			clearNode(chatWidgetContainer);

			// Create a new chat widget container that fills the parent
			this._chatWidgetContainer = mainWindow.document.createElement('div');
			this._chatWidgetContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100%; width: 100%; position: relative; min-height: 0;';
			chatWidgetContainer.appendChild(this._chatWidgetContainer);

			// Create the chat widget with proper styling
			const styles: IChatWidgetStyles = {
				listForeground: 'var(--vscode-sideBar-foreground)',
				listBackground: 'var(--vscode-sideBar-background)',
				overlayBackground: 'var(--vscode-sideBar-background)',
				inputEditorBackground: 'var(--vscode-sideBar-background)',
				resultEditorBackground: 'var(--vscode-editor-background)',
			};

			this._chatWidget = this._register(this._instantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Chat,
				undefined, // viewContext
				{
					renderFollowups: true,
					supportsFileReferences: true,
					enableImplicitContext: true,
					supportsChangingModes: false,
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

			// Set visible BEFORE setting model
			this._chatWidget.setVisible(true);

			// Lock to the correct agent for contributed sessions
			const chatSessionType = getChatSessionType(session.resource);
			if (chatSessionType && chatSessionType !== localChatSessionType) {
				const contributions = chatSessionsService.getAllChatSessionContributions();
				const contribution = contributions.find(c => c.type === chatSessionType);
				if (contribution) {
					this._chatWidget.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type);
				}
			}

			// Set the model
			const model = modelRef.object;
			this._chatWidget.setModel(model);

			// Clean up previous resize observer
			if (this._chatWidgetResizeObserver) {
				this._chatWidgetResizeObserver.disconnect();
				this._chatWidgetResizeObserver = undefined;
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
			this._chatWidgetResizeObserver = new ResizeObserver(() => {
				doLayout();
			});
			this._chatWidgetResizeObserver.observe(chatWidgetContainer);

			// Initial layout - defer to next frame to ensure DOM is ready
			mainWindow.requestAnimationFrame(() => {
				doLayout();
				mainWindow.setTimeout(() => doLayout(), 100);
			});

		} catch (error) {
			this._showStatusMessage(chatWidgetContainer, `Error loading session: ${error instanceof Error ? error.message : 'Unknown error'}`, 'agent-chat-loading');
		}
	}

	/**
	 * Show the empty/welcome view.
	 */
	showEmptyView(): void {
		this._callbacks.showWelcomeView();
		this._elements.chatHeader.style.display = 'none';
		this._elements.chatWidgetContainer.style.display = 'none';

		// Clean up previous session widget if any
		if (this._chatWidget) {
			this._chatWidget.dispose();
			this._chatWidget = undefined;
		}
	}

	override dispose(): void {
		this._chatWidgetResizeObserver?.disconnect();
		this._sessionsResizeObserver?.disconnect();
		super.dispose();
	}
}
