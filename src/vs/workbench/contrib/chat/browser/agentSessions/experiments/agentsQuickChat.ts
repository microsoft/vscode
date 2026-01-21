/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsQuickChat.css';

import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickWidget } from '../../../../../../platform/quickinput/common/quickInput.js';
import { Extensions as QuickAccessExtensions, IQuickAccessProviderDescriptor, IQuickAccessRegistry } from '../../../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { spinningLoading } from '../../../../../../platform/theme/common/iconRegistry.js';
import { fromNow } from '../../../../../../base/common/date.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../../../nls.js';
import { AgentSessionStatus, getAgentChangesSummary, hasValidDiff, IAgentSession, isSessionInProgressStatus } from '../agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { getAgentSessionProviderName } from '../agentSessions.js';
import { openSession } from '../agentSessionsOpener.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MenuId, IMenuService } from '../../../../../../platform/actions/common/actions.js';

const { $, addDisposableListener, EventType } = dom;

/** Context key for when AgentsQuickChat is visible */
export const AgentsQuickChatVisibleContext = new RawContextKey<boolean>('agentsQuickChatVisible', false);

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
 * Mode for the quick chat content area.
 */
const enum QuickChatMode {
	Commands = 'commands',
	Sessions = 'sessions',
	QuickAccess = 'quickAccess'
}

const MAX_VISIBLE_ITEMS = 8;

/**
 * AgentsQuickChat - A unified quick-access overlay combining search, commands, and agent sessions.
 *
 * Features:
 * - Unified search: files, keywords, commands
 * - Quick Access prefix detection (>, @, #, etc.)
 * - Recent sessions with status indicators
 * - Keyboard shortcuts display
 */
export class AgentsQuickChat extends Disposable {

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private _widget: IQuickWidget | undefined;
	private _isVisible = false;
	private _container: HTMLElement | undefined;
	private _inputElement: HTMLInputElement | undefined;
	private _contentArea: HTMLElement | undefined;
	private _itemRows: HTMLElement[] = [];
	private _currentMode: QuickChatMode = QuickChatMode.Commands;
	private _selectedIndex = 0;

	get mode(): QuickChatMode {
		return this._currentMode;
	}

