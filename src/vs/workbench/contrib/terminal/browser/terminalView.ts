/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, IColorTheme, registerThemingParticipant, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { configureTerminalSettingsTitle, ContextMenuTabsGroup, selectDefaultProfileTitle, switchTerminalActionViewItemSeparator } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TERMINAL_BACKGROUND_COLOR, TERMINAL_BORDER_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { ITerminalService, TerminalConnectionState } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPane';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { BaseActionViewItem, SelectActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';
import { attachSelectBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { selectBorder } from 'vs/platform/theme/common/colorRegistry';
import { ISelectOptionItem } from 'vs/base/browser/ui/selectBox/selectBox';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { TerminalTabbedView } from 'vs/workbench/contrib/terminal/browser/terminalTabbedView';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { Codicon } from 'vs/base/common/codicons';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class TerminalViewPane extends ViewPane {
	private _actions: IAction[] | undefined;
	private _fontStyleElement: HTMLElement | undefined;
	private _parentDomElement: HTMLElement | undefined;
	private _tabsViewWrapper: HTMLElement | undefined;
	private _terminalTabbedView?: TerminalTabbedView;
	public get terminalTabbedView(): TerminalTabbedView | undefined { return this._terminalTabbedView; }
	private _terminalsInitialized = false;
	private _bodyDimensions: { width: number, height: number } = { width: 0, height: 0 };
	private _isWelcomeShowing: boolean = false;
	private _combinedButton: CombinedButtonActionViewItem | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IOpenerService openerService: IOpenerService,
		@IMenuService private readonly _menuService: IMenuService,
		@ICommandService private readonly _commandService: ICommandService
	) {
		super(options, keybindingService, _contextMenuService, configurationService, _contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, telemetryService);
		this._terminalService.onDidRegisterProcessSupport(() => {
			if (this._actions) {
				for (const action of this._actions) {
					action.enabled = true;
				}
			}
			this._onDidChangeViewWelcomeState.fire();
		});
		this._terminalService.onInstanceCreated(() => {
			if (!this._isWelcomeShowing) {
				return;
			}
			this._isWelcomeShowing = true;
			this._onDidChangeViewWelcomeState.fire();
			if (!this._terminalTabbedView && this._parentDomElement) {
				this._createTabsView();
				this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
			}
		});
		this._terminalService.onRequestAvailableProfiles(async () => {
			if (!this._combinedButton) {
				this._combinedButton = this._instantiationService.createInstance(CombinedButtonActionViewItem, await this._getToolbarActions());
				this._register(this._combinedButton);
			}
			await this._updateButton();
		});
	}

	public override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._parentDomElement = container;
		this._parentDomElement.classList.add('integrated-terminal');
		this._fontStyleElement = document.createElement('style');

		if (!this.shouldShowWelcome()) {
			this._createTabsView();
		}

		this._parentDomElement.appendChild(this._fontStyleElement);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated.fontFamily') || e.affectsConfiguration('editor.fontFamily')) {
				const configHelper = this._terminalService.configHelper;
				if (!configHelper.configFontIsMonospace()) {
					const choices: IPromptChoice[] = [{
						label: nls.localize('terminal.useMonospace', "Use 'monospace'"),
						run: () => this.configurationService.updateValue('terminal.integrated.fontFamily', 'monospace'),
					}];
					this._notificationService.prompt(Severity.Warning, nls.localize('terminal.monospaceOnly', "The terminal only supports monospace fonts. Be sure to restart VS Code if this is a newly installed font."), choices);
				}
			}
		}));

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				const hadTerminals = !!this._terminalService.terminalTabs.length;
				if (this._terminalService.isProcessSupportRegistered) {
					if (this._terminalsInitialized) {
						if (!hadTerminals) {
							this._terminalService.createTerminal();
						}
					} else {
						this._terminalsInitialized = true;
						this._terminalService.initializeTerminals();
					}
				}

				if (hadTerminals) {
					this._terminalService.getActiveTab()?.setVisible(visible);
				} else {
					// TODO@Tyriar - this call seems unnecessary
					this.layoutBody(this._bodyDimensions.height, this._bodyDimensions.width);
				}
				this._terminalService.showPanel(true);
			} else {
				this._terminalService.getActiveTab()?.setVisible(false);
				this._terminalService.terminalInstances.forEach(instance => {
					instance.notifyFindWidgetFocusChanged(false);
				});
			}
		}));
		this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
	}

	private _createTabsView(): void {
		if (!this._parentDomElement) {
			return;
		}
		this._tabsViewWrapper = document.createElement('div');
		this._tabsViewWrapper.classList.add('tabs-view-wrapper');
		this._terminalTabbedView = this.instantiationService.createInstance(TerminalTabbedView, this._parentDomElement);
		this._parentDomElement.append(this._tabsViewWrapper);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		if (this._terminalTabbedView) {
			this._bodyDimensions.width = width;
			this._bodyDimensions.height = height;

			this._terminalTabbedView.layout(width, height);
		}
	}

	public override getActionViewItem(action: Action): IActionViewItem | undefined {
		if (action.id === TERMINAL_COMMAND_ID.SWITCH_TERMINAL) {
			return this._instantiationService.createInstance(SwitchTerminalActionViewItem, action);
		} else if (action.id === TERMINAL_COMMAND_ID.CREATE_PROFILE_BUTTON) {
			this._combinedButton = this._register(this._instantiationService.createInstance(CombinedButtonActionViewItem, this._getToolbarActionsSync()));
			return this._combinedButton;
		}
		return super.getActionViewItem(action);
	}

	private async _updateButton(): Promise<void> {
		const actions = await this._getToolbarActions();
		this._combinedButton?.update(actions);
	}

	private async _getToolbarActions(): Promise<CombinedButtonArgs> {
		const dropdownActions: IAction[] = [];
		const submenuActions: IAction[] = [];

		const profiles = await this._terminalService.getAvailableProfiles();
		for (const p of profiles) {
			dropdownActions.push(new MenuItemAction({ id: TERMINAL_COMMAND_ID.NEW_WITH_PROFILE, title: p.profileName, category: ContextMenuTabsGroup.Profile }, undefined, { arg: p, shouldForwardArgs: true }, this._contextKeyService, this._commandService));
			submenuActions.push(new MenuItemAction({ id: TERMINAL_COMMAND_ID.SPLIT, title: p.profileName, category: ContextMenuTabsGroup.Profile }, undefined, { arg: p, shouldForwardArgs: true }, this._contextKeyService, this._commandService));
		}

		if (dropdownActions.length) {
			dropdownActions.push(new SubmenuAction('split.profile', 'Split...', submenuActions));
			dropdownActions.push(new Separator());
		}

		const dropdownMenu = this._register(this._menuService.createMenu(MenuId.TerminalToolbarContext, this._contextKeyService));
		for (const [, configureActions] of dropdownMenu.getActions()) {
			for (const action of configureActions) {
				if ('alt' in action) {
					dropdownActions.push(action);
				}
			}
		}

		const primaryAction = this._instantiationService.createInstance(MenuItemAction, { id: TERMINAL_COMMAND_ID.NEW, title: nls.localize('terminal.new', "New Terminal"), icon: Codicon.plus }, undefined, undefined);
		const secondaryAction = this._instantiationService.createInstance(MenuItemAction, { id: 'more', title: 'more...', icon: Codicon.gear }, undefined, undefined);
		return { primaryAction, secondaryAction, dropdownActions, className: 'terminal.profiles.actions' };
	}

	private _getToolbarActionsSync(): CombinedButtonArgs {
		const dropdownActions: IAction[] = [];

		const dropdownMenu = this._register(this._menuService.createMenu(MenuId.TerminalToolbarContext, this._contextKeyService));
		for (const [, configureActions] of dropdownMenu.getActions()) {
			for (const action of configureActions) {
				if ('alt' in action) {
					dropdownActions.push(action);
				}
			}
		}

		const primaryAction = this._instantiationService.createInstance(MenuItemAction, { id: TERMINAL_COMMAND_ID.NEW, title: nls.localize('terminal.new', "New Terminal"), icon: Codicon.plus }, undefined, undefined);
		const secondaryAction = this._instantiationService.createInstance(MenuItemAction, { id: 'split', title: 'Split', icon: Codicon.more }, undefined, undefined);
		return { primaryAction, secondaryAction, dropdownActions, className: 'terminal.profiles.actions' };
	}


	public override focus() {
		if (this._terminalService.connectionState === TerminalConnectionState.Connecting) {
			// If the terminal is waiting to reconnect to remote terminals, then there is no TerminalInstance yet that can
			// be focused. So wait for connection to finish, then focus.
			const activeElement = document.activeElement;
			this._register(this._terminalService.onDidChangeConnectionState(() => {
				// Only focus the terminal if the activeElement has not changed since focus() was called
				// TODO hack
				if (document.activeElement === activeElement) {
					this._focus();
				}
			}));

			return;
		}
		this._focus();
	}

	private _focus() {
		this._terminalService.getActiveInstance()?.focusWhenReady();
	}

	override shouldShowWelcome(): boolean {
		this._isWelcomeShowing = !this._terminalService.isProcessSupportRegistered && this._terminalService.terminalInstances.length === 0;
		return this._isWelcomeShowing;
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const panelBackgroundColor = theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(PANEL_BACKGROUND);
	collector.addRule(`.monaco-workbench .part.panel .pane-body.integrated-terminal .terminal-outer-container { background-color: ${panelBackgroundColor ? panelBackgroundColor.toString() : ''}; }`);

	const sidebarBackgroundColor = theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(SIDE_BAR_BACKGROUND);
	collector.addRule(`.monaco-workbench .part.sidebar .pane-body.integrated-terminal .terminal-outer-container { background-color: ${sidebarBackgroundColor ? sidebarBackgroundColor.toString() : ''}; }`);

	const borderColor = theme.getColor(TERMINAL_BORDER_COLOR);
	if (borderColor) {
		collector.addRule(`.monaco-workbench .pane-body.integrated-terminal .split-view-view:not(:first-child) { border-color: ${borderColor.toString()}; }`);
	}
});


