/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow } from 'vs/base/common/date';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IAuthenticationAccessService } from 'vs/workbench/services/authentication/browser/authenticationAccessService';
import { IAuthenticationUsageService } from 'vs/workbench/services/authentication/browser/authenticationUsageService';
import { AllowedExtension } from 'vs/workbench/services/authentication/common/authentication';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class ManageTrustedExtensionsForAccountAction extends Action2 {
	constructor() {
		super({
			id: '_manageTrustedExtensionsForAccount',
			title: localize('manageTrustedExtensionsForAccount', "Manage Trusted Extensions For Account"),
			f1: false
		});
	}

	override async run(accessor: ServicesAccessor, { providerId, accountLabel }: { providerId: string; accountLabel: string }): Promise<void> {
		const productService = accessor.get(IProductService);
		const extensionService = accessor.get(IExtensionService);
		const dialogService = accessor.get(IDialogService);
		const quickInputService = accessor.get(IQuickInputService);
		const authenticationUsageService = accessor.get(IAuthenticationUsageService);
		const authenticationAccessService = accessor.get(IAuthenticationAccessService);

		if (!providerId || !accountLabel) {
			throw new Error('Invalid arguments. Expected: { providerId: string; accountLabel: string }');
		}

		const allowedExtensions = authenticationAccessService.readAllowedExtensions(providerId, accountLabel);
		const trustedExtensionAuthAccess = productService.trustedExtensionAuthAccess;
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
				const extension = await extensionService.getExtension(extensionId);
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
			dialogService.info(localize('noTrustedExtensions', "This account has not been used by any extensions."));
			return;
		}

		interface TrustedExtensionsQuickPickItem extends IQuickPickItem {
			extension: AllowedExtension;
			lastUsed?: number;
		}

		const disposableStore = new DisposableStore();
		const quickPick = disposableStore.add(quickInputService.createQuickPick<TrustedExtensionsQuickPickItem>());
		quickPick.canSelectMany = true;
		quickPick.customButton = true;
		quickPick.customLabel = localize('manageTrustedExtensions.cancel', 'Cancel');
		const usages = authenticationUsageService.readAccountUsages(providerId, accountLabel);
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
		const toQuickPickItem = function (extension: AllowedExtension) {
			const lastUsed = extension.lastUsed;
			const description = lastUsed
				? localize({ key: 'accountLastUsedDate', comment: ['The placeholder {0} is a string with time information, such as "3 days ago"'] }, "Last used this account {0}", fromNow(lastUsed, true))
				: localize('notUsed', "Has not used this account");
			let tooltip: string | undefined;
			if (extension.trusted) {
				tooltip = localize('trustedExtensionTooltip', "This extension is trusted by Microsoft and\nalways has access to this account");
			}
			return {
				label: extension.name,
				extension,
				description,
				tooltip
			};
		};
		const items: Array<TrustedExtensionsQuickPickItem | IQuickPickSeparator> = [
			...otherExtensions.sort(sortByLastUsed).map(toQuickPickItem),
			{ type: 'separator', label: localize('trustedExtensions', "Trusted by Microsoft") },
			...trustedExtensions.sort(sortByLastUsed).map(toQuickPickItem)
		];

		quickPick.items = items;
		quickPick.selectedItems = items.filter((item): item is TrustedExtensionsQuickPickItem => item.type !== 'separator' && (item.extension.allowed === undefined || item.extension.allowed));
		quickPick.title = localize('manageTrustedExtensions', "Manage Trusted Extensions");
		quickPick.placeholder = localize('manageExtensions', "Choose which extensions can access this account");

		disposableStore.add(quickPick.onDidAccept(() => {
			const updatedAllowedList = quickPick.items
				.filter((item): item is TrustedExtensionsQuickPickItem => item.type !== 'separator')
				.map(i => i.extension);
			authenticationAccessService.updateAllowedExtensions(providerId, accountLabel, updatedAllowedList);
			quickPick.hide();
		}));

		disposableStore.add(quickPick.onDidChangeSelection((changed) => {
			const trustedItems = new Set<TrustedExtensionsQuickPickItem>();
			quickPick.items.forEach(item => {
				const trustItem = item as TrustedExtensionsQuickPickItem;
				if (trustItem.extension) {
					if (trustItem.extension.trusted) {
						trustedItems.add(trustItem);
					} else {
						trustItem.extension.allowed = false;
					}
				}
			});
			changed.forEach((item) => {
				item.extension.allowed = true;
				trustedItems.delete(item);
			});

			// reselect trusted items if a user tried to unselect one since quick pick doesn't support forcing selection
			if (trustedItems.size) {
				quickPick.selectedItems = [...changed, ...trustedItems];
			}
		}));

		disposableStore.add(quickPick.onDidHide(() => {
			disposableStore.dispose();
		}));

		disposableStore.add(quickPick.onDidCustom(() => {
			quickPick.hide();
		}));

		quickPick.show();
	}

}
