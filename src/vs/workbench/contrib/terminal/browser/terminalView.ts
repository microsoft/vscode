/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import * as cssJs from '../../../../base/browser/cssValue.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { switchTerminalActionViewItemSeparator, switchTerminalShowTabsTitle } from './terminalActions.js';
import { INotificationService, IPromptChoice, Severity } from '../../../../platform/notification/common/notification.js';
import { ICreateTerminalOptions, ITerminalConfigurationService, ITerminalGroupService, ITerminalInstance, ITerminalService, TerminalConnectionState, TerminalDataTransfers } from './terminal.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from '../common/terminal.js';
import { TerminalSettingId, ITerminalProfile, TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ActionViewItem, IBaseActionViewItemOptions, SelectActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { asCssVariable, selectBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { ISelectOptionItem } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { TerminalTabbedView } from './terminalTabbedView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { getColorForSeverity } from './terminalStatusList.js';
import { getFlatContextMenuActions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { DisposableMap, DisposableStore, dispose, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { getColorClass, getUriClasses } from './terminalIcon.js';
import { getTerminalActionBarArgs } from './terminalMenus.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { getInstanceHoverInfo } from './terminalTooltip.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Event } from '../../../../base/common/event.js';
import { IHoverDelegate, IHoverDelegateOptions } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { InstanceContext, TerminalContextActionRunner } from './terminalContextMenu.js';
import { MicrotaskDelay } from '../../../../base/common/symbols.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

export class TerminalViewPane extends ViewPane {
	private _parentDomElement: HTMLElement | undefined;
	private _terminalTabbedView?: TerminalTabbedView;
	get terminalTabbedView(): TerminalTabbedView | undefined { return this._terminalTabbedView; }
	private _isInitialized: boolean = false;
	/**
	 * Tracks an active promise of terminal creation requested by this component. This helps prevent
	 * double creation for example when toggling a terminal's visibility and focusing it.
	 */
	private _isTerminalBeingCreated: boolean = false;
	private readonly _newDropdown: MutableDisposable<DropdownWithPrimaryActionViewItem> = this._register(new MutableDisposable());
	private readonly _dropdownMenu: IMenu;
	private readonly _singleTabMenu: IMenu;
	private _viewShowing: IContextKey<boolean>;
	private readonly _disposableStore = this._register(new DisposableStore());
	private readonly _actionDisposables: DisposableMap<TerminalCommandId> = this._register(new DisposableMap());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IMenuService private readonly _menuService: IMenuService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IThemeService private readonly _themeService: IThemeService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super(options, keybindingService, _contextMenuService, _configurationService, _contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, hoverService);
		this._register(this._terminalService.onDidRegisterProcessSupport(() => {
			this._onDidChangeViewWelcomeState.fire();
		}));

		this._register(this._terminalService.onDidChangeInstances(() => {
			// If the first terminal is opened, hide the welcome view
			// and if the last one is closed, show it again
			if (this._hasWelcomeScreen() && this._terminalGroupService.instances.length <= 1) {
				this._onDidChangeViewWelcomeState.fire();
			}
			if (!this._parentDomElement) { return; }
			// If we do not have the tab view yet, create it now.
			if (!this._terminalTabbedView) {
				this._createTabsView();
			}
			// If we just opened our first terminal, layout
			if (this._terminalGroupService.instances.length === 1) {
				this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
			}
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
			if (this._parentDomElement && (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled) || e.affectsConfiguration(TerminalSettingId.ShellIntegrationEnabled))) {
				this._updateForShellIntegration(this._parentDomElement);
			}
		}));
		const shellIntegrationDisposable = this._register(new MutableDisposable());
		shellIntegrationDisposable.value = this._terminalService.onAnyInstanceAddedCapabilityType(c => {
			if (c === TerminalCapability.CommandDetection && this._gutterDecorationsEnabled()) {
				this._parentDomElement?.classList.add('shell-integration');
				shellIntegrationDisposable.clear();
			}
		});
	}

	private _updateForShellIntegration(container: HTMLElement) {
		container.classList.toggle('shell-integration', this._gutterDecorationsEnabled());
	}

	private _gutterDecorationsEnabled(): boolean {
		const decorationsEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
		return (decorationsEnabled === 'both' || decorationsEnabled === 'gutter') && this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled);
	}

	private _initializeTerminal(checkRestoredTerminals: boolean) {
		if (this.isBodyVisible() && this._terminalService.isProcessSupportRegistered && this._terminalService.connectionState === TerminalConnectionState.Connected) {
			const wasInitialized = this._isInitialized;
			this._isInitialized = true;

			let hideOnStartup: 'never' | 'whenEmpty' | 'always' = 'never';
			if (!wasInitialized) {
				hideOnStartup = this._configurationService.getValue(TerminalSettingId.HideOnStartup);
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
	protected override renderBody(container: HTMLElement): void {
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
			if (e.affectsConfiguration(TerminalSettingId.FontFamily) || e.affectsConfiguration('editor.fontFamily')) {
				if (!this._terminalConfigurationService.configFontIsMonospace()) {
					const choices: IPromptChoice[] = [{
						label: nls.localize('terminal.useMonospace', "Use 'monospace'"),
						run: () => this.configurationService.updateValue(TerminalSettingId.FontFamily, 'monospace'),
					}];
					this._notificationService.prompt(Severity.Warning, nls.localize('terminal.monospaceOnly', "The terminal only supports monospace fonts. Be sure to restart VS Code if this is a newly installed font."), choices);
				}
			}
		}));
		this._register(this.onDidChangeBodyVisibility(async visible => {
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
			} else {
				for (const instance of this._terminalGroupService.instances) {
					instance.resetFocusContextKey();
				}
			}
			this._terminalGroupService.updateVisibility();
		}));
		this._register(this._terminalService.onDidChangeConnectionState(() => this._initializeTerminal(true)));
		this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
	}

	private _createTabsView(): void {
		if (!this._parentDomElement) {
			return;
		}
		this._terminalTabbedView = this._register(this.instantiationService.createInstance(TerminalTabbedView, this._parentDomElement));
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._terminalTabbedView?.layout(width, height);
	}

	override createActionViewItem(action: Action, options: IBaseActionViewItemOptions): IActionViewItem | undefined {
		switch (action.id) {
			case TerminalCommandId.Split: {
				// Split needs to be special cased to force splitting within the panel, not the editor
				const that = this;
				const store = new DisposableStore();
				const panelOnlySplitAction = store.add(new class extends Action {
					constructor() {
						super(action.id, action.label, action.class, action.enabled);
						this.checked = action.checked;
						this.tooltip = action.tooltip;
					}
					override async run() {
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
			case TerminalCommandId.SwitchTerminal: {
				const item = this._instantiationService.createInstance(SwitchTerminalActionViewItem, action);
				this._actionDisposables.set(action.id, item);
				return item;
			}
			case TerminalCommandId.Focus: {
				if (action instanceof MenuItemAction) {
					const actions = getFlatContextMenuActions(this._singleTabMenu.getActions({ shouldForwardArgs: true }));
					const item = this._instantiationService.createInstance(SingleTerminalTabActionViewItem, action, actions);
					this._actionDisposables.set(action.id, item);
					return item;
				}
				break;
			}
			case TerminalCommandId.New: {
				if (action instanceof MenuItemAction) {
					const actions = getTerminalActionBarArgs(TerminalLocation.Panel, this._terminalProfileService.availableProfiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
					this._newDropdown.value = new DropdownWithPrimaryActionViewItem(action, actions.dropdownAction, actions.dropdownMenuActions, actions.className, { hoverDelegate: options.hoverDelegate }, this._contextMenuService, this._keybindingService, this._notificationService, this._contextKeyService, this._themeService, this._accessibilityService);
					this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
					return this._newDropdown.value;
				}
			}
		}
		return super.createActionViewItem(action, options);
	}

	private _getDefaultProfileName(): string {
		let defaultProfileName;
		try {
			defaultProfileName = this._terminalProfileService.getDefaultProfileName();
		} catch (e) {
			defaultProfileName = this._terminalProfileResolverService.defaultProfileName;
		}
		return defaultProfileName!;
	}

	private _getKeybindingLabel(action: IAction): string | undefined {
		return this._keybindingService.lookupKeybinding(action.id)?.getLabel() ?? undefined;
	}

	private _updateTabActionBar(profiles: ITerminalProfile[]): void {
		const actions = getTerminalActionBarArgs(TerminalLocation.Panel, profiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
		this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
	}

	override focus() {
		super.focus();
		if (this._terminalService.connectionState === TerminalConnectionState.Connected) {
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
			// TODO: Improve lifecycle management this event should be disposed after first fire
			this._register(this._terminalService.onDidChangeConnectionState(() => {
				// Only focus the terminal if the activeElement has not changed since focus() was called
				// TODO: Hack
				if (previousActiveElement && dom.isActiveElement(previousActiveElement)) {
					this._terminalGroupService.showPanel(true);
				}
			}));
		}
	}

	private _hasWelcomeScreen(): boolean {
		return !this._terminalService.isProcessSupportRegistered;
	}

	override shouldShowWelcome(): boolean {
		return this._hasWelcomeScreen() && this._terminalService.instances.length === 0;
	}
}

class SwitchTerminalActionViewItem extends SelectActionViewItem {
	constructor(
		action: IAction,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IContextViewService contextViewService: IContextViewService,
		@ITerminalProfileService terminalProfileService: ITerminalProfileService
	) {
		super(null, action, getTerminalSelectOpenItems(_terminalService, _terminalGroupService), _terminalGroupService.activeGroupIndex, contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize('terminals', 'Open Terminals.'), optionsAsChildren: true });
		this._register(_terminalService.onDidChangeInstances(() => this._updateItems(), this));
		this._register(_terminalService.onDidChangeActiveGroup(() => this._updateItems(), this));
		this._register(_terminalService.onDidChangeActiveInstance(() => this._updateItems(), this));
		this._register(_terminalService.onAnyInstanceTitleChange(() => this._updateItems(), this));
		this._register(_terminalGroupService.onDidChangeGroups(() => this._updateItems(), this));
		this._register(_terminalService.onDidChangeConnectionState(() => this._updateItems(), this));
		this._register(terminalProfileService.onDidChangeAvailableProfiles(() => this._updateItems(), this));
		this._register(_terminalService.onAnyInstancePrimaryStatusChange(() => this._updateItems(), this));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('switch-terminal');
		container.style.borderColor = asCssVariable(selectBorder);
	}

	private _updateItems(): void {
		const options = getTerminalSelectOpenItems(this._terminalService, this._terminalGroupService);
		this.setOptions(options, this._terminalGroupService.activeGroupIndex);
	}
}

function getTerminalSelectOpenItems(terminalService: ITerminalService, terminalGroupService: ITerminalGroupService): ISelectOptionItem[] {
	let items: ISelectOptionItem[];
	if (terminalService.connectionState === TerminalConnectionState.Connected) {
		items = terminalGroupService.getGroupLabels().map(label => {
			return { text: label };
		});
	} else {
		items = [{ text: nls.localize('terminalConnectingLabel', "Starting...") }];
	}
	items.push({ text: switchTerminalActionViewItemSeparator, isDisabled: true });
	items.push({ text: switchTerminalShowTabsTitle });
	return items;
}

class SingleTerminalTabActionViewItem extends MenuEntryActionViewItem {
	private _color: string | undefined;
	private _altCommand: string | undefined;
	private _class: string | undefined;
	private readonly _elementDisposables: IDisposable[] = [];

	constructor(
		action: MenuItemAction,
		private readonly _actions: IAction[],
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalConfigurationService private readonly _terminaConfigurationService: ITerminalConfigurationService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAccessibilityService _accessibilityService: IAccessibilityService
	) {
		super(action, {
			draggable: true,
			hoverDelegate: _instantiationService.createInstance(SingleTabHoverDelegate)
		}, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibilityService);

		// Register listeners to update the tab
		this._register(Event.debounce<ITerminalInstance | undefined, Set<ITerminalInstance>>(Event.any(
			this._terminalService.onAnyInstancePrimaryStatusChange,
			this._terminalGroupService.onDidChangeActiveInstance,
			Event.map(this._terminalService.onAnyInstanceIconChange, e => e.instance),
			this._terminalService.onAnyInstanceTitleChange,
			this._terminalService.onDidChangeInstanceCapability,
		), (last, e) => {
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

	override async onClick(event: MouseEvent): Promise<void> {
		this._terminalGroupService.lastAccessedMenu = 'inline-tab';
		if (event.altKey && this._menuItemAction.alt) {
			this._commandService.executeCommand(this._menuItemAction.alt.id, { location: TerminalLocation.Panel } satisfies ICreateTerminalOptions);
		} else {
			this._openContextMenu();
		}
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	protected override updateLabel(e?: ITerminalInstance): void {
		// Only update if it's the active instance
		if (e && e !== this._terminalGroupService.activeInstance) {
			return;
		}

		if (this._elementDisposables.length === 0 && this.element && this.label) {
			// Right click opens context menu
			this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, e => {
				if (e.button === 2) {
					this._openContextMenu();
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
					e.dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([instance.resource.toString()]));
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

	private _openContextMenu() {
		const actionRunner = new TerminalContextActionRunner();
		this._contextMenuService.showContextMenu({
			actionRunner,
			getAnchor: () => this.element!,
			getActions: () => this._actions,
			// The context is always the active instance in the terminal view
			getActionsContext: () => {
				const instance = this._terminalGroupService.activeInstance;
				return instance ? [new InstanceContext(instance)] : [];
			},
			onHide: () => actionRunner.dispose()
		});
	}
}

function getSingleTabLabel(accessor: ServicesAccessor, instance: ITerminalInstance | undefined, separator: string, icon?: ThemeIcon) {
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

function getSingleTabTitle(instance: ITerminalInstance | undefined, separator: string): string {
	if (!instance) {
		return '';
	}
	return !instance.description ? instance.title : `${instance.title} ${separator} ${instance.description}`;
}

class TerminalThemeIconStyle extends Themable {
	private _styleElement: HTMLElement;
	constructor(
		container: HTMLElement,
		@IThemeService private readonly _themeService: IThemeService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService
	) {
		super(_themeService);
		this._registerListeners();
		this._styleElement = domStylesheetsJs.createStyleSheet(container);
		this._register(toDisposable(() => this._styleElement.remove()));
		this.updateStyles();
	}

	private _registerListeners(): void {
		this._register(this._terminalService.onAnyInstanceIconChange(() => this.updateStyles()));
		this._register(this._terminalService.onDidChangeInstances(() => this.updateStyles()));
		this._register(this._terminalGroupService.onDidChangeGroups(() => this.updateStyles()));
	}

	override updateStyles(): void {
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
			} else if (icon instanceof Object && 'light' in icon && 'dark' in icon) {
				uri = colorTheme.type === ColorScheme.LIGHT ? icon.light : icon.dark;
			}
			const iconClasses = getUriClasses(instance, colorTheme.type);
			if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
				css += (
					`.monaco-workbench .${iconClasses[0]} .monaco-highlighted-label .codicon, .monaco-action-bar .terminal-uri-icon.single-terminal-tab.action-label:not(.alt-command) .codicon` +
					`{background-image: ${cssJs.asCSSUrl(uri)};}`
				);
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
				css += (
					`.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon):not(.codicon-rerun-task)` +
					`{ color: ${color} !important; }`
				);
			}
		}

		this._styleElement.textContent = css;
	}
}

class SingleTabHoverDelegate implements IHoverDelegate {
	private _lastHoverHideTime: number = 0;

	readonly placement = 'element';

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
	) {
	}

	get delay(): number {
		return Date.now() - this._lastHoverHideTime < 200
			? 0  // show instantly when a hover was recently shown
			: this._configurationService.getValue<number>('workbench.hover.delay');
	}

	showHover(options: IHoverDelegateOptions, focus?: boolean) {
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
}