class SwitchTerminalActionViewItem extends SelectActionViewItem {
	constructor(
		action: IAction,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IThemeService private readonly _themeService: IThemeService,
		@ITerminalContributionService private readonly _contributions: ITerminalContributionService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super(null, action, getTerminalSelectOpenItems(_terminalService, _contributions), _terminalService.activeTabIndex, contextViewService, { ariaLabel: nls.localize('terminals', 'Open Terminals.'), optionsAsChildren: true });
		this._register(_terminalService.onInstancesChanged(() => this._updateItems(), this));
		this._register(_terminalService.onActiveTabChanged(() => this._updateItems(), this));
		this._register(_terminalService.onInstanceTitleChanged(() => this._updateItems(), this));
		this._register(_terminalService.onTabDisposed(() => this._updateItems(), this));
		this._register(_terminalService.onDidChangeConnectionState(() => this._updateItems(), this));
		this._register(_terminalService.onProfilesConfigChanged(() => this._updateItems(), this));
		this._register(attachSelectBoxStyler(this.selectBox, this._themeService));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('switch-terminal');
		this._register(attachStylerCallback(this._themeService, { selectBorder }, colors => {
			container.style.borderColor = colors.selectBorder ? `${colors.selectBorder}` : '';
		}));
	}

	private _updateItems(): void {
		const options = getTerminalSelectOpenItems(this._terminalService, this._contributions);
		this.setOptions(options, this._terminalService.activeTabIndex);
	}
}

