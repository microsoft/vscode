/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsQuickChat.css';

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IQuickInputService, IQuickWidget } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ChatWidget } from '../../widget/chatWidget.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { editorBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { SIDE_BAR_FOREGROUND } from '../../../../../common/theme.js';
import { AgentSessionsControl, IAgentSessionsControlOptions } from '../agentSessionsControl.js';
import { IAgentSessionsFilter } from '../agentSessionsViewer.js';
import { IAgentSession } from '../agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { getListStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';

const { $, getWindow } = dom;

/**
 * Options for opening the agents quick chat overlay.
 */
export interface IAgentsQuickChatOpenOptions {
	/** Initial value for the input box */
	query?: string;
	/** Whether to preserve existing input value */
	preserveValue?: boolean;
}

/**
 * AgentsQuickChat - A unified quick-access overlay for agent sessions.
 *
 * Uses ChatWidget with renderInputOnTop to get native chat input with all features.
 * CSS hides the conversation list and welcome text.
 */
export class AgentsQuickChat extends Disposable {

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private _widget: IQuickWidget | undefined;
	private _isVisible = false;
	private _container: HTMLElement | undefined;
	private _chatWidget: ChatWidget | undefined;
	private _chatModelRef: IReference<IChatModel> | undefined;
	private _sessionsControl: AgentSessionsControl | undefined;
	private _sessionsControlContainer: HTMLElement | undefined;

