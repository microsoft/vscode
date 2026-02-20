/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/accountWidget.css';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { appendUpdateMenuItems as registerUpdateMenuItems, CONTEXT_UPDATE_STATE } from '../../../../workbench/contrib/update/browser/update.js';
import { Menus } from '../../../browser/menus.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { fillInActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { $, append } from '../../../../base/browser/dom.js';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';

// --- Account Menu Items --- //
const AccountMenu = new MenuId('SessionsAccountMenu');

// Sign In (shown when signed out)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agenticSignIn',
			title: localize2('signIn', 'Sign In'),
			menu: {
				id: AccountMenu,
				when: ContextKeyExpr.notEquals('defaultAccountStatus', 'available'),
				group: '1_account',
				order: 1,
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const defaultAccountService = accessor.get(IDefaultAccountService);
		await defaultAccountService.signIn();
	}
});

// Sign Out (shown when signed in)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agenticSignOut',
			title: localize2('signOut', 'Sign Out'),
			menu: {
				id: AccountMenu,
				when: ContextKeyExpr.equals('defaultAccountStatus', 'available'),
				group: '1_account',
				order: 1,
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const defaultAccountService = accessor.get(IDefaultAccountService);
		await defaultAccountService.signOut();
	}
});

// Settings
MenuRegistry.appendMenuItem(AccountMenu, {
	command: {
		id: 'workbench.action.openSettings',
		title: localize('settings', "Settings"),
	},
	group: '2_settings',
	order: 1,
});

// Update actions
registerUpdateMenuItems(AccountMenu, '3_updates');

class AccountWidget extends ActionViewItem {

	private accountButton: Button | undefined;
	private readonly viewItemDisposables = this._register(new DisposableStore());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(undefined, action, { ...options, icon: false, label: false });
	}

	protected override getTooltip(): string | undefined {
		return undefined;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('account-widget', 'sidebar-action');

		// Account button (left)
		const accountContainer = append(container, $('.account-widget-account'));
		this.accountButton = this.viewItemDisposables.add(new Button(accountContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		this.accountButton.element.classList.add('account-widget-account-button', 'sidebar-action-button');

		this.updateAccountButton();
		this.viewItemDisposables.add(this.defaultAccountService.onDidChangeDefaultAccount(() => this.updateAccountButton()));

		this.viewItemDisposables.add(this.accountButton.onDidClick(e => {
			e?.preventDefault();
			e?.stopPropagation();
			this.showAccountMenu(this.accountButton!.element);
		}));
	}

	private showAccountMenu(anchor: HTMLElement): void {
		const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
		const actions: IAction[] = [];
		fillInActionBarActions(menu.getActions(), actions);
		menu.dispose();

		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
		});
	}

	private async updateAccountButton(): Promise<void> {
		if (!this.accountButton) {
			return;
		}
		this.accountButton.label = `$(${Codicon.loading.id}~spin) ${localize('loadingAccount', "Loading account...")}`;
		this.accountButton.enabled = false;
		const account = await this.defaultAccountService.getDefaultAccount();
		this.accountButton.enabled = true;
		this.accountButton.label = account
			? `$(${Codicon.account.id}) ${account.accountName} (${account.authenticationProvider.name})`
			: `$(${Codicon.account.id}) ${localize('signInLabel', "Sign In")}`;
	}


	override onClick(): void {
		// Handled by custom click handlers
	}
}

class UpdateWidget extends ActionViewItem {

