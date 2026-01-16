/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Button, IButtonStyles } from '../../../../../base/browser/ui/button/button.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { IAgentSession } from './agentSessionsModel.js';
import { AgentSessionsQuickPickItemRenderer } from './agentSessionsQuickPickItems.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewId } from '../chat.js';
import { ChatViewPane } from '../widgetHosts/viewPane/chatViewPane.js';
import { AgentSessionProviders, getAgentSessionProviderName } from './agentSessions.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import './media/agentSessionsQuickPick.css';

const $ = dom.$;

export interface IAgentSessionsQuickPickOptions {
	/**
	 * Pre-selected session type filter
	 */
	sessionType?: AgentSessionProviders;
}

export class AgentSessionsQuickPickWidget extends Disposable {

	private readonly _onDidRequestClose = this._register(new Emitter<void>());
	readonly onDidRequestClose: Event<void> = this._onDidRequestClose.event;

	private readonly _element: HTMLElement;
	get element(): HTMLElement {
		return this._element;
	}

	private _inputBox!: InputBox;
	private readonly _sessionListContainer: HTMLElement;
	private readonly _sessionItemRenderer: AgentSessionsQuickPickItemRenderer;
	private readonly _sessionElements: HTMLElement[] = [];

	private _sessions: IAgentSession[] = [];
	private _selectedIndex = -1;
	private _sessionType: AgentSessionProviders = AgentSessionProviders.Local;

	private readonly _sessionDisposables = this._register(new DisposableStore());

