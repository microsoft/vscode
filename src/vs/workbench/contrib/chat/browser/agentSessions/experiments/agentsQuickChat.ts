/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsQuickChat.css';

import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator } from '../../../../../../platform/quickinput/common/quickInput.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { spinningLoading } from '../../../../../../platform/theme/common/iconRegistry.js';
import { fromNow } from '../../../../../../base/common/date.js';
import { localize } from '../../../../../../nls.js';
import { AgentSessionStatus, getAgentChangesSummary, hasValidDiff, IAgentSession, isSessionInProgressStatus } from '../agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { getAgentSessionProviderName } from '../agentSessions.js';
import { openSession } from '../agentSessionsOpener.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MenuId, IMenuService } from '../../../../../../platform/actions/common/actions.js';

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

/** Custom quick pick item for commands */
interface IAgentCommandQuickPickItem extends IQuickPickItem {
	type?: 'item';
	commandId: string;
}

/** Custom quick pick item for sessions */
interface IAgentSessionQuickPickItem extends IQuickPickItem {
	type?: 'item';
	session: IAgentSession;
}

type IAgentQuickPickItem = IAgentCommandQuickPickItem | IAgentSessionQuickPickItem;

function isCommandItem(item: IAgentQuickPickItem): item is IAgentCommandQuickPickItem {
	return 'commandId' in item;
}

function isSessionItem(item: IAgentQuickPickItem): item is IAgentSessionQuickPickItem {
	return 'session' in item;
}

