/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow } from '../../../../../base/common/date.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IAuthenticationAccessService } from '../../../../services/authentication/browser/authenticationAccessService.js';
import { IAuthenticationUsageService } from '../../../../services/authentication/browser/authenticationUsageService.js';
import { AllowedExtension, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';

export class ManageTrustedExtensionsForAccountAction extends Action2 {
	constructor() {
		super({
			id: '_manageTrustedExtensionsForAccount',
			title: localize2('manageTrustedExtensionsForAccount', "Manage Trusted Extensions For Account"),
			category: localize2('accounts', "Accounts"),
			f1: true
		});
	}

	override run(accessor: ServicesAccessor, options?: { providerId: string; accountLabel: string }): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		return instantiationService.createInstance(ManageTrustedExtensionsForAccountActionImpl).run(options);
	}
}

interface TrustedExtensionsQuickPickItem extends IQuickPickItem {
	extension: AllowedExtension;
	lastUsed?: number;
}

class ManageTrustedExtensionsForAccountActionImpl {
	constructor(
		@IProductService private readonly _productService: IProductService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationUsageService private readonly _authenticationUsageService: IAuthenticationUsageService,
		@IAuthenticationAccessService private readonly _authenticationAccessService: IAuthenticationAccessService
	) { }

	async run(options?: { providerId: string; accountLabel: string }) {
		const { providerId, accountLabel } = await this._resolveProviderAndAccountLabel(options?.providerId, options?.accountLabel);
		if (!providerId || !accountLabel) {
			return;
		}

		const items = await this._getItems(providerId, accountLabel);
		if (!items.length) {
			return;
		}
		const disposables = new DisposableStore();
		const picker = this._createQuickPick(disposables, providerId, accountLabel);
		picker.items = items;
		picker.selectedItems = items.filter((i): i is TrustedExtensionsQuickPickItem => i.type !== 'separator' && !!i.picked);
		picker.show();
	}

	private async _resolveProviderAndAccountLabel(providerId: string | undefined, accountLabel: string | undefined) {
		if (!providerId || !accountLabel) {
			const accounts = new Array<{ providerId: string; providerLabel: string; accountLabel: string }>();
			for (const id of this._authenticationService.getProviderIds()) {
				const providerLabel = this._authenticationService.getProvider(id).label;
				const sessions = await this._authenticationService.getSessions(id);
				const uniqueAccountLabels = new Set<string>();
				for (const session of sessions) {
					if (!uniqueAccountLabels.has(session.account.label)) {
						uniqueAccountLabels.add(session.account.label);
						accounts.push({ providerId: id, providerLabel, accountLabel: session.account.label });
					}
				}
			}

			const pick = await this._quickInputService.pick(
				accounts.map(account => ({
					providerId: account.providerId,
					label: account.accountLabel,
					description: account.providerLabel
				})),
				{
					placeHolder: localize('pickAccount', "Pick an account to manage trusted extensions for"),
					matchOnDescription: true,
				}
			);

			if (pick) {
				providerId = pick.providerId;
				accountLabel = pick.label;
			} else {
				return { providerId: undefined, accountLabel: undefined };
			}
		}
		return { providerId, accountLabel };
	}

