/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { Action, IAction } from 'vs/base/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { switchTerminalActionViewItemSeparator, switchTerminalShowTabsTitle } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { ICreateTerminalOptions, ITerminalGroupService, ITerminalInstance, ITerminalService, TerminalConnectionState, TerminalDataTransfers } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPane';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IMenu, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalSettingId, ITerminalProfile, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { ActionViewItem, SelectActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { asCssVariable, selectBorder } from 'vs/platform/theme/common/colorRegistry';
import { ISelectOptionItem } from 'vs/base/browser/ui/selectBox/selectBox';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { TerminalTabbedView } from 'vs/workbench/contrib/terminal/browser/terminalTabbedView';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { getColorForSeverity } from 'vs/workbench/contrib/terminal/browser/terminalStatusList';
import { createAndFillInContextMenuActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { DropdownWithPrimaryActionViewItem } from 'vs/platform/actions/browser/dropdownWithPrimaryActionViewItem';
import { dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { getColorClass, getUriClasses } from 'vs/workbench/contrib/terminal/browser/terminalIcon';
import { withNullAsUndefined } from 'vs/base/common/types';
import { getTerminalActionBarArgs } from 'vs/workbench/contrib/terminal/browser/terminalMenus';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { getInstanceHoverInfo } from 'vs/workbench/contrib/terminal/browser/terminalTooltip';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { defaultSelectBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { Event } from 'vs/base/common/event';
import { IHoverDelegate, IHoverDelegateOptions } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';

export class TerminalViewPane extends ViewPane {
	private _fontStyleElement: HTMLElement | undefined;
	private _parentDomElement: HTMLElement | undefined;
	private _terminalTabbedView?: TerminalTabbedView;
	get terminalTabbedView(): TerminalTabbedView | undefined { return this._terminalTabbedView; }
	private _isWelcomeShowing: boolean = false;
	private _newDropdown: DropdownWithPrimaryActionViewItem | undefined;
	private readonly _dropdownMenu: IMenu;
	private readonly _singleTabMenu: IMenu;
	private _viewShowing: IContextKey<boolean>;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IMenuService private readonly _menuService: IMenuService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super(options, keybindingService, _contextMenuService, _configurationService, _contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, telemetryService);
		this._register(this._terminalService.onDidRegisterProcessSupport(() => {
			this._onDidChangeViewWelcomeState.fire();
		}));

		this._register(this._terminalService.onDidChangeInstances(() => {
			if (!this._isWelcomeShowing) {
				return;
			}
			this._isWelcomeShowing = true;
			this._onDidChangeViewWelcomeState.fire();
			if (!this._terminalTabbedView && this._parentDomElement) {
				this._createTabsView();
				this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
			}
		}));
		this._dropdownMenu = this._register(this._menuService.createMenu(MenuId.TerminalNewDropdownContext, this._contextKeyService));
		this._singleTabMenu = this._register(this._menuService.createMenu(MenuId.TerminalInlineTabContext, this._contextKeyService));
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
		this._register(this._terminalService.onDidCreateInstance((i) => {
			i.capabilities.onDidAddCapability(c => {
				if (c === TerminalCapability.CommandDetection && this._gutterDecorationsEnabled()) {
					this._parentDomElement?.classList.add('shell-integration');
				}
			});
		}));
	}

	private _updateForShellIntegration(container: HTMLElement) {
		container.classList.toggle('shell-integration', this._gutterDecorationsEnabled());
	}

	private _gutterDecorationsEnabled(): boolean {
		const decorationsEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
		return (decorationsEnabled === 'both' || decorationsEnabled === 'gutter') && this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled);
	}

	private _initializeTerminal() {
		if (this.isBodyVisible() && this._terminalService.isProcessSupportRegistered && this._terminalService.connectionState === TerminalConnectionState.Connected && this._terminalService.restoredGroupCount === 0 && this._terminalGroupService.groups.length === 0) {
			this._terminalService.createTerminal({ location: TerminalLocation.Panel });
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
		this._fontStyleElement = document.createElement('style');
		this._instantiationService.createInstance(TerminalThemeIconStyle, this._parentDomElement);

		if (!this.shouldShowWelcome()) {
			this._createTabsView();
		}

		this._parentDomElement.appendChild(this._fontStyleElement);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.FontFamily) || e.affectsConfiguration('editor.fontFamily')) {
				const configHelper = this._terminalService.configHelper;
				if (!configHelper.configFontIsMonospace()) {
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
				if (!this._terminalService.isProcessSupportRegistered) {
					this._onDidChangeViewWelcomeState.fire();
				}
				this._initializeTerminal();
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
		this._register(this._terminalService.onDidChangeConnectionState(() => this._initializeTerminal()));
		this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
	}

	private _createTabsView(): void {
		if (!this._parentDomElement) {
			return;
		}
		this._terminalTabbedView = this.instantiationService.createInstance(TerminalTabbedView, this._parentDomElement);
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._terminalTabbedView?.layout(width, height);
	}

	override getActionViewItem(action: Action): IActionViewItem | undefined {
		switch (action.id) {
			case TerminalCommandId.Split: {
				// Split needs to be special cased to force splitting within the panel, not the editor
				const that = this;
				const panelOnlySplitAction = new class extends Action {
					constructor() {
						super(action.id, action.label, action.class, action.enabled);
						this.checked = action.checked;
						this.tooltip = action.tooltip;
					}
					override dispose(): void {
						action.dispose();
					}
					override async run() {
						const instance = that._terminalGroupService.activeInstance;
						if (instance) {
							const newInstance = await that._terminalService.createTerminal({ location: { parentTerminal: instance } });
							return newInstance?.focusWhenReady();
						}
						return;
					}
				};
				return new ActionViewItem(action, panelOnlySplitAction, { icon: true, label: false, keybinding: this._getKeybindingLabel(action) });
			}
			case TerminalCommandId.SwitchTerminal: {
				return this._instantiationService.createInstance(SwitchTerminalActionViewItem, action);
			}
			case TerminalCommandId.Focus: {
				if (action instanceof MenuItemAction) {
					const actions: IAction[] = [];
					createAndFillInContextMenuActions(this._singleTabMenu, undefined, actions);
					return this._instantiationService.createInstance(SingleTerminalTabActionViewItem, action, actions);
				}
			}
			case TerminalCommandId.New: {
				if (action instanceof MenuItemAction) {
					const actions = getTerminalActionBarArgs(TerminalLocation.Panel, this._terminalProfileService.availableProfiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu);
					this._newDropdown?.dispose();
					this._newDropdown = new DropdownWithPrimaryActionViewItem(action, actions.dropdownAction, actions.dropdownMenuActions, actions.className, this._contextMenuService, {}, this._keybindingService, this._notificationService, this._contextKeyService, this._themeService);
					this._updateTabActionBar(this._terminalProfileService.availableProfiles);
					return this._newDropdown;
				}
			}
		}
		return super.getActionViewItem(action);
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
		return withNullAsUndefined(this._keybindingService.lookupKeybinding(action.id)?.getLabel());
	}

	private _updateTabActionBar(profiles: ITerminalProfile[]): void {
		const actions = getTerminalActionBarArgs(TerminalLocation.Panel, profiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu);
		this._newDropdown?.update(actions.dropdownAction, actions.dropdownMenuActions);
	}

	override focus() {
		if (this._terminalService.connectionState === TerminalConnectionState.Connecting) {
			// If the terminal is waiting to reconnect to remote terminals, then there is no TerminalInstance yet that can
			// be focused. So wait for connection to finish, then focus.
			const activeElement = document.activeElement;
			this._register(this._terminalService.onDidChangeConnectionState(() => {
				// Only focus the terminal if the activeElement has not changed since focus() was called
				// TODO hack
				if (document.activeElement === activeElement) {
					this._terminalGroupService.showPanel(true);
				}
			}));

			return;
		}
		this._terminalGroupService.showPanel(true);
	}

	override shouldShowWelcome(): boolean {
		this._isWelcomeShowing = !this._terminalService.isProcessSupportRegistered && this._terminalService.instances.length === 0;
		return this._isWelcomeShowing;
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
		this._register(_terminalService.onDidChangeInstanceTitle(() => this._updateItems(), this));
		this._register(_terminalGroupService.onDidChangeGroups(() => this._updateItems(), this));
		this._register(_terminalService.onDidChangeConnectionState(() => this._updateItems(), this));
		this._register(terminalProfileService.onDidChangeAvailableProfiles(() => this._updateItems(), this));
		this._register(_terminalService.onDidChangeInstancePrimaryStatus(() => this._updateItems(), this));
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
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(action, {
			draggable: true,
			hoverDelegate: _instantiationService.createInstance(SingleTabHoverDelegate)
		}, keybindingService, notificationService, contextKeyService, themeService, contextMenuService);

		// Register listeners to update the tab
		this._register(Event.debounce<ITerminalInstance | undefined, Set<ITerminalInstance>>(Event.any(
			this._terminalService.onDidChangeInstancePrimaryStatus,
			this._terminalGroupService.onDidChangeActiveInstance,
			Event.map(this._terminalService.onDidChangeInstanceIcon, e => e.instance),
			Event.map(this._terminalService.onDidChangeInstanceColor, e => e.instance),
			this._terminalService.onDidChangeInstanceTitle,
			this._terminalService.onDidChangeInstanceCapability,
		), (last, e) => {
			if (!last) {
				last = new Set();
			}
			if (e) {
				last.add(e);
			}
			return last;
		})(merged => {
			for (const e of merged) {
				this.updateLabel(e);
			}
		}));

		// Clean up on dispose
		this._register(toDisposable(() => dispose(this._elementDisposables)));
	}

	override async onClick(event: MouseEvent): Promise<void> {
		if (event.altKey && this._menuItemAction.alt) {
			this._commandService.executeCommand(this._menuItemAction.alt.id, { target: TerminalLocation.Panel } as ICreateTerminalOptions);
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
			dom.reset(label, ...renderLabelWithIcons(this._instantiationService.invokeFunction(getSingleTabLabel, instance, this._terminalService.configHelper.config.tabs.separator, ThemeIcon.isThemeIcon(this._commandAction.item.icon) ? this._commandAction.item.icon : undefined)));

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
		this._contextMenuService.showContextMenu({
			getAnchor: () => this.element!,
			getActions: () => this._actions,
			getActionsContext: () => this.label
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
		this._styleElement = document.createElement('style');
		container.appendChild(this._styleElement);
		this._register(toDisposable(() => container.removeChild(this._styleElement)));
		this.updateStyles();
	}

	private _registerListeners(): void {
		this._register(this._terminalService.onDidChangeInstanceIcon(() => this.updateStyles()));
		this._register(this._terminalService.onDidChangeInstanceColor(() => this.updateStyles()));
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
					`{background-image: ${dom.asCSSUrl(uri)};}`
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
				// exclude status icons (file-icon) and inline action icons (trashcan and horizontalSplit)
				css += (
					`.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon)` +
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
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService
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
		const hoverInfo = getInstanceHoverInfo(instance);
		return this._hoverService.showHover({
			...options,
			content: hoverInfo.content,
			actions: hoverInfo.actions
		}, focus);
	}

	onDidHideHover() {
		this._lastHoverHideTime = Date.now();
	}
}