	constructor(
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();

		this._sessionItemRenderer = this._register(this.instantiationService.createInstance(AgentSessionsQuickPickItemRenderer));

		// Create main container
		this._element = $('.agent-sessions-quick-pick');

		// Create input row
		const inputRow = dom.append(this._element, $('.agent-sessions-quick-pick-input-row'));
		this._createInputRow(inputRow);

		// Create dropdown row
		const dropdownRow = dom.append(this._element, $('.agent-sessions-quick-pick-dropdown-row'));
		this._createDropdownRow(dropdownRow);

		// Create separator
		dom.append(this._element, $('.agent-sessions-quick-pick-separator'));

		// Create recent sessions header
		const headerRow = dom.append(this._element, $('.agent-sessions-quick-pick-header'));
		headerRow.textContent = localize('agentSessions.recentSessions', "RECENT SESSIONS");

		// Create session list
		this._sessionListContainer = dom.append(this._element, $('.agent-sessions-quick-pick-list'));

		// Create show more button
		const showMoreRow = dom.append(this._element, $('.agent-sessions-quick-pick-show-more'));
		const showMoreButton = this._register(new Button(showMoreRow, {
			...defaultButtonStyles,
			secondary: true,
		}));
		showMoreButton.label = localize('agentSessions.showMore', "Show More");
		this._register(showMoreButton.onDidClick(() => {
			// TODO: Load more sessions
		}));

		// Load initial sessions
		this._loadSessions();

		// Listen for session changes
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._loadSessions();
		}));
	}

	private _createInputRow(container: HTMLElement): void {
		// Input box
		const inputContainer = dom.append(container, $('.agent-sessions-quick-pick-input-container'));

		this._inputBox = this._register(new InputBox(inputContainer, this.contextViewService, {
			placeholder: localize('agentSessions.inputPlaceholder', "Ask anything or describe what to build next"),
			inputBoxStyles: defaultInputBoxStyles,
			flexibleHeight: false,
			flexibleMaxHeight: 150,
		}));

		// Keyboard handling for input
		this._register(dom.addDisposableListener(this._inputBox.inputElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				e.preventDefault();
				this._sendMessage();
			} else if (event.keyCode === KeyCode.DownArrow) {
				e.preventDefault();
				this._selectSession(0);
			} else if (event.keyCode === KeyCode.UpArrow && this._selectedIndex >= 0) {
				e.preventDefault();
				this._selectSession(this._selectedIndex - 1);
			}
		}));

		// Action buttons container
		const actionsContainer = dom.append(container, $('.agent-sessions-quick-pick-input-actions'));

		// Voice button
		const voiceButton = dom.append(actionsContainer, $('button.agent-sessions-quick-pick-action-button'));
		voiceButton.title = localize('agentSessions.voice', "Voice input");
		const voiceIcon = dom.append(voiceButton, $(ThemeIcon.asCSSSelector(Codicon.mic)));
		voiceIcon.classList.add('codicon');

		// Send button
		const sendButton = dom.append(actionsContainer, $('button.agent-sessions-quick-pick-action-button.send-button'));
		sendButton.title = localize('agentSessions.send', "Send");
		const sendIcon = dom.append(sendButton, $(ThemeIcon.asCSSSelector(Codicon.send)));
		sendIcon.classList.add('codicon');
		this._register(dom.addDisposableListener(sendButton, dom.EventType.CLICK, () => {
			this._sendMessage();
		}));
	}

	private _createDropdownRow(container: HTMLElement): void {
		// Session type dropdown (Local/Cloud/Background)
		const sessionTypeDropdown = this._createDropdown(
			container,
			getAgentSessionProviderName(this._sessionType),
			[
				{ value: AgentSessionProviders.Local, label: getAgentSessionProviderName(AgentSessionProviders.Local) },
				{ value: AgentSessionProviders.Cloud, label: getAgentSessionProviderName(AgentSessionProviders.Cloud) },
				{ value: AgentSessionProviders.Background, label: getAgentSessionProviderName(AgentSessionProviders.Background) },
			],
			(value) => {
				this._sessionType = value as AgentSessionProviders;
				this._loadSessions();
			}
		);
		sessionTypeDropdown.classList.add('session-type-dropdown');

		// Mode dropdown (Agent/Ask) - for now just a placeholder
		const modeDropdown = this._createDropdown(
			container,
			localize('agentSessions.mode.agent', "Agent"),
			[
				{ value: 'agent', label: localize('agentSessions.mode.agent', "Agent") },
				{ value: 'ask', label: localize('agentSessions.mode.ask', "Ask") },
			],
			(_value) => {
				// TODO: Handle mode change
			}
		);
		modeDropdown.classList.add('mode-dropdown');

		// Spacer
		dom.append(container, $('.agent-sessions-quick-pick-dropdown-spacer'));

		// Model dropdown
		const modelDropdown = this._createDropdown(
			container,
			'GPT 5.2',
			[
				{ value: 'gpt-5.2', label: 'GPT 5.2' },
				{ value: 'gpt-4', label: 'GPT 4' },
				{ value: 'claude-3', label: 'Claude 3' },
			],
			(_value) => {
				// TODO: Handle model change
			}
		);
		modelDropdown.classList.add('model-dropdown');
	}

	private _createDropdown(
		container: HTMLElement,
		label: string,
		options: { value: string; label: string }[],
		onChange: (value: string) => void
	): HTMLElement {
		const dropdown = dom.append(container, $('.agent-sessions-quick-pick-dropdown'));

		const labelEl = dom.append(dropdown, $('.agent-sessions-quick-pick-dropdown-label'));
		labelEl.textContent = label;

		const chevron = dom.append(dropdown, $(ThemeIcon.asCSSSelector(Codicon.chevronDown)));
		chevron.classList.add('codicon', 'dropdown-chevron');

		// Simple click handler - shows options in a basic menu
		// TODO: Use proper context menu or dropdown widget
		this._register(dom.addDisposableListener(dropdown, dom.EventType.CLICK, () => {
			// For now, just cycle through options
			const currentIndex = options.findIndex(o => o.label === labelEl.textContent);
			const nextIndex = (currentIndex + 1) % options.length;
			labelEl.textContent = options[nextIndex].label;
			onChange(options[nextIndex].value);
		}));

		return dropdown;
	}

	private async _loadSessions(): Promise<void> {
		this._sessionDisposables.clear();

		const cts = new CancellationTokenSource();
		this._sessionDisposables.add(cts);

		try {
			await this.agentSessionsService.model.resolve([this._sessionType]);
			this._sessions = this.agentSessionsService.model.sessions
				.filter((s: IAgentSession) => s.providerType === this._sessionType)
				.slice(0, 10); // Limit to 10 for initial display

			this._renderSessions();
		} catch {
			// Ignore errors during load
		}
	}

	private _renderSessions(): void {
		// Clear existing
		dom.clearNode(this._sessionListContainer);
		this._sessionElements.length = 0;

		for (let i = 0; i < this._sessions.length; i++) {
			const session = this._sessions[i];
			const itemElement = this._sessionItemRenderer.render(session, this._sessionListContainer);

			// Selection handling
			itemElement.tabIndex = 0;
			this._sessionElements.push(itemElement);

			this._sessionDisposables.add(dom.addDisposableListener(itemElement, dom.EventType.CLICK, () => {
				this._openSession(session);
			}));

			this._sessionDisposables.add(dom.addDisposableListener(itemElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const event = new StandardKeyboardEvent(e);
				if (event.keyCode === KeyCode.Enter) {
					e.preventDefault();
					this._openSession(session);
				} else if (event.keyCode === KeyCode.DownArrow) {
					e.preventDefault();
					this._selectSession(i + 1);
				} else if (event.keyCode === KeyCode.UpArrow) {
					e.preventDefault();
					if (i === 0) {
						this._inputBox.focus();
						this._selectedIndex = -1;
					} else {
						this._selectSession(i - 1);
					}
				}
			}));
		}

		// If no sessions, show empty state
		if (this._sessions.length === 0) {
			const emptyState = dom.append(this._sessionListContainer, $('.agent-sessions-quick-pick-empty'));
			emptyState.textContent = localize('agentSessions.noSessions', "No recent sessions");
		}
	}

	private _selectSession(index: number): void {
		if (index < 0 || index >= this._sessionElements.length) {
			return;
		}

		// Remove previous selection
		if (this._selectedIndex >= 0 && this._selectedIndex < this._sessionElements.length) {
			this._sessionElements[this._selectedIndex].classList.remove('selected');
		}

		// Add new selection
		this._selectedIndex = index;
		this._sessionElements[index].classList.add('selected');
		this._sessionElements[index].focus();
	}

	private async _openSession(session: IAgentSession): Promise<void> {
		// Open the session in sidebar chat
		const view = await this.viewsService.openView(ChatViewId) as ChatViewPane;
		await view.loadSession(session.resource);
		view.focus();

		// Close the quick pick
		this._onDidRequestClose.fire();
	}

	private async _sendMessage(): Promise<void> {
		const message = this._inputBox.value.trim();
		if (!message) {
			return;
		}

		// Open sidebar chat with new session and send message
		const view = await this.viewsService.openView(ChatViewId) as ChatViewPane;
		// TODO: Create new session of the selected type and send message
		view.focus();

		// Close the quick pick
		this._onDidRequestClose.fire();
	}

	focus(): void {
		this._inputBox.focus();
	}
}

const defaultButtonStyles: IButtonStyles = {
	buttonBackground: undefined,
	buttonForeground: undefined,
	buttonBorder: undefined,
	buttonHoverBackground: undefined,
	buttonSecondaryBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSeparator: undefined,
};
