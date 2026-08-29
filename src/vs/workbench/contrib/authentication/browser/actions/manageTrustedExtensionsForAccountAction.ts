/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { AllowedExtension, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IAuthenticationQueryService, IAccountQuery } from '../../../../services/authentication/common/authenticationQuery.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';

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
	private readonly _viewDetailsButton = {
		tooltip: localize('viewExtensionDetails', "View extension details"),
		iconClass: ThemeIcon.asClassName(Codicon.info),
	};

	private readonly _managePreferencesButton = {
		tooltip: localize('accountPreferences', "Manage account preferences for this extension"),
		iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
	};

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationQueryService private readonly _authenticationQueryService: IAuthenticationQueryService,
		@ICommandService private readonly _commandService: ICommandService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService
	) { }

	async run(options?: { providerId: string; accountLabel: string }) {
		const accountQuery = await this._resolveAccountQuery(options?.providerId, options?.accountLabel);
		if (!accountQuery) {
			return;
		}

		const items = await this._getItems(accountQuery);
		if (!items.length) {
			return;
		}
		const picker = this._createQuickPick(accountQuery);
		picker.items = items;
		picker.selectedItems = items.filter((i): i is TrustedExtensionsQuickPickItem => i.type !== 'separator' && !!i.picked);
		picker.show();
	}

	//#region Account Query Resolution

	private async _resolveAccountQuery(providerId: string | undefined, accountLabel: string | undefined): Promise<IAccountQuery | undefined> {
		if (providerId && accountLabel) {
			return this._authenticationQueryService.provider(providerId).account(accountLabel);
		}

		const accounts = await this._getAllAvailableAccounts();
		const pick = await this._quickInputService.pick(accounts, {
			placeHolder: localize('pickAccount', "Pick an account to manage trusted extensions for"),
			matchOnDescription: true,
		});

		return pick ? this._authenticationQueryService.provider(pick.providerId).account(pick.label) : undefined;
	}

	private async _getAllAvailableAccounts() {
		const accounts = [];
		for (const providerId of this._authenticationService.getProviderIds()) {
			const provider = this._authenticationService.getProvider(providerId);
			const sessions = await this._authenticationService.getSessions(providerId);
			const uniqueLabels = new Set<string>();

			for (const session of sessions) {
				if (!uniqueLabels.has(session.account.label)) {
					uniqueLabels.add(session.account.label);
					accounts.push({
						providerId,
						label: session.account.label,
						description: provider.label
					});
				}
			}
		}
		return accounts;
	}

	//#endregion

	//#region Item Retrieval and Quick Pick Creation

	private async _getItems(accountQuery: IAccountQuery) {
		const allowedExtensions = accountQuery.extensions().getAllowedExtensions();
		const extensionIdToDisplayName = new Map<string, string>();

		// Get display names for all allowed extensions
		const resolvedExtensions = await Promise.all(allowedExtensions.map(ext => this._extensionService.getExtension(ext.id)));
		resolvedExtensions.forEach((resolved, i) => {
			if (resolved) {
				extensionIdToDisplayName.set(allowedExtensions[i].id, resolved.displayName || resolved.name);
			}
		});

		// Filter out extensions that are not currently installed and enrich with display names
		const filteredExtensions = allowedExtensions
			.filter(ext => extensionIdToDisplayName.has(ext.id))
			.map(ext => {
				const usage = accountQuery.extension(ext.id).getUsage();
				return {
					...ext,
					// Use the extension display name from the extension service
					name: extensionIdToDisplayName.get(ext.id)!,
					lastUsed: usage.length > 0 ? Math.max(...usage.map(u => u.lastUsed)) : ext.lastUsed
				};
			});

		if (!filteredExtensions.length) {
			this._dialogService.info(localize('noTrustedExtensions', "This account has not been used by any extensions."));
			return [];
		}

		const trustedExtensions = filteredExtensions.filter(e => e.trusted);
		const otherExtensions = filteredExtensions.filter(e => !e.trusted);
		const sortByLastUsed = (a: AllowedExtension, b: AllowedExtension) => (b.lastUsed || 0) - (a.lastUsed || 0);

		const _toQuickPickItem = this._toQuickPickItem.bind(this);
		return [
			...otherExtensions.sort(sortByLastUsed).map(_toQuickPickItem),
			{ type: 'separator', label: localize('trustedExtensions', "Trusted by Microsoft") } satisfies IQuickPickSeparator,
			...trustedExtensions.sort(sortByLastUsed).map(_toQuickPickItem)
		];
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
			buttons: [this._viewDetailsButton, this._managePreferencesButton],
			picked: extension.allowed === undefined || extension.allowed
		};
	}

	private _createQuickPick(accountQuery: IAccountQuery) {
		const disposableStore = new DisposableStore();
		const quickPick = disposableStore.add(this._quickInputService.createQuickPick<TrustedExtensionsQuickPickItem>({ useSeparators: true }));

		// Configure quick pick
		quickPick.canSelectMany = true;
		quickPick.customButton = true;
		quickPick.customLabel = localize('manageTrustedExtensions.cancel', 'Cancel');
		quickPick.customButtonSecondary = true;
		quickPick.title = localize('manageTrustedExtensions', "Manage Trusted Extensions");
		quickPick.placeholder = localize('manageExtensions', "Choose which extensions can access this account");

		// Set up event handlers
		disposableStore.add(quickPick.onDidAccept(() => {
			const updatedAllowedList = quickPick.items
				.filter((item): item is TrustedExtensionsQuickPickItem => item.type !== 'separator')
				.map(i => i.extension);

			const allowedExtensionsSet = new Set(quickPick.selectedItems.map(i => i.extension));
			for (const extension of updatedAllowedList) {
				const allowed = allowedExtensionsSet.has(extension);
				accountQuery.extension(extension.id).setAccessAllowed(allowed, extension.name);
			}
			quickPick.hide();
		}));

		disposableStore.add(quickPick.onDidHide(() => disposableStore.dispose()));
		disposableStore.add(quickPick.onDidCustom(() => quickPick.hide()));
		disposableStore.add(quickPick.onDidTriggerItemButton(e => {
			if (e.button === this._managePreferencesButton) {
				this._commandService.executeCommand('_manageAccountPreferencesForExtension', e.item.extension.id, accountQuery.providerId);
			} else if (e.button === this._viewDetailsButton) {
				this._extensionsWorkbenchService.open(e.item.extension.id);
			}
		}));

		return quickPick;
	}

	//#endregion
}
