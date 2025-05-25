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
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { AllowedMcpServer, IAuthenticationMcpAccessService } from '../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpUsageService } from '../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';

export class ManageTrustedMcpServersForAccountAction extends Action2 {
	constructor() {
		super({
			id: '_manageTrustedMCPServersForAccount',
			title: localize2('manageTrustedMcpServersForAccount', "Manage Trusted MCP Servers For Account"),
			category: localize2('accounts', "Accounts"),
			f1: true
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
		@IProductService private readonly _productService: IProductService,
		@IMcpService private readonly _mcpServerService: IMcpService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAuthenticationService private readonly _mcpServerAuthenticationService: IAuthenticationService,
		@IAuthenticationMcpUsageService private readonly _mcpServerAuthenticationUsageService: IAuthenticationMcpUsageService,
		@IAuthenticationMcpAccessService private readonly _mcpServerAuthenticationAccessService: IAuthenticationMcpAccessService,
		@ICommandService private readonly _commandService: ICommandService
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
		picker.selectedItems = items.filter((i): i is TrustedMcpServersQuickPickItem => i.type !== 'separator' && !!i.picked);
		picker.show();
	}

	private async _resolveProviderAndAccountLabel(providerId: string | undefined, accountLabel: string | undefined) {
		if (!providerId || !accountLabel) {
			const accounts = new Array<{ providerId: string; providerLabel: string; accountLabel: string }>();
			for (const id of this._mcpServerAuthenticationService.getProviderIds()) {
				const providerLabel = this._mcpServerAuthenticationService.getProvider(id).label;
				const sessions = await this._mcpServerAuthenticationService.getSessions(id);
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
					placeHolder: localize('pickAccount', "Pick an account to manage trusted MCP servers for"),
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
		let allowedMcpServers = this._mcpServerAuthenticationAccessService.readAllowedMcpServers(providerId, accountLabel);
		// only include MCP servers that are installed
		// TODO: improve?
		const resolvedMcpServers = await Promise.all(allowedMcpServers.map(server => this._mcpServerService.servers.get().find(s => s.definition.id === server.id)));
		allowedMcpServers = resolvedMcpServers
			.map((server, i) => server ? allowedMcpServers[i] : undefined)
			.filter(server => !!server);
		const trustedMcpServerAuthAccess = this._productService.trustedMcpAuthAccess;
		const trustedMcpServerIds =
			// Case 1: trustedMcpServerAuthAccess is an array
			Array.isArray(trustedMcpServerAuthAccess)
				? trustedMcpServerAuthAccess
				// Case 2: trustedMcpServerAuthAccess is an object
				: typeof trustedMcpServerAuthAccess === 'object'
					? trustedMcpServerAuthAccess[providerId] ?? []
					: [];
		for (const mcpServerId of trustedMcpServerIds) {
			const allowedMcpServer = allowedMcpServers.find(server => server.id === mcpServerId);
			if (!allowedMcpServer) {
				// Add the MCP server to the allowedMcpServers list
				// TODO: improve?
				const mcpServer = this._mcpServerService.servers.get().find(s => s.definition.id === mcpServerId);
				if (mcpServer) {
					allowedMcpServers.push({
						id: mcpServerId,
						name: mcpServer.definition.label,
						allowed: true,
						trusted: true
					});
				}
			} else {
				// Update the MCP server to be allowed
				allowedMcpServer.allowed = true;
				allowedMcpServer.trusted = true;
			}
		}

		if (!allowedMcpServers.length) {
			this._dialogService.info(localize('noTrustedMcpServers', "This account has not been used by any MCP servers."));
			return [];
		}

		const usages = this._mcpServerAuthenticationUsageService.readAccountUsages(providerId, accountLabel);
		const trustedMcpServers = [];
		const otherMcpServers = [];
		for (const mcpServer of allowedMcpServers) {
			const usage = usages.find(usage => mcpServer.id === usage.mcpServerId);
			mcpServer.lastUsed = usage?.lastUsed;
			if (mcpServer.trusted) {
				trustedMcpServers.push(mcpServer);
			} else {
				otherMcpServers.push(mcpServer);
			}
		}

		const sortByLastUsed = (a: AllowedMcpServer, b: AllowedMcpServer) => (b.lastUsed || 0) - (a.lastUsed || 0);

		const items = [
			...otherMcpServers.sort(sortByLastUsed).map(this._toQuickPickItem),
			{ type: 'separator', label: localize('trustedMcpServers', "Trusted by Microsoft") } satisfies IQuickPickSeparator,
			...trustedMcpServers.sort(sortByLastUsed).map(this._toQuickPickItem)
		];

		return items;
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

	private _createQuickPick(disposableStore: DisposableStore, providerId: string, accountLabel: string) {
		const quickPick = disposableStore.add(this._quickInputService.createQuickPick<TrustedMcpServersQuickPickItem>({ useSeparators: true }));
		quickPick.canSelectMany = true;
		quickPick.customButton = true;
		quickPick.customLabel = localize('manageTrustedMcpServers.cancel', 'Cancel');

		quickPick.title = localize('manageTrustedMcpServers', "Manage Trusted MCP Servers");
		quickPick.placeholder = localize('manageMcpServers', "Choose which MCP servers can access this account");

		disposableStore.add(quickPick.onDidAccept(() => {
			const updatedAllowedList = quickPick.items
				.filter((item): item is TrustedMcpServersQuickPickItem => item.type !== 'separator')
				.map(i => i.mcpServer);

			const allowedMcpServersSet = new Set(quickPick.selectedItems.map(i => i.mcpServer));
			updatedAllowedList.forEach(mcpServer => {
				mcpServer.allowed = allowedMcpServersSet.has(mcpServer);
			});
			this._mcpServerAuthenticationAccessService.updateAllowedMcpServers(providerId, accountLabel, updatedAllowedList);
			quickPick.hide();
		}));

		disposableStore.add(quickPick.onDidHide(() => {
			disposableStore.dispose();
		}));

		disposableStore.add(quickPick.onDidCustom(() => {
			quickPick.hide();
		}));
		disposableStore.add(quickPick.onDidTriggerItemButton(e =>
			this._commandService.executeCommand('_manageAccountPreferencesForMcpServer', e.item.mcpServer.id, providerId)
		));
		return quickPick;
	}
}