	private updateButton: Button | undefined;
	private readonly viewItemDisposables = this._register(new DisposableStore());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IUpdateService private readonly updateService: IUpdateService,
	) {
		super(undefined, action, { ...options, icon: false, label: false });
	}

	protected override getTooltip(): string | undefined {
		return undefined;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('update-widget', 'sidebar-action');

		const updateContainer = append(container, $('.update-widget-action'));
		this.updateButton = this.viewItemDisposables.add(new Button(updateContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		this.updateButton.element.classList.add('update-widget-button', 'sidebar-action-button');
		this.viewItemDisposables.add(this.updateButton.onDidClick(() => this.update()));

		this.updateUpdateButton();
		this.viewItemDisposables.add(this.updateService.onStateChange(() => this.updateUpdateButton()));
	}

	private isUpdateReady(): boolean {
		return this.updateService.state.type === StateType.Ready;
	}

	private isUpdatePending(): boolean {
		const type = this.updateService.state.type;
		return type === StateType.AvailableForDownload
			|| type === StateType.CheckingForUpdates
			|| type === StateType.Downloading
			|| type === StateType.Downloaded
			|| type === StateType.Updating
			|| type === StateType.Overwriting;
	}

	private updateUpdateButton(): void {
		if (!this.updateButton) {
			return;
		}

		const state = this.updateService.state;
		if (this.isUpdatePending() && !this.isUpdateReady()) {
			this.updateButton.enabled = false;
			this.updateButton.label = `$(${Codicon.loading.id}~spin) ${this.getUpdateProgressMessage(state.type)}`;
		} else {
			this.updateButton.enabled = true;
			this.updateButton.label = `$(${Codicon.debugRestart.id}) ${localize('update', "Update")}`;
		}
	}

	private getUpdateProgressMessage(type: StateType): string {
		switch (type) {
			case StateType.CheckingForUpdates:
				return localize('checkingForUpdates', "Checking for Updates...");
			case StateType.Downloading:
				return localize('downloadingUpdate', "Downloading Update...");
			case StateType.Downloaded:
				return localize('installingUpdate', "Installing Update...");
			case StateType.Updating:
				return localize('updatingApp', "Updating...");
			case StateType.Overwriting:
				return localize('overwritingUpdate', "Downloading Update...");
			default:
				return localize('updating', "Updating...");
		}
	}

	private async update(): Promise<void> {
		await this.updateService.quitAndInstall();
	}

	override onClick(): void {
		// Handled by custom click handlers
	}
}

// --- Register custom view item --- //

class AccountWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWidget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const sessionsAccountWidgetAction = 'sessions.action.accountWidget';
		this._register(actionViewItemService.register(Menus.SidebarFooter, sessionsAccountWidgetAction, (action, options) => {
			return instantiationService.createInstance(AccountWidget, action, options);
		}, undefined));

		const sessionsUpdateWidgetAction = 'sessions.action.updateWidget';
		this._register(actionViewItemService.register(Menus.SidebarFooter, sessionsUpdateWidgetAction, (action, options) => {
			return instantiationService.createInstance(UpdateWidget, action, options);
		}, undefined));

		// Register the action with menu item after the view item provider
		// so the toolbar picks up the custom widget
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: sessionsAccountWidgetAction,
					title: localize2('sessionsAccountWidget', 'Sessions Account'),
					menu: {
						id: Menus.SidebarFooter,
						group: 'navigation',
						order: 1,
					}
				});
			}
			async run(): Promise<void> {
				// Handled by the custom view item
			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: sessionsUpdateWidgetAction,
					title: localize2('sessionsUpdateWidget', 'Sessions Update'),
					menu: {
						id: Menus.SidebarFooter,
						group: 'navigation',
						order: 0,
						when: ContextKeyExpr.or(
							CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready),
							CONTEXT_UPDATE_STATE.isEqualTo(StateType.AvailableForDownload),
							CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloading),
							CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloaded),
							CONTEXT_UPDATE_STATE.isEqualTo(StateType.Updating),
							CONTEXT_UPDATE_STATE.isEqualTo(StateType.Overwriting),
						)
					}
				});
			}
			async run(): Promise<void> {
				// Handled by the custom view item
			}
		}));
	}
}

registerWorkbenchContribution2(AccountWidgetContribution.ID, AccountWidgetContribution, WorkbenchPhase.AfterRestored);