	private async _getItems(providerId: string, accountLabel: string) {
		const allowedExtensions = this._authenticationAccessService.readAllowedExtensions(providerId, accountLabel);
		const trustedExtensionAuthAccess = this._productService.trustedExtensionAuthAccess;
		const trustedExtensionIds =
			// Case 1: trustedExtensionAuthAccess is an array
			Array.isArray(trustedExtensionAuthAccess)
				? trustedExtensionAuthAccess
				// Case 2: trustedExtensionAuthAccess is an object
				: typeof trustedExtensionAuthAccess === 'object'
					? trustedExtensionAuthAccess[providerId] ?? []
					: [];
		for (const extensionId of trustedExtensionIds) {
			const allowedExtension = allowedExtensions.find(ext => ext.id === extensionId);
			if (!allowedExtension) {
				// Add the extension to the allowedExtensions list
				const extension = await this._extensionService.getExtension(extensionId);
				if (extension) {
					allowedExtensions.push({
						id: extensionId,
						name: extension.displayName || extension.name,
						allowed: true,
						trusted: true
					});
				}
			} else {
				// Update the extension to be allowed
				allowedExtension.allowed = true;
				allowedExtension.trusted = true;
			}
		}

		if (!allowedExtensions.length) {
			this._dialogService.info(localize('noTrustedExtensions', "This account has not been used by any extensions."));
			return [];
		}

		const usages = this._authenticationUsageService.readAccountUsages(providerId, accountLabel);
		const trustedExtensions = [];
		const otherExtensions = [];
		for (const extension of allowedExtensions) {
			const usage = usages.find(usage => extension.id === usage.extensionId);
			extension.lastUsed = usage?.lastUsed;
			if (extension.trusted) {
				trustedExtensions.push(extension);
			} else {
				otherExtensions.push(extension);
			}
		}

		const sortByLastUsed = (a: AllowedExtension, b: AllowedExtension) => (b.lastUsed || 0) - (a.lastUsed || 0);

		const items = [
			...otherExtensions.sort(sortByLastUsed).map(this._toQuickPickItem),
			{ type: 'separator', label: localize('trustedExtensions', "Trusted by Microsoft") } satisfies IQuickPickSeparator,
			...trustedExtensions.sort(sortByLastUsed).map(this._toQuickPickItem)
		];

		return items;
	}

	private _toQuickPickItem(extension: AllowedExtension): TrustedExtensionsQuickPickItem {
		const lastUsed = extension.lastUsed;
		const description = lastUsed
			? localize({ key: 'accountLastUsedDate', comment: ['The placeholder {0} is a string with time information, such as "3 days ago"'] }, "Last used this account {0}", fromNow(lastUsed, true))
			: localize('notUsed', "Has not used this account");
		let tooltip: string | undefined;
		let disabled: boolean | undefined;
		if (extension.trusted) {
			tooltip = localize('trustedExtensionTooltip', "This extension is trusted by Microsoft and\nalways has access to this account");
			disabled = true;
		}
		return {
			label: extension.name,
			extension,
			description,
			tooltip,
			disabled,
			picked: extension.allowed === undefined || extension.allowed
		};
	}

	private _createQuickPick(disposableStore: DisposableStore, providerId: string, accountLabel: string) {
		const quickPick = disposableStore.add(this._quickInputService.createQuickPick<TrustedExtensionsQuickPickItem>({ useSeparators: true }));
		quickPick.canSelectMany = true;
		quickPick.customButton = true;
		quickPick.customLabel = localize('manageTrustedExtensions.cancel', 'Cancel');

		quickPick.title = localize('manageTrustedExtensions', "Manage Trusted Extensions");
		quickPick.placeholder = localize('manageExtensions', "Choose which extensions can access this account");

		disposableStore.add(quickPick.onDidAccept(() => {
			const updatedAllowedList = quickPick.items
				.filter((item): item is TrustedExtensionsQuickPickItem => item.type !== 'separator')
				.map(i => i.extension);

			const allowedExtensionsSet = new Set(quickPick.selectedItems.map(i => i.extension));
			updatedAllowedList.forEach(extension => {
				extension.allowed = allowedExtensionsSet.has(extension);
			});
			this._authenticationAccessService.updateAllowedExtensions(providerId, accountLabel, updatedAllowedList);
			quickPick.hide();
		}));

		disposableStore.add(quickPick.onDidHide(() => {
			disposableStore.dispose();
		}));

		disposableStore.add(quickPick.onDidCustom(() => {
			quickPick.hide();
		}));
		return quickPick;
	}
}
