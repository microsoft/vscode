/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IAuthenticationUsageService } from '../../../../services/authentication/browser/authenticationUsageService.js';
import { AuthenticationSessionAccount, IAuthenticationExtensionsService, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';

export class ManageAccountPreferencesForExtensionAction extends Action2 {
	constructor() {
		super({
			id: '_manageAccountPreferencesForExtension',
			title: localize2('manageAccountPreferenceForExtension', "Manage Extension Account Preferences"),
			category: localize2('accounts', "Accounts"),
			f1: false
		});
	}

	override run(accessor: ServicesAccessor, extensionId?: string, providerId?: string): Promise<void> {
		return accessor.get(IInstantiationService).createInstance(ManageAccountPreferenceForExtensionActionImpl).run(extensionId, providerId);
	}
}

interface AccountPreferenceQuickPickItem extends IQuickPickItem {
	account: AuthenticationSessionAccount;
	providerId: string;
}

class ManageAccountPreferenceForExtensionActionImpl {
	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAuthenticationUsageService private readonly _authenticationUsageService: IAuthenticationUsageService,
		@IAuthenticationExtensionsService private readonly _authenticationExtensionsService: IAuthenticationExtensionsService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) { }

	async run(extensionId?: string, providerId?: string) {
		if (!extensionId) {
			return;
		}
		const extension = await this._extensionService.getExtension(extensionId);
		if (!extension) {
			throw new Error(`No extension with id ${extensionId}`);
		}

		const providerIds = new Array<string>();
		const providerIdToAccounts = new Map<string, ReadonlyArray<AuthenticationSessionAccount>>();
		if (providerId) {
			providerIds.push(providerId);
			providerIdToAccounts.set(providerId, await this._authenticationService.getAccounts(providerId));
		} else {
			for (const providerId of this._authenticationService.getProviderIds()) {
				const accounts = await this._authenticationService.getAccounts(providerId);
				for (const account of accounts) {
					const usage = this._authenticationUsageService.readAccountUsages(providerId, account.label).find(u => u.extensionId === extensionId.toLowerCase());
					if (usage) {
						providerIds.push(providerId);
						providerIdToAccounts.set(providerId, accounts);
						break;
					}
				}
			}
		}

		let chosenProviderId: string | undefined = providerIds[0];
		if (providerIds.length > 1) {
			const result = await this._quickInputService.pick(
				providerIds.map(providerId => ({
					label: this._authenticationService.getProvider(providerId).label,
					id: providerId,
				})),
				{
					placeHolder: localize('selectProvider', "Select an authentication provider to manage account preferences for"),
					title: localize('pickAProviderTitle', "Manage Extension Account Preferences")
				}
			);
			chosenProviderId = result?.id;
		}

		if (!chosenProviderId) {
			return;
		}

		const currentAccountNamePreference = this._authenticationExtensionsService.getAccountPreference(extensionId, chosenProviderId);
		const items: Array<QuickPickInput<AccountPreferenceQuickPickItem>> = this._getItems(providerIdToAccounts.get(chosenProviderId)!, chosenProviderId, currentAccountNamePreference);

		const disposables = new DisposableStore();
		const picker = this._createQuickPick(disposables, extensionId, extension.displayName ?? extension.name);
		if (items.length === 0) {
			// We would only get here if we went through the Command Palette
			disposables.add(this._handleNoAccounts(picker));
			return;
		}
		picker.items = items;
		picker.show();
	}

	private _createQuickPick(disposableStore: DisposableStore, extensionId: string, extensionLabel: string) {
		const picker = disposableStore.add(this._quickInputService.createQuickPick<AccountPreferenceQuickPickItem>({ useSeparators: true }));
		disposableStore.add(picker.onDidHide(() => {
			disposableStore.dispose();
		}));
		picker.placeholder = localize('placeholder', "Manage '{0}' account preferences...", extensionLabel);
		picker.title = localize('title', "'{0}' Account Preferences For This Workspace", extensionLabel);
		picker.sortByLabel = false;
		disposableStore.add(picker.onDidAccept(() => {
			this._accept(extensionId, picker.selectedItems);
			picker.hide();
		}));
		return picker;
	}

	private _getItems(accounts: ReadonlyArray<AuthenticationSessionAccount>, providerId: string, currentAccountNamePreference: string | undefined): Array<QuickPickInput<AccountPreferenceQuickPickItem>> {
		return accounts.map<QuickPickInput<AccountPreferenceQuickPickItem>>(a => currentAccountNamePreference === a.label
			? {
				label: a.label,
				account: a,
				providerId,
				description: localize('currentAccount', "Current account"),
				picked: true
			}
			: {
				label: a.label,
				account: a,
				providerId,
			}
		);
	}

	private _handleNoAccounts(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>): IDisposable {
		picker.validationMessage = localize('noAccounts', "No accounts are currently used by this extension.");
		picker.buttons = [this._quickInputService.backButton];
		picker.show();
		return Event.filter(picker.onDidTriggerButton, (e) => e === this._quickInputService.backButton)(() => this.run());
	}

	private _accept(extensionId: string, selectedItems: ReadonlyArray<AccountPreferenceQuickPickItem>) {
		for (const item of selectedItems) {
			const account = item.account;
			const providerId = item.providerId;
			const currentAccountName = this._authenticationExtensionsService.getAccountPreference(extensionId, providerId);
			if (currentAccountName === account.label) {
				// This account is already the preferred account
				continue;
			}
			this._authenticationExtensionsService.updateAccountPreference(extensionId, providerId, account);
		}
	}
}