	private readonly _widgetDisposables = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
	) {
		super();
	}

	get isVisible(): boolean {
		return this._isVisible;
	}

	show(options?: IAgentsQuickChatOpenOptions): void {
		console.log('[AgentsQuickChat] show called', { isVisible: this._isVisible, options });

		if (this._isVisible) {
			this.focus();
			return;
		}

		this._isVisible = true;

		const disposables = new DisposableStore();
		this._widgetDisposables.value = disposables;

		// Create the quick widget overlay
		this._widget = this.quickInputService.createQuickWidget();
		this._widget.contextKey = 'agentsQuickChatVisible';
		this._widget.ignoreFocusOut = true;
		disposables.add(this._widget);

		// Create container
		this._container = $('.agents-quick-chat');
		this._widget.widget = this._container;

		// Show the widget first
		this._widget.show();
		console.log('[AgentsQuickChat] widget.show() called');

		// Render content
		this._render(disposables, options);

		// Handle hide
		disposables.add(this._widget.onDidHide(() => {
			this._dispose();
		}));

		// Focus the input
		setTimeout(() => this.focus(), 50);

		this._onDidChangeVisibility.fire(true);
	}

	hide(): void {
		this._widget?.hide();
	}

	focus(): void {
		this._chatWidget?.focusInput();
	}

	setValue(value: string): void {
		this._chatWidget?.setInput(value);
	}

	private _render(disposables: DisposableStore, options?: IAgentsQuickChatOpenOptions): void {
		console.log('[AgentsQuickChat] _render called', { hasContainer: !!this._container });
		if (!this._container) {
			return;
		}

		// Header with nav and close
		const header = this._renderHeader(disposables);
		this._container.appendChild(header);

		// Chat widget container (includes input with all features)
		const chatContainer = $('.agents-quick-chat-input-area');
		this._renderChatWidget(chatContainer, disposables);
		this._container.appendChild(chatContainer);

		// Sessions content
		const content = this._renderContent(disposables);
		this._container.appendChild(content);

		// Set initial value if provided
		if (options?.query && !options.preserveValue) {
			this._chatWidget?.setInput(options.query);
		}
	}

	private _renderHeader(disposables: DisposableStore): HTMLElement {
		const header = $('.agents-quick-chat-header');

		// Navigation buttons
		const navButtons = $('.agents-quick-chat-nav');

		const backButton = $('button.agents-quick-chat-nav-button') as HTMLButtonElement;
		backButton.setAttribute('aria-label', 'Back');
		backButton.disabled = true;
		backButton.textContent = '←';
		navButtons.appendChild(backButton);

		const forwardButton = $('button.agents-quick-chat-nav-button') as HTMLButtonElement;
		forwardButton.setAttribute('aria-label', 'Forward');
		forwardButton.disabled = true;
		forwardButton.textContent = '→';
		navButtons.appendChild(forwardButton);

		header.appendChild(navButtons);
		header.appendChild($('.agents-quick-chat-header-spacer'));

		// Close button
		const closeButton = $('button.agents-quick-chat-close');
		closeButton.setAttribute('aria-label', 'Close');
		closeButton.textContent = '×';
		disposables.add(dom.addDisposableListener(closeButton, dom.EventType.CLICK, () => this.hide()));
		header.appendChild(closeButton);

		return header;
	}

	private _renderChatWidget(container: HTMLElement, disposables: DisposableStore): void {
		console.log('[AgentsQuickChat] _renderChatWidget called');

		// Create editor overflow widgets container (required for proper rendering)
		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(container)).appendChild($('.chat-editor-overflow.monaco-editor'));
		disposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		// Create scoped services
		const scopedContextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])
		));

		// Create ChatWidget with input on top - CSS will hide conversation area
		this._chatWidget = disposables.add(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{}, // Empty resource view context
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: false,
				supportsFileReferences: true,
				renderInputOnTop: true,
				rendererOptions: {
					renderTextEditsAsSummary: () => true,
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
				},
				editorOverflowWidgetsDomNode,
				enableImplicitContext: true,
				enableWorkingSet: 'explicit',
				supportsChangingModes: true,
			},
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: editorBackground,
				overlayBackground: editorBackground,
				inputEditorBackground: editorBackground,
				resultEditorBackground: editorBackground,
			}
		));

		this._chatWidget.render(container);
		this._chatWidget.setVisible(true);

		// Start a chat session so the widget has a viewModel
		this._chatModelRef = this.chatService.startSession(ChatAgentLocation.Chat);
		disposables.add(this._chatModelRef);
		if (this._chatModelRef.object) {
			this._chatWidget.setModel(this._chatModelRef.object);
		}

		console.log('[AgentsQuickChat] ChatWidget rendered');
	}

	private _renderContent(disposables: DisposableStore): HTMLElement {
		const content = $('.agents-quick-chat-content');

		// Sessions container
		const sessionsContainer = $('.agents-quick-chat-sessions');
		sessionsContainer.classList.add('active');

		// Section header
		const sectionHeader = $('.agents-quick-chat-section-header');
		sectionHeader.textContent = 'RECENT SESSIONS';
		sessionsContainer.appendChild(sectionHeader);

		// Sessions list with AgentSessionsControl
		this._sessionsControlContainer = $('.agents-quick-chat-sessions-list');
		sessionsContainer.appendChild(this._sessionsControlContainer);

		// Create filter for limited, non-archived sessions
		const MAX_SESSIONS = 3;
		const onDidChangeEmitter = disposables.add(new Emitter<void>());
		const filter: IAgentSessionsFilter = {
			onDidChange: onDidChangeEmitter.event,
			limitResults: () => MAX_SESSIONS,
			groupResults: () => false,
			exclude: (session: IAgentSession) => session.isArchived(),
			getExcludes: () => ({
				providers: [],
				states: [],
				archived: true,
				read: false,
			}),
		};

		const options: IAgentSessionsControlOptions = {
			overrideStyles: getListStyles({ listBackground: editorBackground }),
			filter,
			getHoverPosition: () => HoverPosition.BELOW,
			trackActiveEditorSession: () => false,
			source: 'WelcomeView',
		};

		this._sessionsControl = disposables.add(this.instantiationService.createInstance(
			AgentSessionsControl,
			this._sessionsControlContainer,
			options
		));

		// Layout sessions control after render
		setTimeout(() => {
			const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
			const visibleSessions = Math.min(sessions.length, MAX_SESSIONS);
			const height = Math.max(visibleSessions * 52, 104); // At least 2 rows height
			this._sessionsControl?.layout(height, 668);
		}, 50);

		// Show more
		const showMore = $('.agents-quick-chat-show-more');
		showMore.textContent = 'Show More';
		disposables.add(dom.addDisposableListener(showMore, dom.EventType.CLICK, () => {
			// TODO: Navigate to full sessions view
		}));
		sessionsContainer.appendChild(showMore);

		content.appendChild(sessionsContainer);

		return content;
	}

	private _dispose(): void {
		this._isVisible = false;
		this._widget = undefined;
		this._container = undefined;
		this._chatWidget = undefined;
		this._chatModelRef = undefined;
		this._sessionsControl = undefined;
		this._sessionsControlContainer = undefined;
		this._widgetDisposables.clear();
		this._onDidChangeVisibility.fire(false);
	}

	override dispose(): void {
		this._dispose();
		super.dispose();
	}
}