const MAX_VISIBLE_SESSIONS = 3;

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

	private _picker: IQuickPick<IAgentQuickPickItem, { useSeparators: true }> | undefined;
	private _isVisible = false;

	private readonly _widgetDisposables = this._register(new MutableDisposable<DisposableStore>());

	// Gear button for command items
	private readonly _gearButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.gear),
		tooltip: localize('configure', "Configure")
	};

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
			this._picker?.show();
			return;
		}

		this._isVisible = true;

		const disposables = new DisposableStore();
		this._widgetDisposables.value = disposables;

		// Set context key
		const contextKey = AgentsQuickChatVisibleContext.bindTo(this.contextKeyService);
		contextKey.set(true);
		disposables.add({ dispose: () => contextKey.set(false) });

		// Create the quick pick using the native API
		const picker = this._picker = this.quickInputService.createQuickPick<IAgentQuickPickItem>({ useSeparators: true });
		disposables.add(picker);

		// Configure the picker
		picker.placeholder = localize('searchPlaceholder', "Search for files, keywords, and commands");
		picker.matchOnDescription = true;
		picker.matchOnDetail = true;

		// Title bar buttons (Search, Run, Sparkle)
		picker.buttons = this._createTitleBarButtons();

		// Populate items
		picker.items = this._createItems();

		// Handle title bar button clicks
		disposables.add(picker.onDidTriggerButton(button => {
			this._handleTitleButton(button, picker);
		}));

		// Handle item button clicks (gear)
		disposables.add(picker.onDidTriggerItemButton(context => {
			this._handleItemButton(context);
		}));

		// Handle item selection
		disposables.add(picker.onDidAccept(() => {
			const selected = picker.selectedItems[0];
			if (selected) {
				this._handleAccept(selected);
			}
		}));

		// Handle input changes (for filtering already done by picker, but we check for Quick Access prefixes)
		disposables.add(picker.onDidChangeValue(value => {
			this._handleValueChange(value, picker);
		}));

		// Handle hide
		disposables.add(picker.onDidHide(() => {
			this._handleHide();
		}));

		// Set initial value if provided
		if (options?.query) {
			picker.value = options.query;
		}

		// Show the picker
		picker.show();

		this._onDidChangeVisibility.fire(true);
	}

	hide(): void {
		this._picker?.hide();
	}

	focus(): void {
		this._picker?.show();
	}

	setValue(value: string): void {
		if (this._picker) {
			this._picker.value = value;
		}
	}

	private _createTitleBarButtons(): IQuickInputButton[] {
		return [
			{
				iconClass: ThemeIcon.asClassName(Codicon.arrowLeft),
				tooltip: localize('back', "Back"),
			},
			{
				iconClass: ThemeIcon.asClassName(Codicon.arrowRight),
				tooltip: localize('forward', "Forward"),
			},
			{
				iconClass: ThemeIcon.asClassName(Codicon.search),
				tooltip: localize('search', "Search"),
			},
			{
				iconClass: ThemeIcon.asClassName(Codicon.play),
				tooltip: localize('run', "Run"),
			},
			{
				iconClass: ThemeIcon.asClassName(Codicon.sparkle),
				tooltip: localize('ai', "AI"),
			},
		];
	}

	private _createItems(): (IAgentQuickPickItem | IQuickPickSeparator)[] {
		const items: (IAgentQuickPickItem | IQuickPickSeparator)[] = [];

		// Get commands
		const commands = this._getRecentCommands();
		for (const cmd of commands) {
			items.push(cmd);
		}

		// Add sessions separator and items
		const sessions = this.agentSessionsService.model.sessions.slice(0, MAX_VISIBLE_SESSIONS);
		if (sessions.length > 0) {
			items.push({ type: 'separator', label: localize('recentSessions', "Recent Sessions") });
			for (const session of sessions) {
				items.push(this._createSessionItem(session));
			}
		}

		return items;
	}

	private _getRecentCommands(): IAgentCommandQuickPickItem[] {
		const commands: IAgentCommandQuickPickItem[] = [];
		const menu = this.menuService.getMenuActions(MenuId.CommandPalette, this.contextKeyService, { shouldForwardArgs: true });

		for (const [, actions] of menu) {
			for (const action of actions) {
				if (this._isMenuAction(action)) {
					const keybinding = this.keybindingService.lookupKeybinding(action.id);
					commands.push({
						label: action.label,
						commandId: action.id,
						keybinding: keybinding ?? undefined,
						buttons: [this._gearButton],
					});
				}
				if (commands.length >= 8) {
					break;
				}
			}
			if (commands.length >= 8) {
				break;
			}
		}

		return commands;
	}

	private _isMenuAction(action: unknown): action is { id: string; label: string } {
		return typeof action === 'object' && action !== null && typeof (action as { id?: string }).id === 'string' && typeof (action as { label?: string }).label === 'string';
	}

	private _createSessionItem(session: IAgentSession): IAgentSessionQuickPickItem {
		const statusIcon = this._getStatusIconClass(session);
		const description = this._getSessionDescription(session);

		return {
			label: session.label,
			description,
			iconClass: statusIcon,
			session,
		};
	}

	private _getStatusIconClass(session: IAgentSession): string {
		if (isSessionInProgressStatus(session.status)) {
			return ThemeIcon.asClassName(spinningLoading);
		} else if (session.status === AgentSessionStatus.Failed) {
			return ThemeIcon.asClassName(Codicon.error);
		} else if (session.status === AgentSessionStatus.NeedsInput) {
			return ThemeIcon.asClassName(Codicon.bell);
		} else if (!session.isRead()) {
			return ThemeIcon.asClassName(Codicon.circleFilled);
		} else {
			return ThemeIcon.asClassName(Codicon.circleSmallFilled);
		}
	}

	private _getSessionDescription(session: IAgentSession): string {
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

		return parts.join(' • ');
	}

	private _handleTitleButton(button: IQuickInputButton, picker: IQuickPick<IAgentQuickPickItem, { useSeparators: true }>): void {
		const tooltip = button.tooltip;

		if (tooltip === localize('search', "Search")) {
			// Execute search with current value
			const value = picker.value.trim();
			if (value) {
				this.hide();
				this.commandService.executeCommand('workbench.action.quickOpen', value);
			}
		} else if (tooltip === localize('run', "Run")) {
			// Run selected item
			const selected = picker.activeItems[0];
			if (selected) {
				this._handleAccept(selected);
			}
		} else if (tooltip === localize('ai', "AI")) {
			// Open chat with current query
			const value = picker.value.trim();
			this.hide();
			this.commandService.executeCommand('workbench.action.chat.open', { query: value });
		}
	}

	private _handleItemButton(context: IQuickPickItemButtonEvent<IAgentQuickPickItem>): void {
		const item = context.item;
		if (isCommandItem(item)) {
			// Open keyboard shortcut editor for this command
			this.hide();
			this.commandService.executeCommand('workbench.action.openGlobalKeybindings', item.commandId);
		}
	}

	private _handleAccept(item: IAgentQuickPickItem): void {
		this.hide();

		if (isCommandItem(item)) {
			this.commandService.executeCommand(item.commandId);
		} else if (isSessionItem(item)) {
			this.instantiationService.invokeFunction(openSession, item.session);
		}
	}

	private _handleValueChange(value: string, picker: IQuickPick<IAgentQuickPickItem, { useSeparators: true }>): void {
		// Check for Quick Access prefixes (>, @, #, etc.)
		// If detected, switch to native quick access
		if (value.startsWith('>') || value.startsWith('@') || value.startsWith('#') || value.startsWith('%')) {
			this.hide();
			this.quickInputService.quickAccess.show(value, { preserveValue: true });
		}
	}

	private _handleHide(): void {
		this._isVisible = false;
		this._picker = undefined;
		this._widgetDisposables.clear();
		this._onDidChangeVisibility.fire(false);
	}

	override dispose(): void {
		this._handleHide();
		super.dispose();
	}
}
