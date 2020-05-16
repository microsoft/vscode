/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IAuthenticationService, AllowedExtension, readAllowedExtensions } from 'vs/workbench/services/authentication/browser/authenticationService';
import { ExtHostAuthenticationShape, ExtHostContext, IExtHostContext, MainContext, MainThreadAuthenticationShape } from '../common/extHost.protocol';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import Severity from 'vs/base/common/severity';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { fromNow } from 'vs/base/common/date';

const VSO_ALLOWED_EXTENSIONS = ['github.vscode-pull-request-github', 'github.vscode-pull-request-github-insiders', 'vscode.git'];

interface IAccountUsage {
	extensionId: string;
	extensionName: string;
	lastUsed: number;
}

function readAccountUsages(storageService: IStorageService, providerId: string, accountName: string,): IAccountUsage[] {
	const accountKey = `${providerId}-${accountName}-usages`;
	const storedUsages = storageService.get(accountKey, StorageScope.GLOBAL);
	let usages: IAccountUsage[] = [];
	if (storedUsages) {
		try {
			usages = JSON.parse(storedUsages);
		} catch (e) {
			// ignore
		}
	}

	return usages;
}

function addAccountUsage(storageService: IStorageService, providerId: string, accountName: string, extensionId: string, extensionName: string) {
	const accountKey = `${providerId}-${accountName}-usages`;
	const usages = readAccountUsages(storageService, providerId, accountName);

	const existingUsageIndex = usages.findIndex(usage => usage.extensionId === extensionId);
	if (existingUsageIndex > -1) {
		usages.splice(existingUsageIndex, 1, {
			extensionId,
			extensionName,
			lastUsed: Date.now()
		});
	} else {
		usages.push({
			extensionId,
			extensionName,
			lastUsed: Date.now()
		});
	}

	storageService.store(accountKey, JSON.stringify(usages), StorageScope.GLOBAL);
}

