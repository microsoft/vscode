/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/unifiedQuickAccess.css';
import { $ } from '../../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, isDisposable } from '../../../../../../base/common/lifecycle.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../../../nls.js';
import { Radio, IRadioOptionItem } from '../../../../../../base/browser/ui/radio/radio.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Extensions, IQuickAccessProvider, IQuickAccessProviderDescriptor, IQuickAccessRegistry } from '../../../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID, IChatViewOpenOptions } from '../../actions/chatActions.js';

/**
 * Context key set when the unified quick access widget is visible.
 * Used to scope keybindings (e.g., Shift+Enter to send) to this picker only.
 */
export const InUnifiedQuickAccessContext = new RawContextKey<boolean>('inUnifiedQuickAccess', false);

/**
 * Command ID for sending the current input to an agent via Shift+Enter.
 */
export const SEND_TO_AGENT_COMMAND_ID = 'workbench.action.unifiedQuickAccess.sendToAgent';

/**
 * Tab configuration for the unified quick access widget.
 */
export interface IUnifiedQuickAccessTab {
	/** Unique identifier for the tab */
	readonly id: string;
	/** Display label for the tab */
	readonly label: string;
	/** Quick access provider prefix (e.g., '' for files, '>' for commands, 'agent ' for sessions) */
	readonly prefix: string;
	/** Placeholder text when this tab is active */
	readonly placeholder: string;
	/** Tooltip for the tab */
	readonly tooltip?: string;
}

/**
 * Default tabs for the unified quick access widget.
 */
export const DEFAULT_UNIFIED_QUICK_ACCESS_TABS: IUnifiedQuickAccessTab[] = [
	{
		id: 'agentSessions',
		label: localize('agentSessionsTab', "Sessions"),
		prefix: 'agent ',
		placeholder: localize('agentSessionsPlaceholder', "Search sessions or type a message..."),
		tooltip: localize('agentSessionsTooltip', "Search sessions or send a message to agent"),
	},
	{
		id: 'commands',
		label: localize('commandsTab', "Commands"),
		prefix: '>',
		placeholder: localize('commandsPlaceholder', "Search commands..."),
		tooltip: localize('commandsTooltip', "Run commands"),
	},
	{
		id: 'files',
		label: localize('filesTab', "Files"),
		prefix: '',
		placeholder: localize('filesPlaceholder', "Search files..."),
		tooltip: localize('filesTooltip', "Go to files"),
	},
];

/**
 * Service for showing a unified quick access widget with multiple tabs.
 * Combines multiple QuickAccessProviders into a single tabbed interface,
 * using the picker's built-in {@link IQuickPick.headerWidget headerWidget}
 * slot for the tab bar and {@link IQuickPick.customButton customButton} for
 * the send/open-chat action.
 */
export class UnifiedQuickAccess extends Disposable {

