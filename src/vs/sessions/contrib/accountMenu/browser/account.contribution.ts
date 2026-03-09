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
import { appendUpdateMenuItems as registerUpdateMenuItems } from '../../../../workbench/contrib/update/browser/update.js';
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
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { URI } from '../../../../base/common/uri.js';
import { UpdateHoverWidget } from './updateHoverWidget.js';

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

export class AccountWidget extends ActionViewItem {

	private accountButton: Button | undefined;
	private updateButton: Button | undefined;
	private readonly updateHoverWidget: UpdateHoverWidget;
	private readonly viewItemDisposables = this._register(new DisposableStore());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
	) {
		super(undefined, action, { ...options, icon: false, label: false });
		this.updateHoverWidget = new UpdateHoverWidget(this.updateService, this.productService, this.hoverService);
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

		// Update button (right)
		const updateContainer = append(container, $('.account-widget-update'));
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
		this.updateButton.element.classList.add('account-widget-update-button', 'sidebar-action-button');
		this.viewItemDisposables.add(this.updateHoverWidget.attachTo(this.updateButton.element));

		this.updateAccountButton();
		this.viewItemDisposables.add(this.defaultAccountService.onDidChangeDefaultAccount(() => this.updateAccountButton()));
		this.updateUpdateButton();
		this.viewItemDisposables.add(this.updateService.onStateChange(() => this.updateUpdateButton()));

		this.viewItemDisposables.add(this.accountButton.onDidClick(e => {
			e?.preventDefault();
			e?.stopPropagation();
			this.showAccountMenu(this.accountButton!.element);
		}));

		this.viewItemDisposables.add(this.updateButton.onDidClick(() => this.update()));
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

	private updateUpdateButton(): void {
		if (!this.updateButton) {
			return;
		}

		const state = this.updateService.state;

		// In the embedded app, updates are detected but cannot be installed directly.
		// Show a hint button to update via VS Code only when an update is actually available.
		if (state.type === StateType.AvailableForDownload && state.canInstall === false) {
			this.updateButton.element.classList.remove('hidden');
			this.updateButton.element.classList.remove('account-widget-update-button-ready');
			this.updateButton.element.classList.add('account-widget-update-button-hint');
			this.updateButton.enabled = true;
			this.updateButton.label = localize('updateAvailable', "Update Available");
			this.updateButton.element.title = localize('updateInVSCodeHover', "Updates are managed by VS Code. Click to open VS Code.");
			return;
		}

		if (this.shouldHideUpdateButton(state.type)) {
			this.clearUpdateButtonStyling();
			this.updateButton.element.classList.add('hidden');
			return;
		}

		this.updateButton.element.classList.remove('hidden');
		this.updateButton.element.style.backgroundImage = '';
		this.updateButton.enabled = state.type === StateType.Ready;
		this.updateButton.label = this.getUpdateProgressMessage(state.type);

		if (state.type === StateType.Ready) {
			this.updateButton.element.classList.add('account-widget-update-button-ready');
			return;
		}

		this.updateButton.element.classList.remove('account-widget-update-button-ready');
	}

	private shouldHideUpdateButton(type: StateType): boolean {
		return type === StateType.Uninitialized
			|| type === StateType.Idle
			|| type === StateType.Disabled
			|| type === StateType.CheckingForUpdates;
	}

	private clearUpdateButtonStyling(): void {
		if (this.updateButton) {
			this.updateButton.element.style.backgroundImage = '';
			this.updateButton.element.classList.remove('account-widget-update-button-ready');
		}
	}

	private getUpdateProgressMessage(type: StateType): string {
		switch (type) {
			case StateType.Ready:
				return localize('update', "Update");
			case StateType.AvailableForDownload:
			case StateType.Downloading:
			case StateType.Overwriting:
				return localize('downloadingUpdate', "Downloading...");
			case StateType.Downloaded:
				return localize('installingUpdate', "Installing...");
			case StateType.Updating:
				return localize('updatingApp', "Updating...");
			default:
				return localize('updating', "Updating...");
		}
	}

	private async update(): Promise<void> {
		const state = this.updateService.state;
		if (state.type === StateType.AvailableForDownload && state.canInstall === false) {
			const { confirmed } = await this.dialogService.confirm({
				message: localize('updateFromVSCode.title', "Update from VS Code"),
				detail: localize('updateFromVSCode.detail', "This will close the Sessions app and open VS Code so you can install the update.\n\nLaunch Sessions again after the update is complete."),
				primaryButton: localize('updateFromVSCode.open', "Close and Open VS Code"),
			});
			if (confirmed) {
				await this.openVSCode();
				await this.hostService.close();
			}
			return;
		}
		await this.updateService.quitAndInstall();
	}

	private async openVSCode(): Promise<void> {
		await this.openerService.open(URI.from({
			scheme: this.productService.urlProtocol,
			query: 'windowId=_blank',
		}), { openExternal: true });
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

	}
}

registerWorkbenchContribution2(AccountWidgetContribution.ID, AccountWidgetContribution, WorkbenchPhase.AfterRestored);
