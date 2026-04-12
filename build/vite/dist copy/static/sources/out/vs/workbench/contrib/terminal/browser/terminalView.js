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
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import * as cssJs from '../../../../base/browser/cssValue.js';
import { Action } from '../../../../base/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { switchTerminalShowTabsTitle } from './terminalActions.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ITerminalConfigurationService, ITerminalGroupService, ITerminalService } from './terminal.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../common/terminal.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ActionViewItem, SelectActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { asCssVariable, selectBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { SeparatorSelectOption } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { TerminalTabbedView } from './terminalTabbedView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { getColorForSeverity } from './terminalStatusList.js';
import { getFlatContextMenuActions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { DisposableMap, DisposableStore, dispose, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { getColorClass, getUriClasses } from './terminalIcon.js';
import { getTerminalActionBarArgs } from './terminalMenus.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { getInstanceHoverInfo } from './terminalTooltip.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Event } from '../../../../base/common/event.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { InstanceContext, TerminalContextActionRunner } from './terminalContextMenu.js';
import { MicrotaskDelay } from '../../../../base/common/symbols.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { hasKey } from '../../../../base/common/types.js';
let TerminalViewPane = class TerminalViewPane extends ViewPane {
    get terminalTabbedView() { return this._terminalTabbedView; }
    constructor(options, keybindingService, _contextKeyService, viewDescriptorService, _configurationService, contextMenuService, _instantiationService, _terminalService, _terminalConfigurationService, _terminalGroupService, themeService, hoverService, _notificationService, _keybindingService, openerService, _menuService, _terminalProfileService, _terminalProfileResolverService) {
        super(options, keybindingService, contextMenuService, _configurationService, _contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, hoverService);
        this._contextKeyService = _contextKeyService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._terminalService = _terminalService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._terminalGroupService = _terminalGroupService;
        this._notificationService = _notificationService;
        this._keybindingService = _keybindingService;
        this._menuService = _menuService;
        this._terminalProfileService = _terminalProfileService;
        this._terminalProfileResolverService = _terminalProfileResolverService;
        this._isInitialized = false;
        /**
         * Tracks an active promise of terminal creation requested by this component. This helps prevent
         * double creation for example when toggling a terminal's visibility and focusing it.
         */
        this._isTerminalBeingCreated = false;
        this._newDropdown = this._register(new MutableDisposable());
        this._disposableStore = this._register(new DisposableStore());
        this._actionDisposables = this._register(new DisposableMap());
        this._register(this._terminalService.onDidRegisterProcessSupport(() => {
            this._onDidChangeViewWelcomeState.fire();
        }));
        this._register(this._terminalService.onDidChangeInstances(() => {
            // If the first terminal is opened, hide the welcome view
            // and if the last one is closed, show it again
            if (this._hasWelcomeScreen() && this._terminalGroupService.instances.length <= 1) {
                this._onDidChangeViewWelcomeState.fire();
            }
            if (!this._parentDomElement) {
                return;
            }
            // If we do not have the tab view yet, create it now.
            if (!this._terminalTabbedView) {
                this._createTabsView();
            }
            this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
        }));
        this._dropdownMenu = this._register(this._menuService.createMenu(MenuId.TerminalNewDropdownContext, this._contextKeyService));
        this._singleTabMenu = this._register(this._menuService.createMenu(MenuId.TerminalTabContext, this._contextKeyService));
        this._register(this._terminalProfileService.onDidChangeAvailableProfiles(profiles => this._updateTabActionBar(profiles)));
        this._viewShowing = TerminalContextKeys.viewShowing.bindTo(this._contextKeyService);
        this._register(this.onDidChangeBodyVisibility(e => {
            if (e) {
                this._terminalTabbedView?.rerenderTabs();
            }
        }));
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (this._parentDomElement && (e.affectsConfiguration("terminal.integrated.shellIntegration.decorationsEnabled" /* TerminalSettingId.ShellIntegrationDecorationsEnabled */) || e.affectsConfiguration("terminal.integrated.shellIntegration.enabled" /* TerminalSettingId.ShellIntegrationEnabled */))) {
                this._updateForShellIntegration(this._parentDomElement);
            }
        }));
        const shellIntegrationDisposable = this._register(new MutableDisposable());
        shellIntegrationDisposable.value = this._terminalService.onAnyInstanceAddedCapabilityType(c => {
            if (c === 2 /* TerminalCapability.CommandDetection */ && this._gutterDecorationsEnabled()) {
                this._parentDomElement?.classList.add('shell-integration');
                shellIntegrationDisposable.clear();
            }
        });
    }
    _updateForShellIntegration(container) {
        container.classList.toggle('shell-integration', this._gutterDecorationsEnabled());
    }
    _gutterDecorationsEnabled() {
        const decorationsEnabled = this._configurationService.getValue("terminal.integrated.shellIntegration.decorationsEnabled" /* TerminalSettingId.ShellIntegrationDecorationsEnabled */);
        return (decorationsEnabled === 'both' || decorationsEnabled === 'gutter') && this._configurationService.getValue("terminal.integrated.shellIntegration.enabled" /* TerminalSettingId.ShellIntegrationEnabled */);
    }
    _initializeTerminal(checkRestoredTerminals) {
        if (this.isBodyVisible() && this._terminalService.isProcessSupportRegistered && this._terminalService.connectionState === 1 /* TerminalConnectionState.Connected */) {
            const wasInitialized = this._isInitialized;
            this._isInitialized = true;
            let hideOnStartup = 'never';
            if (!wasInitialized) {
                hideOnStartup = this._configurationService.getValue("terminal.integrated.hideOnStartup" /* TerminalSettingId.HideOnStartup */);
                if (hideOnStartup === 'always') {
                    this._terminalGroupService.hidePanel();
                }
            }
            let shouldCreate = this._terminalGroupService.groups.length === 0;
            // When triggered just after reconnection, also check there are no groups that could be
            // getting restored currently
            if (checkRestoredTerminals) {
                shouldCreate &&= this._terminalService.restoredGroupCount === 0;
            }
            if (!shouldCreate) {
                return;
            }
            if (!wasInitialized) {
                switch (hideOnStartup) {
                    case 'never':
                        this._isTerminalBeingCreated = true;
                        this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
                        break;
                    case 'whenEmpty':
                        if (this._terminalService.restoredGroupCount === 0) {
                            this._terminalGroupService.hidePanel();
                        }
                        break;
                }
                return;
            }
            if (!this._isTerminalBeingCreated) {
                this._isTerminalBeingCreated = true;
                this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
            }
        }
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    renderBody(container) {
        super.renderBody(container);
        if (!this._parentDomElement) {
            this._updateForShellIntegration(container);
        }
        this._parentDomElement = container;
        this._parentDomElement.classList.add('integrated-terminal');
        domStylesheetsJs.createStyleSheet(this._parentDomElement);
        this._instantiationService.createInstance(TerminalThemeIconStyle, this._parentDomElement);
        if (!this.shouldShowWelcome()) {
            this._createTabsView();
        }
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.fontFamily" /* TerminalSettingId.FontFamily */) || e.affectsConfiguration('editor.fontFamily')) {
                if (!this._terminalConfigurationService.configFontIsMonospace()) {
                    const choices = [{
                            label: nls.localize('terminal.useMonospace', "Use 'monospace'"),
                            run: () => this.configurationService.updateValue("terminal.integrated.fontFamily" /* TerminalSettingId.FontFamily */, 'monospace'),
                        }];
                    this._notificationService.prompt(Severity.Warning, nls.localize('terminal.monospaceOnly', "The terminal only supports monospace fonts. Be sure to restart VS Code if this is a newly installed font."), choices);
                }
            }
        }));
        this._register(this.onDidChangeBodyVisibility(async (visible) => {
            this._viewShowing.set(visible);
            if (visible) {
                if (this._hasWelcomeScreen()) {
                    this._onDidChangeViewWelcomeState.fire();
                }
                this._initializeTerminal(false);
                // we don't know here whether or not it should be focused, so
                // defer focusing the panel to the focus() call
                // to prevent overriding preserveFocus for extensions
                this._terminalGroupService.showPanel(false);
            }
            else {
                for (const instance of this._terminalGroupService.instances) {
                    instance.resetFocusContextKey();
                }
            }
            this._terminalGroupService.updateVisibility();
        }));
        this._register(this._terminalService.onDidChangeConnectionState(() => this._initializeTerminal(true)));
        this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
    }
    _createTabsView() {
        if (!this._parentDomElement) {
            return;
        }
        this._terminalTabbedView = this._register(this.instantiationService.createInstance(TerminalTabbedView, this._parentDomElement));
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this._terminalTabbedView?.layout(width, height);
    }
    createActionViewItem(action, options) {
        switch (action.id) {
            case "workbench.action.terminal.split" /* TerminalCommandId.Split */: {
                // Split needs to be special cased to force splitting within the panel, not the editor
                const that = this;
                const store = new DisposableStore();
                const panelOnlySplitAction = store.add(new class extends Action {
                    constructor() {
                        super(action.id, action.label, action.class, action.enabled);
                        this.checked = action.checked;
                        this.tooltip = action.tooltip;
                    }
                    async run() {
                        const instance = that._terminalGroupService.activeInstance;
                        if (instance) {
                            const newInstance = await that._terminalService.createTerminal({ location: { parentTerminal: instance } });
                            return newInstance?.focusWhenReady();
                        }
                        return;
                    }
                });
                const item = store.add(new ActionViewItem(action, panelOnlySplitAction, { ...options, icon: true, label: false, keybinding: this._getKeybindingLabel(action) }));
                this._actionDisposables.set(action.id, store);
                return item;
            }
            case "workbench.action.terminal.switchTerminal" /* TerminalCommandId.SwitchTerminal */: {
                const item = this._instantiationService.createInstance(SwitchTerminalActionViewItem, action);
                this._actionDisposables.set(action.id, item);
                return item;
            }
            case "workbench.action.terminal.focus" /* TerminalCommandId.Focus */: {
                if (action instanceof MenuItemAction) {
                    const actions = getFlatContextMenuActions(this._singleTabMenu.getActions({ shouldForwardArgs: true }));
                    const item = this._instantiationService.createInstance(SingleTerminalTabActionViewItem, action, actions);
                    this._actionDisposables.set(action.id, item);
                    return item;
                }
                break;
            }
            case "workbench.action.terminal.new" /* TerminalCommandId.New */: {
                if (action instanceof MenuItemAction) {
                    this._disposableStore.clear();
                    const actions = getTerminalActionBarArgs(TerminalLocation.Panel, this._terminalProfileService.availableProfiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
                    this._newDropdown.value = this._instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, actions.dropdownAction, actions.dropdownMenuActions, actions.className, {
                        hoverDelegate: options.hoverDelegate,
                        getKeyBinding: (action) => this._keybindingService.lookupKeybinding(action.id, this._contextKeyService)
                    });
                    this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
                    return this._newDropdown.value;
                }
            }
        }
        return super.createActionViewItem(action, options);
    }
    _getDefaultProfileName() {
        let defaultProfileName;
        try {
            defaultProfileName = this._terminalProfileService.getDefaultProfileName();
        }
        catch (e) {
            defaultProfileName = this._terminalProfileResolverService.defaultProfileName;
        }
        return defaultProfileName;
    }
    _getKeybindingLabel(action) {
        return this._keybindingService.lookupKeybinding(action.id)?.getLabel() ?? undefined;
    }
    _updateTabActionBar(profiles) {
        this._disposableStore.clear();
        const actions = getTerminalActionBarArgs(TerminalLocation.Panel, profiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
        this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
    }
    focus() {
        super.focus();
        if (this._terminalService.connectionState === 1 /* TerminalConnectionState.Connected */) {
            if (this._terminalGroupService.instances.length === 0 && !this._isTerminalBeingCreated) {
                this._isTerminalBeingCreated = true;
                this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
            }
            this._terminalGroupService.showPanel(true);
            return;
        }
        // If the terminal is waiting to reconnect to remote terminals, then there is no TerminalInstance yet that can
        // be focused. So wait for connection to finish, then focus.
        const previousActiveElement = this.element.ownerDocument.activeElement;
        if (previousActiveElement) {
            const listener = this._register(Event.once(this._terminalService.onDidChangeConnectionState)(() => {
                // Only focus the terminal if the activeElement has not changed since focus() was called
                if (previousActiveElement && dom.isActiveElement(previousActiveElement)) {
                    this._terminalGroupService.showPanel(true);
                }
                this._store.delete(listener);
            }));
        }
    }
    _hasWelcomeScreen() {
        return !this._terminalService.isProcessSupportRegistered;
    }
    shouldShowWelcome() {
        return this._hasWelcomeScreen() && this._terminalService.instances.length === 0;
    }
};
TerminalViewPane = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextKeyService),
    __param(3, IViewDescriptorService),
    __param(4, IConfigurationService),
    __param(5, IContextMenuService),
    __param(6, IInstantiationService),
    __param(7, ITerminalService),
    __param(8, ITerminalConfigurationService),
    __param(9, ITerminalGroupService),
    __param(10, IThemeService),
    __param(11, IHoverService),
    __param(12, INotificationService),
    __param(13, IKeybindingService),
    __param(14, IOpenerService),
    __param(15, IMenuService),
    __param(16, ITerminalProfileService),
    __param(17, ITerminalProfileResolverService)
], TerminalViewPane);
export { TerminalViewPane };
let SwitchTerminalActionViewItem = class SwitchTerminalActionViewItem extends SelectActionViewItem {
    constructor(action, _terminalService, _terminalGroupService, contextViewService, terminalProfileService, configurationService) {
        super(null, action, getTerminalSelectOpenItems(_terminalService, _terminalGroupService), _terminalGroupService.activeGroupIndex, contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize('terminals', 'Open Terminals.'), optionsAsChildren: true, useCustomDrawn: !hasNativeContextMenu(configurationService) });
        this._terminalService = _terminalService;
        this._terminalGroupService = _terminalGroupService;
        this._register(_terminalService.onDidChangeInstances(() => this._updateItems(), this));
        this._register(_terminalService.onDidChangeActiveGroup(() => this._updateItems(), this));
        this._register(_terminalService.onDidChangeActiveInstance(() => this._updateItems(), this));
        this._register(_terminalService.onAnyInstanceTitleChange(() => this._updateItems(), this));
        this._register(_terminalGroupService.onDidChangeGroups(() => this._updateItems(), this));
        this._register(_terminalService.onDidChangeConnectionState(() => this._updateItems(), this));
        this._register(terminalProfileService.onDidChangeAvailableProfiles(() => this._updateItems(), this));
        this._register(_terminalService.onAnyInstancePrimaryStatusChange(() => this._updateItems(), this));
    }
    render(container) {
        super.render(container);
        container.classList.add('switch-terminal');
        container.style.borderColor = asCssVariable(selectBorder);
    }
    _updateItems() {
        const options = getTerminalSelectOpenItems(this._terminalService, this._terminalGroupService);
        this.setOptions(options, this._terminalGroupService.activeGroupIndex);
    }
};
SwitchTerminalActionViewItem = __decorate([
    __param(1, ITerminalService),
    __param(2, ITerminalGroupService),
    __param(3, IContextViewService),
    __param(4, ITerminalProfileService),
    __param(5, IConfigurationService)
], SwitchTerminalActionViewItem);
function getTerminalSelectOpenItems(terminalService, terminalGroupService) {
    let items;
    if (terminalService.connectionState === 1 /* TerminalConnectionState.Connected */) {
        items = terminalGroupService.getGroupLabels().map(label => {
            return { text: label };
        });
    }
    else {
        items = [{ text: nls.localize('terminalConnectingLabel', "Starting...") }];
    }
    items.push(SeparatorSelectOption);
    items.push({ text: switchTerminalShowTabsTitle });
    return items;
}
let SingleTerminalTabActionViewItem = class SingleTerminalTabActionViewItem extends MenuEntryActionViewItem {
    constructor(action, _actions, keybindingService, notificationService, contextKeyService, themeService, _terminalService, _terminaConfigurationService, _terminalGroupService, contextMenuService, _commandService, _instantiationService, _accessibilityService) {
        super(action, {
            draggable: true,
            hoverDelegate: _instantiationService.createInstance(SingleTabHoverDelegate)
        }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibilityService);
        this._actions = _actions;
        this._terminalService = _terminalService;
        this._terminaConfigurationService = _terminaConfigurationService;
        this._terminalGroupService = _terminalGroupService;
        this._commandService = _commandService;
        this._instantiationService = _instantiationService;
        this._elementDisposables = [];
        // Register listeners to update the tab
        this._register(Event.debounce(Event.any(this._terminalService.onAnyInstancePrimaryStatusChange, this._terminalGroupService.onDidChangeActiveInstance, Event.map(this._terminalService.onAnyInstanceIconChange, e => e.instance), this._terminalService.onAnyInstanceTitleChange, this._terminalService.onDidChangeInstanceCapability), (last, e) => {
            if (!last) {
                last = new Set();
            }
            if (e) {
                last.add(e);
            }
            return last;
        }, MicrotaskDelay)(merged => {
            for (const e of merged) {
                this.updateLabel(e);
            }
        }));
        // Clean up on dispose
        this._register(toDisposable(() => dispose(this._elementDisposables)));
    }
    async onClick(event) {
        this._terminalGroupService.lastAccessedMenu = 'inline-tab';
        if (event.altKey && this._menuItemAction.alt) {
            this._commandService.executeCommand(this._menuItemAction.alt.id, { location: TerminalLocation.Panel });
        }
        else {
            this._openContextMenu();
        }
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    updateLabel(e) {
        // Only update if it's the active instance
        if (e && e !== this._terminalGroupService.activeInstance) {
            return;
        }
        if (this._elementDisposables.length === 0 && this.element && this.label) {
            // Right click opens context menu
            this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, e => {
                if (e.button === 2) {
                    this._openContextMenu();
                    e.stopPropagation();
                    e.preventDefault();
                }
            }));
            // Middle click kills
            this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.AUXCLICK, e => {
                if (e.button === 1) {
                    const instance = this._terminalGroupService.activeInstance;
                    if (instance) {
                        this._terminalService.safeDisposeTerminal(instance);
                    }
                    e.preventDefault();
                }
            }));
            // Drag and drop
            this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.DRAG_START, e => {
                const instance = this._terminalGroupService.activeInstance;
                if (e.dataTransfer && instance) {
                    e.dataTransfer.setData("Terminals" /* TerminalDataTransfers.Terminals */, JSON.stringify([instance.resource.toString()]));
                }
            }));
        }
        if (this.label) {
            const label = this.label;
            const instance = this._terminalGroupService.activeInstance;
            if (!instance) {
                dom.reset(label, '');
                return;
            }
            label.classList.add('single-terminal-tab');
            let colorStyle = '';
            const primaryStatus = instance.statusList.primary;
            if (primaryStatus) {
                const colorKey = getColorForSeverity(primaryStatus.severity);
                this._themeService.getColorTheme();
                const foundColor = this._themeService.getColorTheme().getColor(colorKey);
                if (foundColor) {
                    colorStyle = foundColor.toString();
                }
            }
            label.style.color = colorStyle;
            dom.reset(label, ...renderLabelWithIcons(this._instantiationService.invokeFunction(getSingleTabLabel, instance, this._terminaConfigurationService.config.tabs.separator, ThemeIcon.isThemeIcon(this._commandAction.item.icon) ? this._commandAction.item.icon : undefined)));
            if (this._altCommand) {
                label.classList.remove(this._altCommand);
                this._altCommand = undefined;
            }
            if (this._color) {
                label.classList.remove(this._color);
                this._color = undefined;
            }
            if (this._class) {
                label.classList.remove(this._class);
                label.classList.remove('terminal-uri-icon');
                this._class = undefined;
            }
            const colorClass = getColorClass(instance);
            if (colorClass) {
                this._color = colorClass;
                label.classList.add(colorClass);
            }
            const uriClasses = getUriClasses(instance, this._themeService.getColorTheme().type);
            if (uriClasses) {
                this._class = uriClasses?.[0];
                label.classList.add(...uriClasses);
            }
            if (this._commandAction.item.icon) {
                this._altCommand = `alt-command`;
                label.classList.add(this._altCommand);
            }
            this.updateTooltip();
        }
    }
    _openContextMenu() {
        const actionRunner = new TerminalContextActionRunner();
        this._contextMenuService.showContextMenu({
            actionRunner,
            getAnchor: () => this.element,
            getActions: () => this._actions,
            // The context is always the active instance in the terminal view
            getActionsContext: () => {
                const instance = this._terminalGroupService.activeInstance;
                return instance ? [new InstanceContext(instance)] : [];
            },
            onHide: () => actionRunner.dispose()
        });
    }
};
SingleTerminalTabActionViewItem = __decorate([
    __param(2, IKeybindingService),
    __param(3, INotificationService),
    __param(4, IContextKeyService),
    __param(5, IThemeService),
    __param(6, ITerminalService),
    __param(7, ITerminalConfigurationService),
    __param(8, ITerminalGroupService),
    __param(9, IContextMenuService),
    __param(10, ICommandService),
    __param(11, IInstantiationService),
    __param(12, IAccessibilityService)
], SingleTerminalTabActionViewItem);
function getSingleTabLabel(accessor, instance, separator, icon) {
    // Don't even show the icon if there is no title as the icon would shift around when the title
    // is added
    if (!instance || !instance.title) {
        return '';
    }
    const iconId = ThemeIcon.isThemeIcon(instance.icon) ? instance.icon.id : accessor.get(ITerminalProfileResolverService).getDefaultIcon().id;
    const label = `$(${icon?.id || iconId}) ${getSingleTabTitle(instance, separator)}`;
    const primaryStatus = instance.statusList.primary;
    if (!primaryStatus?.icon) {
        return label;
    }
    return `${label} $(${primaryStatus.icon.id})`;
}
function getSingleTabTitle(instance, separator) {
    if (!instance) {
        return '';
    }
    return !instance.description ? instance.title : `${instance.title} ${separator} ${instance.description}`;
}
let TerminalThemeIconStyle = class TerminalThemeIconStyle extends Themable {
    constructor(container, _themeService, _terminalService, _terminalGroupService) {
        super(_themeService);
        this._themeService = _themeService;
        this._terminalService = _terminalService;
        this._terminalGroupService = _terminalGroupService;
        this._registerListeners();
        this._styleElement = domStylesheetsJs.createStyleSheet(container);
        this._register(toDisposable(() => this._styleElement.remove()));
        this.updateStyles();
    }
    _registerListeners() {
        this._register(this._terminalService.onAnyInstanceIconChange(() => this.updateStyles()));
        this._register(this._terminalService.onDidChangeInstances(() => this.updateStyles()));
        this._register(this._terminalGroupService.onDidChangeGroups(() => this.updateStyles()));
    }
    updateStyles() {
        super.updateStyles();
        const colorTheme = this._themeService.getColorTheme();
        // TODO: add a rule collector to avoid duplication
        let css = '';
        // Add icons
        for (const instance of this._terminalService.instances) {
            const icon = instance.icon;
            if (!icon) {
                continue;
            }
            let uri = undefined;
            if (icon instanceof URI) {
                uri = icon;
            }
            else if (icon instanceof Object && hasKey(icon, { light: true, dark: true })) {
                uri = isDark(colorTheme.type) ? icon.dark : icon.light;
            }
            const iconClasses = getUriClasses(instance, colorTheme.type);
            if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
                css += (`.monaco-workbench .${iconClasses[0]} .monaco-highlighted-label .codicon, .monaco-action-bar .terminal-uri-icon.single-terminal-tab.action-label:not(.alt-command) .codicon` +
                    `{background-image: ${cssJs.asCSSUrl(uri)};}`);
            }
        }
        // Add colors
        for (const instance of this._terminalService.instances) {
            const colorClass = getColorClass(instance);
            if (!colorClass || !instance.color) {
                continue;
            }
            const color = colorTheme.getColor(instance.color);
            if (color) {
                // exclude status icons (file-icon) and inline action icons (trashcan, horizontalSplit, rerunTask)
                css += (`.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon):not(.codicon-rerun-task)` +
                    `{ color: ${color} !important; }`);
            }
        }
        this._styleElement.textContent = css;
    }
};
TerminalThemeIconStyle = __decorate([
    __param(1, IThemeService),
    __param(2, ITerminalService),
    __param(3, ITerminalGroupService)
], TerminalThemeIconStyle);
let SingleTabHoverDelegate = class SingleTabHoverDelegate {
    constructor(_configurationService, _hoverService, _storageService, _terminalGroupService) {
        this._configurationService = _configurationService;
        this._hoverService = _hoverService;
        this._storageService = _storageService;
        this._terminalGroupService = _terminalGroupService;
        this._lastHoverHideTime = 0;
        this.placement = 'element';
    }
    get delay() {
        return Date.now() - this._lastHoverHideTime < 200
            ? 0 // show instantly when a hover was recently shown
            : this._configurationService.getValue('workbench.hover.delay');
    }
    showHover(options, focus) {
        const instance = this._terminalGroupService.activeInstance;
        if (!instance) {
            return;
        }
        const hoverInfo = getInstanceHoverInfo(instance, this._storageService);
        return this._hoverService.showInstantHover({
            ...options,
            content: hoverInfo.content,
            actions: hoverInfo.actions
        }, focus);
    }
    onDidHideHover() {
        this._lastHoverHideTime = Date.now();
    }
};
SingleTabHoverDelegate = __decorate([
    __param(0, IConfigurationService),
    __param(1, IHoverService),
    __param(2, IStorageService),
    __param(3, ITerminalGroupService)
], SingleTabHoverDelegate);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sS0FBSyxnQkFBZ0IsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEtBQUssS0FBSyxNQUFNLHNDQUFzQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxNQUFNLEVBQVcsTUFBTSxvQ0FBb0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNuSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNuRSxPQUFPLEVBQUUsb0JBQW9CLEVBQWlCLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3pILE9BQU8sRUFBMEIsNkJBQTZCLEVBQUUscUJBQXFCLEVBQXFCLGdCQUFnQixFQUFrRCxNQUFNLGVBQWUsQ0FBQztBQUNsTSxPQUFPLEVBQUUsUUFBUSxFQUFvQixNQUFNLDBDQUEwQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFz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