	private readonly registry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);
	private readonly mapProviderToDescriptor = new Map<IQuickAccessProviderDescriptor, IQuickAccessProvider>();

	private _currentPicker: IQuickPick<IQuickPickItem, { useSeparators: true }> | undefined;
	private _currentDisposables = this._register(new DisposableStore());
	private _providerDisposables = this._register(new DisposableStore());
	private _currentTab: IUnifiedQuickAccessTab | undefined;
	private _providerCts: CancellationTokenSource | undefined;
	private _radio: Radio | undefined;
	private _isInternalValueChange = false;
	private _arrivedViaShortcut: '<' | '>' | undefined;
	private _inUnifiedQuickAccessContext = InUnifiedQuickAccessContext.bindTo(this.contextKeyService);

	private readonly _tabs: IUnifiedQuickAccessTab[];

	constructor(
		tabs: IUnifiedQuickAccessTab[] | undefined,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
		this._tabs = tabs ?? DEFAULT_UNIFIED_QUICK_ACCESS_TABS;
	}

	/**
	 * Show the unified quick access widget.
	 * @param initialTabId Optional tab ID to start with. Defaults to first tab.
	 * @param initialValue Optional initial filter value.
	 */
	show(initialTabId?: string, initialValue?: string): void {
		if (this._currentPicker) {
			return;
		}

		this._currentDisposables.clear();

		const picker = this._currentDisposables.add(
			this.quickInputService.createQuickPick<IQuickPickItem>({ useSeparators: true })
		);
		this._currentPicker = picker;

		// Configure picker
		picker.ignoreFocusOut = false;
		picker.matchOnDescription = true;
		picker.matchOnDetail = true;
		picker.sortByLabel = false;

		// Find initial tab
		const initialTab = initialTabId
			? this._tabs.find(t => t.id === initialTabId) ?? this._tabs[0]
			: this._tabs[0];
		this._currentTab = initialTab;

		// --- Tab bar via picker.headerWidget ---
		this._setupTabBar(picker);

		// --- Send / Open Chat button via picker.customButton ---
		this._setupCustomButton(picker);

		// Set initial value
		this._isInternalValueChange = true;
		picker.value = initialValue ?? '';
		picker.placeholder = initialTab.placeholder;
		this._isInternalValueChange = false;

		// Start providing items for initial tab
		this._activateProvider(initialTab, picker);

		// Set the context key so Shift+Enter keybinding is active
		this._inUnifiedQuickAccessContext.set(true);

		// Handle value changes - detect prefix changes to switch tabs
		this._currentDisposables.add(picker.onDidChangeValue(value => {
			if (this._isInternalValueChange) {
				return;
			}

			// Check if user removed the shortcut character - switch back to Files
			if (this._arrivedViaShortcut) {
				const shortcut = this._arrivedViaShortcut;
				if (!value.startsWith(shortcut)) {
					const filesTab = this._tabs.find(t => t.id === 'files');
					if (filesTab && filesTab !== this._currentTab) {
						this._arrivedViaShortcut = undefined;
						this._switchTab(filesTab, picker, false);
						return;
					}
				}
			}

			const resolved = this._resolveTabFromValue(value);
			if (resolved) {
				if (resolved.shortcut) {
					this._arrivedViaShortcut = resolved.shortcut;
				}
				if (resolved.tab !== this._currentTab) {
					this._switchTab(resolved.tab, picker, true);
				}
			}

			// Update custom button label
			this._updateCustomButtonLabel(picker);
		}));

		// Handle custom button click (Send / Open Chat)
		this._currentDisposables.add(picker.onDidCustom(() => {
			const hasInput = picker.value.trim().length > 0;
			if (hasInput) {
				this._sendToAgent(picker.value.trim());
			} else {
				this._openChat();
			}
		}));

		// Handle hide
		this._currentDisposables.add(picker.onDidHide(() => {
			this._inUnifiedQuickAccessContext.set(false);
			this._providerDisposables.clear();
			this._providerCts?.cancel();
			this._providerCts = undefined;
			this._currentPicker = undefined;
			this._currentTab = undefined;
			this._arrivedViaShortcut = undefined;
			this._radio = undefined;
			this._currentDisposables.clear();
		}));

		picker.show();
	}

	/**
	 * Hide the unified quick access widget if visible.
	 */
	hide(): void {
		this._currentPicker?.hide();
	}

	/**
	 * Set up the Radio tab bar using the picker's {@link IQuickPick.headerWidget} slot.
	 */
	private _setupTabBar(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>): void {
		const tabBarContainer = $('div.unified-quick-access-tabs');

		const hoverDelegate = this._currentDisposables.add(createInstantHoverDelegate());
		const radioItems: IRadioOptionItem[] = this._tabs.map(tab => ({
			text: tab.label,
			tooltip: tab.tooltip,
			isActive: tab === this._currentTab,
		}));

		const radio = this._currentDisposables.add(new Radio({
			items: radioItems,
			hoverDelegate,
		}));
		this._radio = radio;

		tabBarContainer.appendChild(radio.domNode);

		this._currentDisposables.add(radio.onDidSelect(index => {
			const selectedTab = this._tabs[index];
			if (selectedTab && selectedTab !== this._currentTab) {
				this._switchTab(selectedTab, picker, false);
			}
		}));

		// Use the picker's headerWidget slot - no DOM injection needed
		picker.headerWidget = tabBarContainer;
	}

	/**
	 * Configure the picker's built-in custom button for Send / Open Chat.
	 */
	private _setupCustomButton(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>): void {
		picker.customButton = true;
		this._updateCustomButtonLabel(picker);
	}

	/**
	 * Update the custom button label and tooltip based on the current input value.
	 * When input is present, shows "Send" with Shift+Enter hint.
	 * When empty, shows "Open Chat" with keybinding.
	 */
	private _updateCustomButtonLabel(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>): void {
		const hasInput = picker.value.trim().length > 0;

		if (hasInput) {
			const sendKeybinding = this.keybindingService.lookupKeybinding(SEND_TO_AGENT_COMMAND_ID);
			const sendLabel = sendKeybinding?.getLabel();
			picker.customLabel = `$(send) ${localize('send', "Send")}`;
			picker.customHover = sendLabel
				? localize('sendTooltipWithKeybinding', "Send to agent ({0})", sendLabel)
				: localize('sendTooltipNoKeybinding', "Send message to new agent session");
		} else {
			const openChatKeybinding = this.keybindingService.lookupKeybinding(CHAT_OPEN_ACTION_ID);
			const openChatLabel = openChatKeybinding?.getLabel() ?? '';
			picker.customLabel = localize('openChat', "Open Chat");
			picker.customHover = openChatLabel
				? localize('openChatTooltipWithKeybinding', "Open chat ({0})", openChatLabel)
				: localize('openChatTooltipNoKeybinding', "Open chat");
		}
	}

	/**
	 * Open chat without sending a message.
	 */
	private _openChat(): void {
		this.hide();
		this.commandService.executeCommand(CHAT_OPEN_ACTION_ID);
	}

	/**
	 * Create a new agent session and send the given message.
	 */
	private async _sendToAgent(message: string): Promise<void> {
		if (!message) {
			return;
		}
		this.hide();
		await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
		const options: IChatViewOpenOptions = {
			query: message,
			isPartialQuery: false,
		};
		this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, options);
	}

	/**
	 * Send the picker value with prefix or shortcut character stripped.
	 * Called by the Shift+Enter keybinding command.
	 */
	sendCurrentMessage(): void {
		if (!this._currentPicker) {
			return;
		}
		const value = this._currentPicker.value;
		let message = value;
		if (this._arrivedViaShortcut && message.startsWith(this._arrivedViaShortcut)) {
			message = message.substring(1).trim();
		} else if (this._currentTab && value.startsWith(this._currentTab.prefix)) {
			message = value.substring(this._currentTab.prefix.length).trim();
		}
		this._sendToAgent(message.trim());
	}

	/**
	 * Switch to a different tab.
	 */
	private _switchTab(tab: IUnifiedQuickAccessTab, picker: IQuickPick<IQuickPickItem, { useSeparators: true }>, preserveFilterText: boolean): void {
		if (tab === this._currentTab) {
			return;
		}

		const previousTab = this._currentTab;
		this._currentTab = tab;

		// Update Radio selection via stored reference (no monkey-patching)
		if (this._radio) {
			const index = this._tabs.indexOf(tab);
			if (index >= 0) {
				this._radio.setActiveItem(index);
			}
		}

		// Update picker value (with flag to prevent recursive tab detection)
		this._isInternalValueChange = true;
		if (preserveFilterText && previousTab) {
			// User typed a shortcut prefix - normalize the value to show just the shortcut character
			const currentValue = picker.value;

			// Strip previous tab's prefix if present
			let filterText = currentValue;
			if (currentValue.startsWith(previousTab.prefix)) {
				filterText = currentValue.substring(previousTab.prefix.length);
			}

			// Handle shortcut transitions - ensure only one shortcut char is shown
			if (this._arrivedViaShortcut === '<' && tab.id === 'agentSessions') {
				// Strip any leading "<" chars and set just one
				filterText = filterText.replace(/^<+/, '');
				picker.value = '<' + filterText;
			} else if (this._arrivedViaShortcut === '>' && tab.id === 'commands') {
				// Strip any leading ">" chars and set just one
				filterText = filterText.replace(/^>+/, '');
				picker.value = '>' + filterText;
			} else {
				// Normal prefix-based switching
				picker.value = tab.prefix + filterText;
			}
		} else if (previousTab) {
			// User clicked tab - keep current text but strip old prefix (don't add new prefix)
			const currentValue = picker.value;
			if (currentValue.startsWith(previousTab.prefix)) {
				picker.value = currentValue.substring(previousTab.prefix.length);
			}
			// Also strip shortcut character if present
			if (picker.value.startsWith('<') || picker.value.startsWith('>')) {
				picker.value = picker.value.substring(1);
			}
			// Clear shortcut tracking when switching via click
			this._arrivedViaShortcut = undefined;
		}
		// else: first tab activation, value already set
		this._isInternalValueChange = false;

		picker.placeholder = tab.placeholder;

		// Re-activate provider
		this._activateProvider(tab, picker);
	}

	/**
	 * Resolve which tab matches the current value based on prefix.
	 * Returns the matched tab and an optional shortcut character that triggered the match.
	 * Supports shortcut keys: ">" for Commands, "<" for Sessions.
	 */
	private _resolveTabFromValue(value: string): { tab: IUnifiedQuickAccessTab; shortcut?: '<' | '>' } | undefined {
		// Check for "<" shortcut to switch to Sessions (from Files or Commands)
		if (value === '<' || value.startsWith('<')) {
			const sessionsTab = this._tabs.find(t => t.id === 'agentSessions');
			if (sessionsTab && this._currentTab?.id !== 'agentSessions') {
				return { tab: sessionsTab, shortcut: '<' };
			}
		}

		// Check for ">" shortcut to switch to Commands (from Files or Sessions)
		if (value === '>' || value.startsWith('>')) {
			const commandsTab = this._tabs.find(t => t.id === 'commands');
			if (commandsTab && this._currentTab?.id !== 'commands') {
				return { tab: commandsTab, shortcut: '>' };
			}
		}

		// Don't auto-switch if current tab matches (user is just typing)
		if (this._currentTab && value.startsWith(this._currentTab.prefix)) {
			return { tab: this._currentTab };
		}

		// Sort by prefix length descending to match most specific first
		// Skip empty prefix - it would match everything
		const sortedTabs = [...this._tabs]
			.filter(tab => tab.prefix.length > 0)
			.sort((a, b) => b.prefix.length - a.prefix.length);

		const matched = sortedTabs.find(tab => value.startsWith(tab.prefix));
		return matched ? { tab: matched } : undefined;
	}

	/**
	 * Activate the provider for a given tab.
	 */
	private _activateProvider(tab: IUnifiedQuickAccessTab, picker: IQuickPick<IQuickPickItem, { useSeparators: true }>): void {
		// Clear previous provider resources
		this._providerDisposables.clear();
		this._providerCts?.cancel();
		this._providerCts = new CancellationTokenSource();
		this._providerDisposables.add(this._providerCts);

		// Clear items while loading
		picker.items = [];
		picker.busy = true;

		// Get provider for this tab's prefix
		const [provider] = this._getOrInstantiateProvider(tab.prefix);

		if (provider) {
			// Configure filtering - strip the tab's prefix or shortcut character from the filter value
			const tabPrefix = tab.prefix;
			const arrivedViaShortcut = this._arrivedViaShortcut;
			picker.filterValue = (value: string) => {
				// If arrived via shortcut, strip the shortcut character
				if (arrivedViaShortcut && value.startsWith(arrivedViaShortcut)) {
					return value.substring(1);
				}
				// Otherwise strip the normal prefix
				if (value.startsWith(tabPrefix)) {
					return value.substring(tabPrefix.length);
				}
				return value;
			};

			// Let provider populate the picker
			const providerDisposable = provider.provide(picker, this._providerCts.token);
			this._providerDisposables.add(providerDisposable);
		} else {
			picker.busy = false;
			picker.items = [{
				label: localize('noProvider', "No provider available for this tab"),
				alwaysShow: true,
			}];
		}
	}

	/**
	 * Get or create a provider instance for the given prefix.
	 */
	private _getOrInstantiateProvider(prefix: string): [IQuickAccessProvider | undefined, IQuickAccessProviderDescriptor | undefined] {
		// Try to find provider by exact prefix match first
		const providerDescriptor = this.registry.getQuickAccessProvider(prefix, this.contextKeyService);

		if (!providerDescriptor) {
			return [undefined, undefined];
		}

		let provider = this.mapProviderToDescriptor.get(providerDescriptor);
		if (!provider) {
			provider = this.instantiationService.createInstance(providerDescriptor.ctor);
			this.mapProviderToDescriptor.set(providerDescriptor, provider);
		}

		return [provider, providerDescriptor];
	}

	override dispose(): void {
		this._providerCts?.cancel();
		for (const provider of this.mapProviderToDescriptor.values()) {
			if (isDisposable(provider)) {
				provider.dispose();
			}
		}
		super.dispose();
	}
}
