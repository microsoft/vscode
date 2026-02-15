/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { AuthenticationSessionAccount, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IAuthenticationQueryService } from '../../../../services/authentication/common/authenticationQuery.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';

export class ManageAccountPreferencesForMcpServerAction extends Action2 {
	constructor() {
		super({
			id: '_manageAccountPreferencesForMcpServer',
			title: localize2('manageAccountPreferenceForMcpServer', "Manage MCP Server Account Preferences"),
			category: localize2('accounts', "Accounts"),
			f1: false
		});
	}

	override run(accessor: ServicesAccessor, mcpServerId?: string, providerId?: string): Promise<void> {
		return accessor.get(IInstantiationService).createInstance(ManageAccountPreferenceForMcpServerActionImpl).run(mcpServerId, providerId);
	}
}

type AccountPreferenceQuickPickItem = NewAccountQuickPickItem | ExistingAccountQuickPickItem;

interface NewAccountQuickPickItem extends IQuickPickItem {
	account?: undefined;
	scopes: readonly string[];
	providerId: string;
}

interface ExistingAccountQuickPickItem extends IQuickPickItem {
	account: AuthenticationSessionAccount;
	scopes?: undefined;
	providerId: string;
}

class ManageAccountPreferenceForMcpServerActionImpl {
	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IAuthenticationQueryService private readonly _authenticationQueryService: IAuthenticationQueryService,
		@IMcpService private readonly _mcpService: IMcpService,
		@ILogService private readonly _logService: ILogService
	) { }

	async run(mcpServerId?: string, providerId?: string) {
		if (!mcpServerId) {
			return;
		}
		const mcpServer = this._mcpService.servers.get().find(s => s.definition.id === mcpServerId);
		if (!mcpServer) {
			throw new Error(`No MCP server with id ${mcpServerId}`);
		}

		if (!providerId) {
			// Use the query service's MCP server-centric approach to find providers that have been used
			const mcpServerQuery = this._authenticationQueryService.mcpServer(mcpServerId);
			const providersWithAccess = await mcpServerQuery.getProvidersWithAccess();
			if (!providersWithAccess.length) {
				await this._dialogService.info(localize('noAccountUsage', "This MCP server has not used any accounts yet."));
				return;
			}
			providerId = providersWithAccess[0]; // Default to the first provider
			if (providersWithAccess.length > 1) {
				const result = await this._quickInputService.pick(
					providersWithAccess.map(providerId => ({
						label: this._authenticationService.getProvider(providerId).label,
						id: providerId,
					})),
					{
						placeHolder: localize('selectProvider', "Select an authentication provider to manage account preferences for"),
						title: localize('pickAProviderTitle', "Manage MCP Server Account Preferences")
					}
				);
				if (!result) {
					return; // User cancelled
				}
				providerId = result.id;
			}
		}

		// Only fetch accounts for the chosen provider
		const accounts = await this._authenticationService.getAccounts(providerId);
		const currentAccountNamePreference = this._authenticationQueryService.provider(providerId).mcpServer(mcpServerId).getPreferredAccount();
		const items: Array<QuickPickInput<AccountPreferenceQuickPickItem>> = this._getItems(accounts, providerId, currentAccountNamePreference);

		// If the provider supports multiple accounts, add an option to use a new account
		const provider = this._authenticationService.getProvider(providerId);
		if (provider.supportsMultipleAccounts) {
			// Get the last used scopes for the last used account. This will be used to pre-fill the scopes when adding a new account.
			// If there's no scopes, then don't add this option.
			const lastUsedScopes = accounts
				.flatMap(account => this._authenticationQueryService.provider(providerId).account(account.label).mcpServer(mcpServerId).getUsage())
				.sort((a, b) => b.lastUsed - a.lastUsed)[0]?.scopes; // Sort by timestamp and take the most recent
			if (lastUsedScopes) {
				items.push({ type: 'separator' });
				items.push({
					providerId: providerId,
					scopes: lastUsedScopes,
					label: localize('use new account', "Use a new account..."),
				});
			}
		}

		const disposables = new DisposableStore();
		const picker = this._createQuickPick(disposables, mcpServerId, mcpServer.definition.label, provider.label);
		if (items.length === 0) {
			// We would only get here if we went through the Command Palette
			disposables.add(this._handleNoAccounts(picker));
			return;
		}
		picker.items = items;
		picker.show();
	}

	private _createQuickPick(disposableStore: DisposableStore, mcpServerId: string, mcpServerLabel: string, providerLabel: string) {
		const picker = disposableStore.add(this._quickInputService.createQuickPick<AccountPreferenceQuickPickItem>({ useSeparators: true }));
		disposableStore.add(picker.onDidHide(() => {
			disposableStore.dispose();
		}));
		picker.placeholder = localize('placeholder v2', "Manage '{0}' account preferences for {1}...", mcpServerLabel, providerLabel);
		picker.title = localize('title', "'{0}' Account Preferences For This Workspace", mcpServerLabel);
		picker.sortByLabel = false;
		disposableStore.add(picker.onDidAccept(async () => {
			picker.hide();
			await this._accept(mcpServerId, picker.selectedItems);
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
		picker.validationMessage = localize('noAccounts', "No accounts are currently used by this MCP server.");
		picker.buttons = [this._quickInputService.backButton];
		picker.show();
		return Event.filter(picker.onDidTriggerButton, (e) => e === this._quickInputService.backButton)(() => this.run());
	}

	private async _accept(mcpServerId: string, selectedItems: ReadonlyArray<AccountPreferenceQuickPickItem>) {
		for (const item of selectedItems) {
			let account: AuthenticationSessionAccount;
			if (!item.account) {
				try {
					const session = await this._authenticationService.createSession(item.providerId, [...item.scopes]);
					account = session.account;
				} catch (e) {
					this._logService.error(e);
					continue;
				}
			} else {
				account = item.account;
			}
			const providerId = item.providerId;
			const mcpQuery = this._authenticationQueryService.provider(providerId).mcpServer(mcpServerId);
			const currentAccountName = mcpQuery.getPreferredAccount();
			if (currentAccountName === account.label) {
				// This account is already the preferred account
				continue;
			}
			mcpQuery.setPreferredAccount(account);
		}
	}
}
