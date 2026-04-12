/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import './media/unifiedQuickAccess.css';
import { $, addDisposableListener, EventType } from '../../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, isDisposable } from '../../../../../../base/common/lifecycle.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../../../nls.js';
import { Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Extensions } from '../../../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { createInstantHoverDelegate, getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Event } from '../../../../../../base/common/event.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID } from '../../actions/chatActions.js';
/** Marker ID for the "send to agent" quick pick item */
const SEND_TO_AGENT_ID = 'unified-quick-access-send-to-agent';
/**
 * Default tabs for the unified quick access widget.
 */
export const DEFAULT_UNIFIED_QUICK_ACCESS_TABS = [
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
 * Combines multiple QuickAccessProviders into a single tabbed interface.
 */
let UnifiedQuickAccess = class UnifiedQuickAccess extends Disposable {
    constructor(tabs, quickInputService, instantiationService, contextKeyService, layoutService, commandService, keybindingService, hoverService) {
        super();
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.layoutService = layoutService;
        this.commandService = commandService;
        this.keybindingService = keybindingService;
        this.hoverService = hoverService;
        this.registry = Registry.as(Extensions.Quickaccess);
        this.mapProviderToDescriptor = new Map();
        this._currentDisposables = this._register(new DisposableStore());
        this._providerDisposables = this._register(new DisposableStore());
        this._isInternalValueChange = false; // Flag to prevent recursive tab detection
        this._isUpdatingSendToAgent = false; // Guard to prevent infinite loop
        this._tabs = tabs ?? DEFAULT_UNIFIED_QUICK_ACCESS_TABS;
    }
    /**
     * Show the unified quick access widget.
     * @param initialTabId Optional tab ID to start with. Defaults to first tab.
     * @param initialValue Optional initial filter value.
     */
    show(initialTabId, initialValue) {
        // If already showing, just focus
        if (this._currentPicker) {
            return;
        }
        this._currentDisposables.clear();
        // Create picker
        const picker = this._currentDisposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
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
        // Create and inject tab bar into the picker
        this._injectTabBar(picker);
        // Set initial value and activate tab
        // Start with empty value (don't prefill prefix) so user can type naturally
        this._isInternalValueChange = true;
        picker.value = initialValue ?? '';
        picker.placeholder = initialTab.placeholder;
        this._isInternalValueChange = false;
        // Start providing items for initial tab
        this._activateProvider(initialTab, picker);
        // Handle value changes - detect prefix changes to switch tabs
        this._currentDisposables.add(picker.onDidChangeValue(value => {
            if (this._isInternalValueChange) {
                return;
            }
            // Check if user removed the shortcut character (including when input is emptied) - switch back to Files
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
            const matchingTab = this._detectTabFromValue(value);
            if (matchingTab && matchingTab !== this._currentTab) {
                this._switchTab(matchingTab, picker, true);
            }
            // Update send button state based on input
            this._updateSendButtonState(value);
            // Debounce send-to-agent check to let provider finish
            if (this._sendToAgentTimeout) {
                clearTimeout(this._sendToAgentTimeout);
            }
            this._sendToAgentTimeout = setTimeout(() => this._maybeShowSendToAgent(picker), 150);
        }));
        // Handle accept - send to agent if no real items or send-to-agent is selected
        this._currentDisposables.add(picker.onDidAccept(() => {
            const selectedItems = picker.selectedItems;
            const activeItems = picker.activeItems;
            // Check if send-to-agent item is selected
            const sendToAgentSelected = selectedItems.length > 0 &&
                selectedItems[0].id === SEND_TO_AGENT_ID;
            // Check if there are any real items active (not send-to-agent)
            const hasRealActiveItem = activeItems.some(item => item.id !== SEND_TO_AGENT_ID);
            // Get the filter text (without prefix or shortcut character)
            let filterText;
            if (this._arrivedViaShortcut && picker.value.startsWith(this._arrivedViaShortcut)) {
                filterText = picker.value.substring(1).trim();
            }
            else if (this._currentTab) {
                filterText = picker.value.substring(this._currentTab.prefix.length).trim();
            }
            else {
                filterText = picker.value.trim();
            }
            // Send to agent if:
            // 1. Send-to-agent item is explicitly selected, OR
            // 2. No real items are active AND user has typed something
            if (sendToAgentSelected || (!hasRealActiveItem && filterText)) {
                this._sendMessage(picker.value);
            }
        }));
        // Handle hide
        this._currentDisposables.add(picker.onDidHide(() => {
            this._providerDisposables.clear();
            this._providerCts?.cancel();
            this._providerCts = undefined;
            this._currentPicker = undefined;
            this._currentTab = undefined;
            this._arrivedViaShortcut = undefined;
            // Clear any pending timeout
            if (this._sendToAgentTimeout) {
                clearTimeout(this._sendToAgentTimeout);
                this._sendToAgentTimeout = undefined;
            }
            // Remove the injected tab bar from DOM
            this._tabBarContainer?.remove();
            this._tabBarContainer = undefined;
            // Clear button references
            this._sendButton = undefined;
            this._sendButtonLabel = undefined;
            this._sendButtonIcon = undefined;
            this._sendButtonHover = undefined;
            this._currentDisposables.clear();
        }));
        // Show picker
        picker.show();
    }
    /**
     * Hide the unified quick access widget if visible.
     */
    hide() {
        this._currentPicker?.hide();
    }
    /**
     * Check if the widget is currently visible.
     */
    get isVisible() {
        return !!this._currentPicker;
    }
    /**
     * Inject the custom tab bar into the picker's header area.
     */
    _injectTabBar(picker) {
        // Wait for picker to be shown to access DOM
        const showDisposable = this._currentDisposables.add(Event.once(this.quickInputService.onShow)(() => {
            this._currentDisposables.delete(showDisposable);
            // Find the quick input widget container via layout service
            // eslint-disable-next-line no-restricted-syntax
            const quickInputWidget = this.layoutService.activeContainer.querySelector('.quick-input-widget');
            if (!quickInputWidget) {
                return;
            }
            // Find the header element (contains input box) and list element
            // eslint-disable-next-line no-restricted-syntax
            const header = quickInputWidget.querySelector('.quick-input-header');
            // eslint-disable-next-line no-restricted-syntax
            const list = quickInputWidget.querySelector('.quick-input-list');
            if (!header || !list) {
                return;
            }
            // Create tab bar container
            const tabBarContainer = $('div.unified-quick-access-tabs');
            this._tabBarContainer = tabBarContainer;
            // Create Radio widget for tabs
            const hoverDelegate = this._currentDisposables.add(createInstantHoverDelegate());
            const radioItems = this._tabs.map(tab => ({
                text: tab.label,
                tooltip: tab.tooltip,
                isActive: tab === this._currentTab,
            }));
            const radio = this._currentDisposables.add(new Radio({
                items: radioItems,
                hoverDelegate,
            }));
            tabBarContainer.appendChild(radio.domNode);
            // Handle tab selection
            this._currentDisposables.add(radio.onDidSelect(index => {
                const selectedTab = this._tabs[index];
                if (selectedTab && selectedTab !== this._currentTab) {
                    this._switchTab(selectedTab, picker, false);
                }
            }));
            // Create send button (far right)
            const sendButton = this._createSendButton(picker);
            tabBarContainer.appendChild(sendButton);
            // Insert tab bar between the header (input box) and the list (results)
            list.parentElement?.insertBefore(tabBarContainer, list);
            // Store reference to radio for updates
            picker._unifiedRadio = radio;
        }));
    }
    /**
     * Create the send button.
     */
    _createSendButton(picker) {
        const container = $('div.unified-quick-access-send-container');
        // Create send button
        const button = $('button.unified-send-button');
        button.setAttribute('type', 'button');
        this._sendButton = button;
        const icon = renderIcon(Codicon.send);
        icon.classList.add('unified-send-icon');
        this._sendButtonIcon = icon;
        button.appendChild(icon);
        const labelSpan = $('span.unified-send-label');
        this._sendButtonLabel = labelSpan;
        button.appendChild(labelSpan);
        container.appendChild(button);
        // Set up managed hover for the button
        this._sendButtonHover = this._currentDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), button, ''));
        // Initialize button state
        this._updateSendButtonState(picker.value);
        // Click handler - behavior depends on input state
        this._currentDisposables.add(addDisposableListener(button, EventType.CLICK, (e) => {
            e.preventDefault();
            e.stopPropagation();
            const hasInput = picker.value.trim().length > 0;
            if (hasInput) {
                this._sendMessageRaw(picker.value);
            }
            else {
                this._openChat();
            }
        }));
        return container;
    }
    /**
     * Update the send button label and tooltip based on input state.
     */
    _updateSendButtonState(value) {
        if (!this._sendButton || !this._sendButtonLabel || !this._sendButtonIcon) {
            return;
        }
        const hasInput = value.trim().length > 0;
        if (hasInput) {
            // Show "Send" with no keybinding in tooltip (Enter is implied by quick pick)
            this._sendButtonLabel.textContent = localize('send', "Send");
            this._sendButtonHover?.update(localize('sendTooltipNoKeybinding', "Send message to new agent session"));
            this._sendButtonIcon.style.display = '';
        }
        else {
            // Show "Open Chat" with open chat keybinding and hide icon
            const openChatKeybinding = this.keybindingService.lookupKeybinding(CHAT_OPEN_ACTION_ID);
            const openChatLabel = openChatKeybinding?.getLabel() ?? '';
            this._sendButtonLabel.textContent = localize('openChat', "Open Chat");
            const tooltip = openChatLabel
                ? localize('openChatTooltipWithKeybinding', "Open chat ({0})", openChatLabel)
                : localize('openChatTooltipNoKeybinding', "Open chat");
            this._sendButtonHover?.update(tooltip);
            this._sendButtonIcon.style.display = 'none';
        }
    }
    /**
     * Open chat without sending a message.
     */
    _openChat() {
        this.hide();
        this.commandService.executeCommand(CHAT_OPEN_ACTION_ID);
    }
    /**
     * Send the exact message to a new agent session (no prefix stripping).
     */
    async _sendMessageRaw(value) {
        const message = value.trim();
        if (!message) {
            return;
        }
        // Hide the picker first
        this.hide();
        // Always create a new chat first
        await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
        // Then send the message to the new chat
        const options = {
            query: message,
            isPartialQuery: false,
        };
        this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, options);
    }
    /**
     * Send the current message to a new agent session (strips prefix or shortcut character).
     */
    async _sendMessage(value) {
        // Strip any prefix or shortcut character from the value
        let message = value;
        // First, strip shortcut character if we arrived via shortcut
        if (this._arrivedViaShortcut && message.startsWith(this._arrivedViaShortcut)) {
            message = message.substring(1).trim();
        }
        else if (this._currentTab) {
            // Otherwise strip the normal prefix
            if (value.startsWith(this._currentTab.prefix)) {
                message = value.substring(this._currentTab.prefix.length).trim();
            }
        }
        if (!message) {
            return;
        }
        // Hide the picker first
        this.hide();
        // Always create a new chat first
        await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
        // Then send the message to the new chat
        const options = {
            query: message,
            isPartialQuery: false,
        };
        this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, options);
    }
    /**
     * Check if we should show the "send to agent" item.
     * Always shows it as the first item when user has typed something.
     */
    _maybeShowSendToAgent(picker) {
        // Guard against recursive calls
        if (this._isUpdatingSendToAgent) {
            return;
        }
        // Get the filter text (without prefix or shortcut character)
        let filterText;
        if (this._arrivedViaShortcut && picker.value.startsWith(this._arrivedViaShortcut)) {
            // Strip shortcut character
            filterText = picker.value.substring(1).trim();
        }
        else if (this._currentTab) {
            filterText = picker.value.substring(this._currentTab.prefix.length).trim();
        }
        else {
            filterText = picker.value.trim();
        }
        // Use full input if filter text is empty but there's input (user typed without prefix)
        const fullInput = picker.value.trim();
        const messageToSend = filterText || fullInput;
        // Only show if user has typed something
        if (!messageToSend) {
            return;
        }
        // Don't show if picker is still loading
        if (picker.busy) {
            return;
        }
        // Check if send-to-agent is already the first item with same description
        const firstItem = picker.items[0];
        if (firstItem?.id === SEND_TO_AGENT_ID && firstItem.description === fullInput) {
            return; // Already showing correct send-to-agent item
        }
        // Create the send-to-agent item
        const sendItem = {
            id: SEND_TO_AGENT_ID,
            label: `$(send) ${localize('sendToAgentLabel', "Send to agent")}`,
            description: fullInput,
            alwaysShow: true,
            ariaLabel: localize('sendToAgentAria', "Send message to agent: {0}", fullInput),
        };
        // Get current items, excluding any existing send-to-agent item
        const currentItems = picker.items.filter(item => item.id !== SEND_TO_AGENT_ID);
        // Determine if we should show send-to-agent as first item:
        // - Always on Sessions tab (agent sessions)
        // - Only if no other items exist on Commands/Files tabs
        const isSessionsTab = this._currentTab?.id === 'agentSessions';
        const hasOtherItems = currentItems.length > 0;
        const showFirst = isSessionsTab || !hasOtherItems;
        // Set guard and update items
        this._isUpdatingSendToAgent = true;
        try {
            if (showFirst) {
                picker.items = [sendItem, ...currentItems];
            }
            else {
                // Don't show send-to-agent on Commands/Files when there are matches
                picker.items = currentItems;
            }
        }
        finally {
            this._isUpdatingSendToAgent = false;
        }
    }
    /**
     * Switch to a different tab.
     */
    _switchTab(tab, picker, preserveFilterText) {
        if (tab === this._currentTab) {
            return;
        }
        const previousTab = this._currentTab;
        this._currentTab = tab;
        // Update Radio selection
        const radio = picker._unifiedRadio;
        if (radio) {
            const index = this._tabs.indexOf(tab);
            if (index >= 0) {
                radio.setActiveItem(index);
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
            }
            else if (this._arrivedViaShortcut === '>' && tab.id === 'commands') {
                // Strip any leading ">" chars and set just one
                filterText = filterText.replace(/^>+/, '');
                picker.value = '>' + filterText;
            }
            else {
                // Normal prefix-based switching
                picker.value = tab.prefix + filterText;
            }
        }
        else if (previousTab) {
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
     * Detect which tab matches the current value based on prefix.
     * Only switches away from current tab if user explicitly typed a different prefix.
     * Supports shortcut keys: ">" for Commands, "<" for Sessions.
     */
    _detectTabFromValue(value) {
        // Check for "<" shortcut to switch to Sessions (from Files or Commands)
        if (value === '<' || value.startsWith('<')) {
            const sessionsTab = this._tabs.find(t => t.id === 'agentSessions');
            if (sessionsTab && this._currentTab?.id !== 'agentSessions') {
                this._arrivedViaShortcut = '<';
                return sessionsTab;
            }
        }
        // Check for ">" shortcut to switch to Commands (from Files or Sessions)
        if (value === '>' || value.startsWith('>')) {
            const commandsTab = this._tabs.find(t => t.id === 'commands');
            if (commandsTab && this._currentTab?.id !== 'commands') {
                this._arrivedViaShortcut = '>';
                return commandsTab;
            }
        }
        // Don't auto-switch if current tab matches (user is just typing)
        if (this._currentTab && value.startsWith(this._currentTab.prefix)) {
            return this._currentTab;
        }
        // Sort by prefix length descending to match most specific first
        // Skip empty prefix - it would match everything
        const sortedTabs = [...this._tabs]
            .filter(tab => tab.prefix.length > 0)
            .sort((a, b) => b.prefix.length - a.prefix.length);
        return sortedTabs.find(tab => value.startsWith(tab.prefix));
    }
    /**
     * Activate the provider for a given tab.
     */
    _activateProvider(tab, picker) {
        // Clear previous provider resources
        this._providerDisposables.clear();
        this._providerCts?.cancel();
        this._providerCts = new CancellationTokenSource();
        this._providerDisposables.add(this._providerCts);
        // Special handling for Send tab - no provider needed
        if (tab.isSendTab) {
            picker.busy = false;
            picker.items = [{
                    label: localize('pressSendOrEnter', "Press Enter or click Send to create a new agent session"),
                    alwaysShow: true,
                }];
            return;
        }
        // Clear items while loading
        picker.items = [];
        picker.busy = true;
        // Get provider for this tab's prefix
        const [provider] = this._getOrInstantiateProvider(tab.prefix);
        if (provider) {
            // Configure filtering - strip the tab's prefix or shortcut character from the filter value
            const tabPrefix = tab.prefix;
            const arrivedViaShortcut = this._arrivedViaShortcut;
            picker.filterValue = (value) => {
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
        }
        else {
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
    _getOrInstantiateProvider(prefix) {
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
    dispose() {
        this._providerCts?.cancel();
        for (const provider of this.mapProviderToDescriptor.values()) {
            if (isDisposable(provider)) {
                provider.dispose();
            }
        }
        super.dispose();
    }
};
UnifiedQuickAccess = __decorate([
    __param(1, IQuickInputService),
    __param(2, IInstantiationService),
    __param(3, IContextKeyService),
    __param(4, ILayoutService),
    __param(5, ICommandService),
    __param(6, IKeybindingService),
    __param(7, IHoverService)
], UnifiedQuickAccess);
export { UnifiedQuickAccess };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5pZmllZFF1aWNrQWNjZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvZXhwZXJpbWVudHMvdW5pZmllZFF1aWNrQWNjZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sZ0NBQWdDLENBQUM7QUFDeEMsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1RixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RyxPQUFPLEVBQUUsa0JBQWtCLEVBQThCLE1BQU0sNERBQTRELENBQUM7QUFDNUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxLQUFLLEVBQW9CLE1BQU0sa0RBQWtELENBQUM7QUFDM0YsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDeEYsT0FBTyxFQUFFLFVBQVUsRUFBOEUsTUFBTSw2REFBNkQsQ0FBQztBQUNySyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLHVCQUF1QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDdEksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFP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