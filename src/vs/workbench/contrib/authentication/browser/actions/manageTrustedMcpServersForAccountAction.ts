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
import { AllowedMcpServer } from '../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IAuthenticationQueryService, IAccountQuery } from '../../../../services/authentication/common/authenticationQuery.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';

export class ManageTrustedMcpServersForAccountAction extends Action2 {
	constructor() {
		super({
			id: '_manageTrustedMCPServersForAccount',
			title: localize2('manageTrustedMcpServersForAccount', "Manage Trusted MCP Servers For Account"),
			category: localize2('accounts', "Accounts"),
			f1: true,
			precondition: ChatContextKeys.Setup.hidden.negate()
		});
	}

	override run(accessor: ServicesAccessor, options?: { providerId: string; accountLabel: string }): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		return instantiationService.createInstance(ManageTrustedMcpServersForAccountActionImpl).run(options);
	}
}

interface TrustedMcpServersQuickPickItem extends IQuickPickItem {
	mcpServer: AllowedMcpServer;
	lastUsed?: number;
}

class ManageTrustedMcpServersForAccountActionImpl {
	constructor(
		@IMcpService private readonly _mcpServerService: IMcpService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAuthenticationService private readonly _mcpServerAuthenticationService: IAuthenticationService,
		@IAuthenticationQueryService private readonly _authenticationQueryService: IAuthenticationQueryService,
		@ICommandService private readonly _commandService: ICommandService
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
		picker.selectedItems = items.filter((i): i is TrustedMcpServersQuickPickItem => i.type !== 'separator' && !!i.picked);
		picker.show();
	}

	//#region Account Query Resolution

	private async _resolveAccountQuery(providerId: string | undefined, accountLabel: string | undefined): Promise<IAccountQuery | undefined> {
		if (providerId && accountLabel) {
			return this._authenticationQueryService.provider(providerId).account(accountLabel);
		}

		const accounts = await this._getAllAvailableAccounts();
		const pick = await this._quickInputService.pick(accounts, {
			placeHolder: localize('pickAccount', "Pick an account to manage trusted MCP servers for"),
			matchOnDescription: true,
		});

		return pick ? this._authenticationQueryService.provider(pick.providerId).account(pick.label) : undefined;
	}

	private async _getAllAvailableAccounts() {
		const accounts = [];
		for (const providerId of this._mcpServerAuthenticationService.getProviderIds()) {
			const provider = this._mcpServerAuthenticationService.getProvider(providerId);
			const sessions = await this._mcpServerAuthenticationService.getSessions(providerId);
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
		const allowedMcpServers = accountQuery.mcpServers().getAllowedMcpServers();
		const serverIdToLabel = new Map<string, string>(this._mcpServerService.servers.get().map(s => [s.definition.id, s.definition.label]));
		const filteredMcpServers = allowedMcpServers
			// Filter out MCP servers that are not in the current list of servers
			.filter(server => serverIdToLabel.has(server.id))
			.map(server => {
				const usage = accountQuery.mcpServer(server.id).getUsage();
				return {
					...server,
					// Use the server name from the MCP service
					name: serverIdToLabel.get(server.id)!,
					lastUsed: usage.length > 0 ? Math.max(...usage.map(u => u.lastUsed)) : server.lastUsed
				};
			});

		if (!filteredMcpServers.length) {
			this._dialogService.info(localize('noTrustedMcpServers', "This account has not been used by any MCP servers."));
			return [];
		}

		const trustedServers = filteredMcpServers.filter(s => s.trusted);
		const otherServers = filteredMcpServers.filter(s => !s.trusted);
		const sortByLastUsed = (a: AllowedMcpServer, b: AllowedMcpServer) => (b.lastUsed || 0) - (a.lastUsed || 0);

		return [
			...otherServers.sort(sortByLastUsed).map(this._toQuickPickItem),
			{ type: 'separator', label: localize('trustedMcpServers', "Trusted by Microsoft") } satisfies IQuickPickSeparator,
			...trustedServers.sort(sortByLastUsed).map(this._toQuickPickItem)
		];
	}

	private _toQuickPickItem(mcpServer: AllowedMcpServer): TrustedMcpServersQuickPickItem {
		const lastUsed = mcpServer.lastUsed;
		const description = lastUsed
			? localize({ key: 'accountLastUsedDate', comment: ['The placeholder {0} is a string with time information, such as "3 days ago"'] }, "Last used this account {0}", fromNow(lastUsed, true))
			: localize('notUsed', "Has not used this account");
		let tooltip: string | undefined;
		let disabled: boolean | undefined;
		if (mcpServer.trusted) {
			tooltip = localize('trustedMcpServerTooltip', "This MCP server is trusted by Microsoft and\nalways has access to this account");
			disabled = true;
		}
		return {
			label: mcpServer.name,
			mcpServer,
			description,
			tooltip,
			disabled,
			buttons: [{
				tooltip: localize('accountPreferences', "Manage account preferences for this MCP server"),
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
			}],
			picked: mcpServer.allowed === undefined || mcpServer.allowed
		};
	}

	private _createQuickPick(accountQuery: IAccountQuery) {
		const disposableStore = new DisposableStore();
		const quickPick = disposableStore.add(this._quickInputService.createQuickPick<TrustedMcpServersQuickPickItem>({ useSeparators: true }));

		// Configure quick pick
		quickPick.canSelectMany = true;
		quickPick.customButton = true;
		quickPick.customLabel = localize('manageTrustedMcpServers.cancel', 'Cancel');
		quickPick.customButtonSecondary = true;
		quickPick.title = localize('manageTrustedMcpServers', "Manage Trusted MCP Servers");
		quickPick.placeholder = localize('manageMcpServers', "Choose which MCP servers can access this account");

		// Set up event handlers
		disposableStore.add(quickPick.onDidAccept(() => {
			quickPick.hide();
			const allServers = quickPick.items
				.filter((item: any): item is TrustedMcpServersQuickPickItem => item.type !== 'separator')
				.map((i: any) => i.mcpServer);

			const selectedServers = new Set(quickPick.selectedItems.map((i: any) => i.mcpServer));

			for (const mcpServer of allServers) {
				const isAllowed = selectedServers.has(mcpServer);
				accountQuery.mcpServer(mcpServer.id).setAccessAllowed(isAllowed, mcpServer.name);
			}
		}));
		disposableStore.add(quickPick.onDidHide(() => disposableStore.dispose()));
		disposableStore.add(quickPick.onDidCustom(() => quickPick.hide()));
		disposableStore.add(quickPick.onDidTriggerItemButton((e: any) =>
			this._commandService.executeCommand('_manageAccountPreferencesForMcpServer', e.item.mcpServer.id, accountQuery.providerId)
		));

		return quickPick;
	}

	//#endregion
}