	private readonly _widgetDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly _quickAccessRegistry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess);
	private readonly _sessionTimers = this._register(new DisposableStore());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super();
	}

	get isVisible(): boolean {
		return this._isVisible;
	}

	show(options?: IAgentsQuickChatOpenOptions): void {
		if (this._isVisible) {
			this.focus();
			return;
		}

		this._isVisible = true;

		const disposables = new DisposableStore();
		this._widgetDisposables.value = disposables;

		// Set context key
		const contextKey = AgentsQuickChatVisibleContext.bindTo(this.contextKeyService);
		contextKey.set(true);
		disposables.add(toDisposable(() => contextKey.set(false)));

		// Create the quick widget overlay
		this._widget = this.quickInputService.createQuickWidget();
		this._widget.ignoreFocusOut = true;
		disposables.add(this._widget);

		// Create container
		this._container = $('.agents-quick-chat');
		this._widget.widget = this._container;

		// Show the widget first
		this._widget.show();

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
		this._inputElement?.focus();
	}

	setValue(value: string): void {
		if (this._inputElement) {
			this._inputElement.value = value;
			this._handleInputChange(value);
		}
	}

	private _render(disposables: DisposableStore, options?: IAgentsQuickChatOpenOptions): void {
		if (!this._container) {
			return;
		}

		// Header with nav, input, and action buttons
		const header = this._renderHeader(disposables);
		this._container.appendChild(header);

		// Content area (commands list by default)
		this._contentArea = $('.agents-quick-chat-content');
		this._renderCommandsMode(disposables);
		this._container.appendChild(this._contentArea);

		// Set initial value if provided
		if (options?.query && this._inputElement) {
			this._inputElement.value = options.query;
			this._handleInputChange(options.query);
		}
	}

	private _renderHeader(disposables: DisposableStore): HTMLElement {
		const header = $('.agents-quick-chat-header');

		// Navigation buttons
		const navButtons = $('.agents-quick-chat-nav');

		const backButton = $('button.agents-quick-chat-nav-button') as HTMLButtonElement;
		backButton.setAttribute('aria-label', localize('back', "Back"));
		backButton.disabled = true;
		backButton.appendChild(renderIcon(Codicon.arrowLeft));
		navButtons.appendChild(backButton);

		const forwardButton = $('button.agents-quick-chat-nav-button') as HTMLButtonElement;
		forwardButton.setAttribute('aria-label', localize('forward', "Forward"));
		forwardButton.disabled = true;
		forwardButton.appendChild(renderIcon(Codicon.arrowRight));
		navButtons.appendChild(forwardButton);

		header.appendChild(navButtons);

		// Input container
		const inputContainer = $('.agents-quick-chat-input-container');

		this._inputElement = $('input.agents-quick-chat-input') as HTMLInputElement;
		this._inputElement.type = 'text';
		this._inputElement.placeholder = localize('searchPlaceholder', "Search for files, keywords, and commands");
		this._inputElement.setAttribute('aria-label', localize('searchInput', "Search input"));
		inputContainer.appendChild(this._inputElement);

		// Handle input changes for filtering and prefix detection
		disposables.add(addDisposableListener(this._inputElement, EventType.INPUT, () => {
			this._handleInputChange(this._inputElement!.value);
		}));

		// Handle keyboard navigation
		disposables.add(addDisposableListener(this._inputElement, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this._handleSubmit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.hide();
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				this._selectNext();
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				this._selectPrevious();
			}
		}));

		header.appendChild(inputContainer);

		// Action buttons container
		const actionButtons = $('.agents-quick-chat-actions');

		// Search button
		const searchButton = $('button.agents-quick-chat-action-button') as HTMLButtonElement;
		searchButton.setAttribute('aria-label', localize('search', "Search"));
		searchButton.appendChild(renderIcon(Codicon.search));
		disposables.add(addDisposableListener(searchButton, EventType.CLICK, () => {
			this._handleSubmit();
		}));
		actionButtons.appendChild(searchButton);

		// Run/Play button
		const runButton = $('button.agents-quick-chat-action-button') as HTMLButtonElement;
		runButton.setAttribute('aria-label', localize('run', "Run"));
		runButton.appendChild(renderIcon(Codicon.play));
		disposables.add(addDisposableListener(runButton, EventType.CLICK, () => {
			this._executeSelectedItem();
		}));
		actionButtons.appendChild(runButton);

		// AI/Sparkle button
		const aiButton = $('button.agents-quick-chat-action-button') as HTMLButtonElement;
		aiButton.setAttribute('aria-label', localize('ai', "AI"));
		aiButton.appendChild(renderIcon(Codicon.sparkle));
		disposables.add(addDisposableListener(aiButton, EventType.CLICK, () => {
			// Open chat with current query
			const value = this._inputElement?.value?.trim() || '';
			this.hide();
			this.commandService.executeCommand('workbench.action.chat.open', { query: value });
		}));
		actionButtons.appendChild(aiButton);

		header.appendChild(actionButtons);

		// Close button
		const closeButton = $('button.agents-quick-chat-close');
		closeButton.setAttribute('aria-label', localize('close', "Close"));
		closeButton.appendChild(renderIcon(Codicon.close));
		disposables.add(addDisposableListener(closeButton, EventType.CLICK, () => this.hide()));
		header.appendChild(closeButton);

		return header;
	}

	private _renderCommandsMode(disposables: DisposableStore): void {
		if (!this._contentArea) {
			return;
		}

		this._currentMode = QuickChatMode.Commands;
		this._selectedIndex = 0;
		dom.clearNode(this._contentArea);
		this._itemRows = [];

		// Get commands from command palette menu
		const commands = this._getRecentCommands();
		const itemsList = $('.agents-quick-chat-items-list');

		commands.forEach((item, index) => {
			const row = this._renderCommandRow(item, index, disposables);
			itemsList.appendChild(row);
			this._itemRows.push(row);
		});

		// Add recent sessions
		const sessions = this.agentSessionsService.model.sessions.slice(0, 3);
		if (sessions.length > 0) {
			sessions.forEach((session, i) => {
				const index = this._itemRows.length;
				const row = this._renderSessionRow(session, index, disposables);
				itemsList.appendChild(row);
				this._itemRows.push(row);
			});
		}

		this._contentArea.appendChild(itemsList);
		this._updateSelection();
	}

	private _getRecentCommands(): Array<{ id: string; label: string; keybinding?: string }> {
		// Get commands from the command palette menu
		const menu = this.menuService.getMenuActions(MenuId.CommandPalette, this.contextKeyService, { shouldForwardArgs: true });
		const commands: Array<{ id: string; label: string; keybinding?: string }> = [];

		for (const [, actions] of menu) {
			for (const action of actions) {
				if ('id' in action && 'label' in action) {
					const keybinding = this.keybindingService.lookupKeybinding(action.id);
					commands.push({
						id: action.id,
						label: action.label,
						keybinding: keybinding?.getLabel() || undefined,
					});
				}
				if (commands.length >= MAX_VISIBLE_ITEMS) {
					break;
				}
			}
			if (commands.length >= MAX_VISIBLE_ITEMS) {
				break;
			}
		}

		return commands;
	}

	private _renderCommandRow(item: { id: string; label: string; keybinding?: string }, index: number, disposables: DisposableStore): HTMLElement {
		const row = $('.agents-quick-chat-item-row');
		row.setAttribute('tabindex', '-1');
		row.setAttribute('role', 'option');
		row.setAttribute('data-index', String(index));
		row.setAttribute('data-command-id', item.id);

		// Icon (settings gear for now)
		const iconContainer = $('.agents-quick-chat-item-icon');
		iconContainer.appendChild(renderIcon(Codicon.gear));
		row.appendChild(iconContainer);

		// Label
		const label = $('.agents-quick-chat-item-label');
		label.textContent = item.label;
		row.appendChild(label);

		// Spacer
		row.appendChild($('.agents-quick-chat-item-spacer'));

		// Keybinding
		if (item.keybinding) {
			const keybindingEl = this._renderKeybinding(item.keybinding);
			row.appendChild(keybindingEl);
		}

		// Click handler
		disposables.add(addDisposableListener(row, EventType.CLICK, () => {
			this._selectedIndex = index;
			this._executeSelectedItem();
		}));

		// Hover handler
		disposables.add(addDisposableListener(row, EventType.MOUSE_ENTER, () => {
			this._selectedIndex = index;
			this._updateSelection();
		}));

		return row;
	}

	private _renderKeybinding(keybinding: string): HTMLElement {
		const container = $('.agents-quick-chat-keybinding');

		// Split by + or space to get individual keys
		const keys = keybinding.split(/(?<=[^+])\s+/);

		keys.forEach((key, i) => {
			if (i > 0) {
				const separator = $('span.keybinding-separator');
				separator.textContent = ' ';
				container.appendChild(separator);
			}

			// Handle modifier combinations like "Cmd+K"
			const parts = key.split('+');
			parts.forEach((part, j) => {
				if (j > 0 && parts.length > 1) {
					// No separator needed for modifier combinations
				}
				const keyEl = $('span.keybinding-key');
				keyEl.textContent = part.trim();
				container.appendChild(keyEl);
			});
		});

		return container;
	}

	private _selectNext(): void {
		if (this._itemRows.length === 0) {
			return;
		}
		this._selectedIndex = (this._selectedIndex + 1) % this._itemRows.length;
		this._updateSelection();
	}

	private _selectPrevious(): void {
		if (this._itemRows.length === 0) {
			return;
		}
		this._selectedIndex = (this._selectedIndex - 1 + this._itemRows.length) % this._itemRows.length;
		this._updateSelection();
	}

	private _updateSelection(): void {
		this._itemRows.forEach((row, i) => {
			row.classList.toggle('selected', i === this._selectedIndex);
			row.setAttribute('aria-selected', String(i === this._selectedIndex));
		});
	}

	private _executeSelectedItem(): void {
		const selectedRow = this._itemRows[this._selectedIndex];
		if (!selectedRow) {
			return;
		}

		const commandId = selectedRow.getAttribute('data-command-id');
		const sessionResource = selectedRow.getAttribute('data-session-resource');

		if (commandId) {
			this.hide();
			this.commandService.executeCommand(commandId);
		} else if (sessionResource) {
			// Find and open session
			const session = this.agentSessionsService.model.sessions.find(s => s.resource.toString() === sessionResource);
			if (session) {
				this.hide();
				this.instantiationService.invokeFunction(openSession, session);
			}
		}
	}

	private _renderSessionRow(session: IAgentSession, index: number, disposables: DisposableStore): HTMLElement {
		const row = $('.agents-quick-chat-item-row');
		row.setAttribute('tabindex', '-1');
		row.setAttribute('role', 'option');
		row.setAttribute('data-index', String(index));
		row.setAttribute('data-session-resource', session.resource.toString());

		// Status icon
		const iconContainer = $('.agents-quick-chat-item-icon');
		iconContainer.appendChild(this._getStatusIcon(session));
		row.appendChild(iconContainer);

		// Main content
		const mainContent = $('.agents-quick-chat-item-main');

		// Title
		const title = $('.agents-quick-chat-item-label');
		const markdownTitle = new MarkdownString(session.label);
		title.textContent = renderAsPlaintext(markdownTitle);
		mainContent.appendChild(title);

		// Details (diff stats, provider, time)
		const details = $('.agents-quick-chat-item-details');
		this._renderSessionDetails(session, details, disposables);
		mainContent.appendChild(details);

		row.appendChild(mainContent);

		// Spacer
		row.appendChild($('.agents-quick-chat-item-spacer'));

		// Click handler
		disposables.add(addDisposableListener(row, EventType.CLICK, () => {
			this._openSession(session);
		}));

		// Hover handler
		disposables.add(addDisposableListener(row, EventType.MOUSE_ENTER, () => {
			this._selectedIndex = index;
			this._updateSelection();
		}));

		return row;
	}

	private _getStatusIcon(session: IAgentSession): HTMLElement {
		let icon: ThemeIcon;
		let className = '';

		if (isSessionInProgressStatus(session.status)) {
			icon = spinningLoading;
			className = 'in-progress';
		} else if (session.status === AgentSessionStatus.Failed) {
			icon = Codicon.error;
			className = 'failed';
		} else if (session.status === AgentSessionStatus.NeedsInput) {
			icon = Codicon.bell;
			className = 'needs-input';
		} else if (!session.isRead()) {
			icon = Codicon.circleFilled;
			className = 'unread';
		} else {
			icon = Codicon.circleSmallFilled;
			className = 'read';
		}

		const iconElement = renderIcon(icon);
		iconElement.classList.add('status-icon', className);
		return iconElement;
	}

	private _renderSessionDetails(session: IAgentSession, container: HTMLElement, _disposables: DisposableStore): void {
		const parts: string[] = [];

		// Diff stats
		if (!isSessionInProgressStatus(session.status) && hasValidDiff(session.changes)) {
			const summary = getAgentChangesSummary(session.changes);
			if (summary) {
				parts.push(`${summary.files} Files +${summary.insertions} -${summary.deletions}`);
			}
		}

		// Provider
		const providerName = session.providerLabel || getAgentSessionProviderName(session.providerType as Parameters<typeof getAgentSessionProviderName>[0]);
		if (providerName) {
			parts.push(providerName);
		}

		// Time
		const time = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
		parts.push(fromNow(time, true));

		container.textContent = parts.join(' • ');
	}

	private _openSession(session: IAgentSession): void {
		this.hide();
		this.instantiationService.invokeFunction(openSession, session);
	}

	private _handleInputChange(value: string): void {
		// Check for Quick Access prefix (>, @, #, etc.)
		const provider = this._quickAccessRegistry.getQuickAccessProvider(value, this.contextKeyService);

		if (provider && provider.prefix !== '' && value.startsWith(provider.prefix)) {
			// Delegate to native Quick Access
			this._renderQuickAccessMode(provider, value);
		} else if (value.trim() === '') {
			// Empty input - show commands
			this._renderCommandsMode(this._widgetDisposables.value!);
		} else {
			// Filter commands based on input
			this._filterCommands(value);
		}
	}

	private _filterCommands(query: string): void {
		const lowerQuery = query.toLowerCase();

		this._itemRows.forEach((row, index) => {
			const label = row.querySelector('.agents-quick-chat-item-label');
			const text = label?.textContent?.toLowerCase() || '';
			const visible = text.includes(lowerQuery);
			row.style.display = visible ? '' : 'none';

			// Update selection if current selection is hidden
			if (!visible && index === this._selectedIndex) {
				this._selectNextVisible();
			}
		});
	}

	private _selectNextVisible(): void {
		for (let i = 0; i < this._itemRows.length; i++) {
			if (this._itemRows[i].style.display !== 'none') {
				this._selectedIndex = i;
				this._updateSelection();
				return;
			}
		}
	}

	private _renderQuickAccessMode(_provider: IQuickAccessProviderDescriptor, value: string): void {
		this._currentMode = QuickChatMode.QuickAccess;

		// Delegate to native Quick Access
		setTimeout(() => {
			this.hide();
			this.quickInputService.quickAccess.show(value, { preserveValue: true });
		}, 50);
	}

	private _handleSubmit(): void {
		const value = this._inputElement?.value?.trim();

		// If there's a selected item, execute it
		if (this._itemRows.length > 0) {
			this._executeSelectedItem();
			return;
		}

		if (!value) {
			return;
		}

		// Check if it's a Quick Access prefix
		const provider = this._quickAccessRegistry.getQuickAccessProvider(value, this.contextKeyService);
		if (provider && provider.prefix !== '' && value.startsWith(provider.prefix)) {
			this.hide();
			this.quickInputService.quickAccess.show(value, { preserveValue: true });
			return;
		}

		// Submit as a chat message
		this.hide();
		this.commandService.executeCommand('workbench.action.chat.open', { query: value });
	}

	private _dispose(): void {
		this._isVisible = false;
		this._widget = undefined;
		this._container = undefined;
		this._inputElement = undefined;
		this._contentArea = undefined;
		this._itemRows = [];
		this._currentMode = QuickChatMode.Commands;
		this._selectedIndex = 0;
		this._widgetDisposables.clear();
		this._sessionTimers.clear();
		this._onDidChangeVisibility.fire(false);
	}

	override dispose(): void {
		this._dispose();
		super.dispose();
	}
}
