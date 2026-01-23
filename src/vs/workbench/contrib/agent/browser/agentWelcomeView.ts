/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, h } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { editorForeground, editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { ChatWidget } from '../../chat/browser/widget/chatWidget.js';
import { ISessionTypePickerDelegate } from '../../chat/browser/chat.js';
import { AgentSessionProviders } from '../../chat/browser/agentSessions/agentSessions.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';

/**
 * Welcome view for Agent Window.
 * Displays a chat input for starting new sessions.
 */
export class AgentWelcomeView extends Disposable {

	private _chatWidget: ChatWidget | undefined;

	private readonly _elements = this._createElements();

	get root(): HTMLElement {
		return this._elements.root;
	}

	get widgetContainer(): HTMLElement {
		return this._elements.widgetContainer;
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	private _createElements() {
		const widgetContainer = $('div.agent-welcome-chat-widget');
		const elements = h('div.agent-chat-empty@root', [
			h('div.agent-welcome-content', [
				h('div.agent-welcome-title', ['Start a New Session']),
				widgetContainer,
				h('div.agent-chat-empty-description', ['Describe what you want to build or ask a question to start a new agent session']),
			]),
		]);
		return { ...elements, widgetContainer };
	}

	/**
	 * Shows the welcome view and creates the chat widget if needed.
	 */
	show(): void {
		this._elements.root.style.display = 'flex';

		if (!this._chatWidget) {
			this._createChatWidget();
		}
	}

	/**
	 * Hides the welcome view.
	 */
	hide(): void {
		this._elements.root.style.display = 'none';
	}

	private _createChatWidget(): void {
		const container = this._elements.widgetContainer;

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

		this._chatWidget = this._register(scopedInstantiationService.createInstance(
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

		this._chatWidget.render(container);
		this._chatWidget.setVisible(true);

		// Start a chat session so the widget has a viewModel
		// This is necessary for actions like mode switching to work properly
		const chatService = scopedInstantiationService.invokeFunction(accessor => accessor.get(IChatService));
		const chatModelRef = chatService.startSession(ChatAgentLocation.Chat);
		this._register(chatModelRef);
		if (chatModelRef.object) {
			this._chatWidget.setModel(chatModelRef.object);
		}

		// Layout the chat widget - height for input area only (list is hidden by CSS)
		const chatWidth = Math.min(800, container.parentElement?.offsetWidth || 600);
		this._chatWidget.layout(200, chatWidth);

		// Focus the input when clicking
		this._chatWidget.focusInput();
	}
}