export class MainThreadAuthenticationProvider extends Disposable {
	private _sessionMenuItems = new Map<string, IDisposable[]>();
	private _accounts = new Map<string, string[]>(); // Map account name to session ids
	private _sessions = new Map<string, string>(); // Map account id to name

	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		public readonly displayName: string,
		private readonly notificationService: INotificationService,
		private readonly storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
		private readonly storageService: IStorageService
	) {
		super();
	}

	public async initialize(): Promise<void> {
		return this.registerCommandsAndContextMenuItems();
	}

	public hasSessions(): boolean {
		return !!this._sessions.size;
	}

	private manageTrustedExtensions(quickInputService: IQuickInputService, storageService: IStorageService, accountName: string) {
		const quickPick = quickInputService.createQuickPick<{ label: string, description: string, extension: AllowedExtension }>();
		quickPick.canSelectMany = true;
		const allowedExtensions = readAllowedExtensions(storageService, this.id, accountName);
		const usages = readAccountUsages(storageService, this.id, accountName);
		const items = allowedExtensions.map(extension => {
			const usage = usages.find(usage => extension.id === usage.extensionId);
			return {
				label: extension.name,
				description: usage
					? nls.localize('accountLastUsedDate', "Last used this account {0}", fromNow(usage.lastUsed, true))
					: nls.localize('notUsed', "Has not used this account"),
				extension
			};
		});

		quickPick.items = items;
		quickPick.selectedItems = items;
		quickPick.title = nls.localize('manageTrustedExtensions', "Manage Trusted Extensions");
		quickPick.placeholder = nls.localize('manageExensions', "Choose which extensions can access this account");

		quickPick.onDidAccept(() => {
			const updatedAllowedList = quickPick.selectedItems.map(item => item.extension);
			storageService.store(`${this.id}-${accountName}`, JSON.stringify(updatedAllowedList), StorageScope.GLOBAL);

			quickPick.dispose();
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		quickPick.show();
	}

	private async registerCommandsAndContextMenuItems(): Promise<void> {
		const sessions = await this._proxy.$getSessions(this.id);
		sessions.forEach(session => this.registerSession(session));
	}

	private registerSession(session: modes.AuthenticationSession) {
		this._sessions.set(session.id, session.account.displayName);

		const existingSessionsForAccount = this._accounts.get(session.account.displayName);
		if (existingSessionsForAccount) {
			this._accounts.set(session.account.displayName, existingSessionsForAccount.concat(session.id));
			return;
		} else {
			this._accounts.set(session.account.displayName, [session.id]);
		}

		const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '1_accounts',
			command: {
				id: `configureSessions${session.id}`,
				title: `${session.account.displayName} (${this.displayName})`
			},
			order: 3
		});

		this.storageKeysSyncRegistryService.registerStorageKey({ key: `${this.id}-${session.account.displayName}`, version: 1 });

		const manageCommand = CommandsRegistry.registerCommand({
			id: `configureSessions${session.id}`,
			handler: (accessor, args) => {
				const quickInputService = accessor.get(IQuickInputService);
				const storageService = accessor.get(IStorageService);
				const dialogService = accessor.get(IDialogService);

				const quickPick = quickInputService.createQuickPick();
				const manage = nls.localize('manageTrustedExtensions', "Manage Trusted Extensions");
				const signOut = nls.localize('signOut', "Sign Out");
				const items = ([{ label: manage }, { label: signOut }]);

				quickPick.items = items;

				quickPick.onDidAccept(e => {
					const selected = quickPick.selectedItems[0];
					if (selected.label === signOut) {
						this.signOut(dialogService, session);
					}

					if (selected.label === manage) {
						this.manageTrustedExtensions(quickInputService, storageService, session.account.displayName);
					}

					quickPick.dispose();
				});

				quickPick.onDidHide(_ => {
					quickPick.dispose();
				});

				quickPick.show();
			},
		});

		this._sessionMenuItems.set(session.account.displayName, [menuItem, manageCommand]);
	}

	async signOut(dialogService: IDialogService, session: modes.AuthenticationSession): Promise<void> {
		const accountUsages = readAccountUsages(this.storageService, this.id, session.account.displayName);
		const sessionsForAccount = this._accounts.get(session.account.displayName);

		const result = await dialogService.confirm({
			title: nls.localize('signOutConfirm', "Sign out of {0}", session.account.displayName),
			message: accountUsages.length
				? nls.localize('signOutMessage', "The account {0} has been used by: \n\n{1}\n\n Sign out of these features?", session.account.displayName, accountUsages.map(usage => usage.extensionName).join('\n'))
				: ''
		});

		if (result.confirmed) {
			sessionsForAccount?.forEach(sessionId => this.logout(sessionId));
		}
	}

	async getSessions(): Promise<ReadonlyArray<modes.AuthenticationSession>> {
		return this._proxy.$getSessions(this.id);
	}

	async updateSessionItems(event: modes.AuthenticationSessionsChangeEvent): Promise<void> {
		const { added, removed } = event;
		const session = await this._proxy.$getSessions(this.id);
		const addedSessions = session.filter(session => added.some(id => id === session.id));

		removed.forEach(sessionId => {
			const accountName = this._sessions.get(sessionId);
			if (accountName) {
				this._sessions.delete(sessionId);
				let sessionsForAccount = this._accounts.get(accountName) || [];
				const sessionIndex = sessionsForAccount.indexOf(sessionId);
				sessionsForAccount.splice(sessionIndex);

				if (!sessionsForAccount.length) {
					const disposeables = this._sessionMenuItems.get(accountName);
					if (disposeables) {
						disposeables.forEach(disposeable => disposeable.dispose());
						this._sessionMenuItems.delete(accountName);
					}
					this._accounts.delete(accountName);
				}
			}
		});

		addedSessions.forEach(session => this.registerSession(session));
	}

	login(scopes: string[]): Promise<modes.AuthenticationSession> {
		return this._proxy.$login(this.id, scopes);
	}

	async logout(sessionId: string): Promise<void> {
		await this._proxy.$logout(this.id, sessionId);
		this.notificationService.info(nls.localize('signedOut', "Successfully signed out."));
	}

	dispose(): void {
		super.dispose();
		this._sessionMenuItems.forEach(item => item.forEach(d => d.dispose()));
		this._sessionMenuItems.clear();
	}
}

@extHostNamedCustomer(MainContext.MainThreadAuthentication)
export class MainThreadAuthentication extends Disposable implements MainThreadAuthenticationShape {
	private readonly _proxy: ExtHostAuthenticationShape;

