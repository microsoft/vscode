/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize, localize2 } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickSeparator, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { IAuthenticationUsageService } from 'vs/workbench/services/authentication/browser/authenticationUsageService';
import { AuthenticationSessionAccount, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class ManageAccountPreferencesForExtensionAction extends Action2 {
	constructor() {
		super({
			id: '_manageAccountPreferencesForExtension',
			title: localize2('manageAccountPreferenceForExtension', "Manage Extension Account Preferences"),
			category: localize2('accounts', "Accounts"),
			f1: true
		});
	}

	override run(accessor: ServicesAccessor, extensionId?: string) {
		return accessor.get(IInstantiationService).createInstance(ManageAccountPreferenceForExtensionActionImpl).run(extensionId);
	}
}

class ManageAccountPreferenceForExtensionActionImpl {
	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAuthenticationUsageService private readonly _authenticationUsageService: IAuthenticationUsageService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) { }

	async run(extensionId?: string) {
		// extensionId = await this._resolveExtensionId(extensionId);
		if (!extensionId) {
			return;
		}
		const extension = await this._extensionService.getExtension(extensionId);
		if (!extension) {
			throw new Error(`No extension with id ${extensionId}`);
		}

		const providerIds = new Array<string>();
		const items = new Array<QuickPickInput<IQuickPickItem & { account: AuthenticationSessionAccount }>>();
		for (const providerId of this._authenticationService.getProviderIds()) {
			const accounts = await this._authenticationService.getAccounts(providerId);
			for (const account of accounts) {
				const usage = this._authenticationUsageService.readAccountUsages(providerId, account.label).find(u => u.extensionId === extensionId.toLowerCase());
				if (usage) {
					const provider = this._authenticationService.getProvider(providerId);
					providerIds.push(providerId);
					items.push({
						label: provider.label,
						type: 'separator'
					});
					items.push(...accounts.map(a => ({
						label: a.label,
						account: a
					})));
					break;
				}
			}
		}

		const disposables = new DisposableStore();
		const picker = this._createQuickPick(disposables, extensionId, extension.displayName ?? extension.name);
		if (items.length === 0) {
			// We would only get here if we went through the Command Palette
			disposables.add(this._handleNoAccounts(picker));
			return;
		}
		// const items = await this._getItems(providerId, accounts);

		picker.items = items;
		// let currentSelectedItems = items.filter((i): i is IQuickPickItem & { account: AuthenticationSessionAccount } => i.type !== 'separator' && !!i.picked);
		// picker.selectedItems = currentSelectedItems;
		// disposables.add(picker.onDidChangeSelection(selection => {
		// 	// find what changed
		// 	const added: (IQuickPickItem & { account: AuthenticationSessionAccount }) | undefined = selection.filter(i => !currentSelectedItems.includes(i))[0];
		// 	if (!added) {
		// 		return;
		// 	}
		// 	const addedIndex = items.indexOf(added);
		// 	// Now find the separator that contains the added item
		// 	for (let i = addedIndex - 1; i >= 0; i--) {
		// 		const element = items[i];
		// 		if (element.type === 'separator') {
		// 			i++;
		// 			do {
		// 				const item = items[i];
		// 				if (item.type === 'separator') {
		// 					break;
		// 				}
		// 				if (item === added) {
		// 					item.picked = true;
		// 					item.disabled = true;
		// 				} else {
		// 					item.picked = false;
		// 					item.disabled = false;
		// 				}
		// 				i++;
		// 			} while (items[i]);
		// 			break;
		// 		}
		// 	}
		// 	currentSelectedItems = items.filter((i): i is IQuickPickItem & { account: AuthenticationSessionAccount } => i.type !== 'separator' && !!i.picked);
		// 	const activeItems = picker.activeItems;
		// 	picker.items = items;
		// 	picker.activeItems = activeItems;
		// 	picker.selectedItems = currentSelectedItems;
		// }));
		// disposables.add(picker.onDidAccept(() => {
		// 	console.log('accepted');
		// 	picker.hide();
		// }));
		picker.show();
	}

	private async _resolveExtensionId(providerId?: string): Promise<string | undefined> {
		// TODO: This is a temporary implementation to allow for testing. We need to figure out how to get the extension id from the command palette
		return undefined;
	}

	private async _getItems(
		providerId: string,
		accounts: ReadonlyArray<AuthenticationSessionAccount>
	): Promise<ReadonlyArray<QuickPickInput<IQuickPickItem & { account: AuthenticationSessionAccount }>>> {

		const idToLabel = new Map<string, string>();
		const preferredAccounts = new Map<string, { account: AuthenticationSessionAccount; lastUsed?: number }>();

		for (const account of accounts) {
			const usages = this._authenticationUsageService.readAccountUsages(providerId, account.label);
			for (const usage of usages) {
				let extensionLabel = idToLabel.get(usage.extensionId);
				if (!extensionLabel) {
					const extension = await this._extensionService.getExtension(usage.extensionId);
					if (extension) {
						extensionLabel = extension.displayName ?? extension.name;
						idToLabel.set(usage.extensionId, extensionLabel);
					}
				}
				// If we still don't have a label, it means that this extension is not installed
				if (extensionLabel) {
					const existing = preferredAccounts.get(usage.extensionId);
					if (!existing?.lastUsed || existing.lastUsed < usage.lastUsed) {
						preferredAccounts.set(usage.extensionId, { account, lastUsed: usage.lastUsed });
					}
				}
			}
		}

		const items: QuickPickInput<IQuickPickItem & { account: AuthenticationSessionAccount }>[] = [];
		const separatorIndexes = new Array<number>();
		for (const [extensionId, { account: preferredAccount }] of preferredAccounts) {
			const label = idToLabel.get(extensionId) ?? extensionId;
			separatorIndexes.push(items.length);
			items.push({
				label,
				id: extensionId,
				type: 'separator'
			});
			for (let i = 0; i < accounts.length; i++) {
				const account = accounts[i];
				items.push({
					label: account.label,
					account,
					picked: preferredAccount === account,
					disabled: preferredAccount === account,
				});
			}
		}

		return items;
	}

	private _createQuickPick(disposableStore: DisposableStore, extensionId: string, extensionLabel: string) {
		const picker = disposableStore.add(this._quickInputService.createQuickPick<IQuickPickItem & { account: AuthenticationSessionAccount }>({ useSeparators: true }));
		disposableStore.add(picker.onDidHide(() => {
			disposableStore.dispose();
		}));
		picker.placeholder = localize('asdf', "Manage '{0}' account preferences...", extensionLabel);
		picker.title = localize('title', "'{0}' Account Preferences For This Workspace", extensionLabel);
		picker.sortByLabel = false;
		disposableStore.add(picker.onDidAccept(() => {
			this._accept(picker.selectedItems);
			picker.hide();
		}));
		// const addButton = {
		// 	iconClass: ThemeIcon.asClassName(Codicon.plus),
		// 	tooltip: localize('addAccount', "Add an account")
		// };
		// picker.buttons = [addButton];
		// disposableStore.add(Event.filter(picker.onDidTriggerButton, (e) => e === addButton)(() => {
		// 	picker.hide();
		// 	return this._createSession(providerId);
		// }));
		return picker;
	}

	private _handleNoAccounts(picker: IQuickPick<IQuickPickItem, { useSeparators: true }>): IDisposable {
		picker.validationMessage = localize('noAccounts', "No accounts are currently used by this extension.");
		picker.buttons = [this._quickInputService.backButton];
		picker.show();
		return Event.filter(picker.onDidTriggerButton, (e) => e === this._quickInputService.backButton)(() => this.run());
	}

	private _accept(selectedItems: ReadonlyArray<IQuickPickItem & { account: AuthenticationSessionAccount }>) {
		// for (let i = 0; i < allSeparators.length; i++) {
		// const extensionId = allSeparators[i].id!;
		// const extensionLabel = allSeparators[i].label;
		// const selectedAccount = selectedItems[i].account;
		// }
	}

	// private _createSession(providerId: string) {
	// 	return this._authenticationService.createSession(providerId, [], {});
	// }
}