function getTerminalSelectOpenItems(terminalService: ITerminalService, contributions: ITerminalContributionService): ISelectOptionItem[] {
	let items: ISelectOptionItem[];
	if (terminalService.connectionState === TerminalConnectionState.Connected) {
		items = terminalService.getTabLabels().map(label => {
			return { text: label };
		});
	} else {
		items = [{ text: nls.localize('terminalConnectingLabel', "Starting...") }];
	}

	items.push({ text: switchTerminalActionViewItemSeparator, isDisabled: true });

	items.push(...getProfileSelectOptionItems(terminalService));

	for (const contributed of contributions.terminalTypes) {
		items.push({ text: contributed.title });
	}
	items.push({ text: switchTerminalActionViewItemSeparator, isDisabled: true });
	if (terminalService.isProcessSupportRegistered) {
		items.push({ text: selectDefaultProfileTitle });
	}
	items.push({ text: configureTerminalSettingsTitle });
	return items;
}

function getProfileSelectOptionItems(terminalService: ITerminalService): ISelectOptionItem[] {
	const detectedProfiles = terminalService.getAvailableProfiles();
	return detectedProfiles?.map((shell: { profileName: string; }) => ({ text: 'New ' + shell.profileName } as ISelectOptionItem)) || [];
}
interface CombinedButtonArgs {
	primaryAction: MenuItemAction,
	secondaryAction: MenuItemAction,
	dropdownActions: IAction[],
	className: string
}

export class CombinedButtonActionViewItem extends BaseActionViewItem {
	private _primaryAction: MenuEntryActionViewItem;
	private _dropdown: DropdownMenuActionViewItem;
	private container: HTMLElement | null = null;
	private _args: CombinedButtonArgs;
	constructor(
		args: CombinedButtonArgs,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super(null, args.primaryAction);
		this._args = args;
		this._primaryAction = instantiationService.createInstance(MenuEntryActionViewItem, args.primaryAction);
		this._dropdown = new DropdownMenuActionViewItem(args.secondaryAction, args.dropdownActions, _contextMenuService, { menuAsChild: true, classNames: ['codicon', 'codicon-gear'] });
	}

	override render(container: HTMLElement): void {
		this.container = container;
		super.render(container);
		this.element = DOM.append(this.container, DOM.$(''));
		this.element.className = this._args.className;
		this._primaryAction.render(this.element);
		this._dropdown.render(this.element);
		this.element.style.display = 'flex';
		this.element.style.flexDirection = 'row';
	}

	update(args: CombinedButtonArgs): void {
		this._dropdown.dispose();
		this._dropdown = new DropdownMenuActionViewItem(args.secondaryAction, args.dropdownActions, this._contextMenuService, { menuAsChild: true, classNames: ['codicon', 'codicon-gear'] });
		if (this.container) {
			this.render(this.container);
		}
	}
}