	constructor(
		extHostContext: IExtHostContext,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageKeysSyncRegistryService private readonly storageKeysSyncRegistryService: IStorageKeysSyncRegistryService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);
	}

	async $registerAuthenticationProvider(id: string, displayName: string): Promise<void> {
		const provider = new MainThreadAuthenticationProvider(this._proxy, id, displayName, this.notificationService, this.storageKeysSyncRegistryService, this.storageService);
		await provider.initialize();
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	$unregisterAuthenticationProvider(id: string): void {
		this.authenticationService.unregisterAuthenticationProvider(id);
	}

	$onDidChangeSessions(id: string, event: modes.AuthenticationSessionsChangeEvent): void {
		this.authenticationService.sessionsUpdate(id, event);
	}

	async $requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): Promise<void> {
		return this.authenticationService.requestNewSession(providerId, scopes, extensionId, extensionName);
	}

	async $getSession(providerId: string, providerName: string, extensionId: string, extensionName: string, potentialSessions: modes.AuthenticationSession[], scopes: string[], clearSessionPreference: boolean): Promise<modes.AuthenticationSession> {
		if (!potentialSessions.length) {
			throw new Error('No potential sessions found');
		}

		if (clearSessionPreference) {
			this.storageService.remove(`${extensionName}-${providerId}`, StorageScope.GLOBAL);
		} else {
			const existingSessionPreference = this.storageService.get(`${extensionName}-${providerId}`, StorageScope.GLOBAL);
			if (existingSessionPreference) {
				const matchingSession = potentialSessions.find(session => session.id === existingSessionPreference);
				if (matchingSession) {
					const allowed = await this.$getSessionsPrompt(providerId, matchingSession.account.displayName, providerName, extensionId, extensionName);
					if (allowed) {
						return matchingSession;
					}
				}
			}
		}

		return new Promise((resolve, reject) => {
			const quickPick = this.quickInputService.createQuickPick<{ label: string, session?: modes.AuthenticationSession }>();
			quickPick.ignoreFocusOut = true;
			const items: { label: string, session?: modes.AuthenticationSession }[] = potentialSessions.map(session => {
				return {
					label: session.account.displayName,
					session
				};
			});

			items.push({
				label: nls.localize('useOtherAccount', "Sign in to another account")
			});

			quickPick.items = items;
			quickPick.title = nls.localize('selectAccount', "The extension '{0}' wants to access a {1} account", extensionName, providerName);
			quickPick.placeholder = nls.localize('getSessionPlateholder', "Select an account for '{0}' to use or Esc to cancel", extensionName);

			quickPick.onDidAccept(async _ => {
				const selected = quickPick.selectedItems[0];

				const session = selected.session ?? await this.authenticationService.login(providerId, scopes);

				const accountName = session.account.displayName;

				const allowList = readAllowedExtensions(this.storageService, providerId, accountName);
				if (!allowList.find(allowed => allowed.id === extensionId)) {
					allowList.push({ id: extensionId, name: extensionName });
					this.storageService.store(`${providerId}-${accountName}`, JSON.stringify(allowList), StorageScope.GLOBAL);
				}

				this.storageService.store(`${extensionName}-${providerId}`, session.id, StorageScope.GLOBAL);

				quickPick.dispose();
				resolve(session);
			});

			quickPick.onDidHide(_ => {
				if (!quickPick.selectedItems[0]) {
					reject('User did not consent to account access');
				}

				quickPick.dispose();
			});

			quickPick.show();
		});
	}

	async $getSessionsPrompt(providerId: string, accountName: string, providerName: string, extensionId: string, extensionName: string): Promise<boolean> {
		const allowList = readAllowedExtensions(this.storageService, providerId, accountName);
		const extensionData = allowList.find(extension => extension.id === extensionId);
		if (extensionData) {
			addAccountUsage(this.storageService, providerId, accountName, extensionId, extensionName);
			return true;
		}

		const remoteConnection = this.remoteAgentService.getConnection();
		if (remoteConnection && remoteConnection.remoteAuthority && remoteConnection.remoteAuthority.startsWith('vsonline') && VSO_ALLOWED_EXTENSIONS.includes(extensionId)) {
			addAccountUsage(this.storageService, providerId, accountName, extensionId, extensionName);
			return true;
		}

		const { choice } = await this.dialogService.show(
			Severity.Info,
			nls.localize('confirmAuthenticationAccess', "The extension '{0}' wants to access the {1} account '{2}'.", extensionName, providerName, accountName),
			[nls.localize('allow', "Allow"), nls.localize('cancel', "Cancel")],
			{
				cancelId: 1
			}
		);

		const allow = choice === 0;
		if (allow) {
			addAccountUsage(this.storageService, providerId, accountName, extensionId, extensionName);
			allowList.push({ id: extensionId, name: extensionName });
			this.storageService.store(`${providerId}-${accountName}`, JSON.stringify(allowList), StorageScope.GLOBAL);
		}

		return allow;
	}

	async $loginPrompt(providerName: string, extensionName: string): Promise<boolean> {
		const { choice } = await this.dialogService.show(
			Severity.Info,
			nls.localize('confirmLogin', "The extension '{0}' wants to sign in using {1}.", extensionName, providerName),
			[nls.localize('allow', "Allow"), nls.localize('cancel', "Cancel")],
			{
				cancelId: 1
			}
		);

		return choice === 0;
	}

	async $setTrustedExtension(providerId: string, accountName: string, extensionId: string, extensionName: string): Promise<void> {
		const allowList = readAllowedExtensions(this.storageService, providerId, accountName);
		if (!allowList.find(allowed => allowed.id === extensionId)) {
			allowList.push({ id: extensionId, name: extensionName });
			this.storageService.store(`${providerId}-${accountName}`, JSON.stringify(allowList), StorageScope.GLOBAL);
		}
	}
}
