/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IAuthenticationService, AllowedExtension, readAllowedExtensions, getAuthenticationProviderActivationEvent, addAccountUsage, readAccountUsages, removeAccountUsage } from 'vs/workbench/services/authentication/browser/authenticationService';
import { ExtHostAuthenticationShape, ExtHostContext, IExtHostContext, MainContext, MainThreadAuthenticationShape } from '../common/extHost.protocol';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import Severity from 'vs/base/common/severity';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { fromNow } from 'vs/base/common/date';
import { ActivationKind, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class MainThreadAuthenticationProvider extends Disposable {
	private _accounts = new Map<string, string[]>(); // Map account name to session ids
	private _sessions = new Map<string, string>(); // Map account id to name

	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		public readonly label: string,
		public readonly supportsMultipleAccounts: boolean,
		private readonly notificationService: INotificationService,
		private readonly storageService: IStorageService,
		private readonly quickInputService: IQuickInputService,
		private readonly dialogService: IDialogService
	) {
		super();
	}

	public async initialize(): Promise<void> {
		return this.registerCommandsAndContextMenuItems();
	}

	public hasSessions(): boolean {
		return !!this._sessions.size;
	}

	public manageTrustedExtensions(accountName: string) {
		const allowedExtensions = readAllowedExtensions(this.storageService, this.id, accountName);

		if (!allowedExtensions.length) {
			this.dialogService.show(Severity.Info, nls.localize('noTrustedExtensions', "This account has not been used by any extensions."), []);
			return;
		}

		const quickPick = this.quickInputService.createQuickPick<{ label: string, description: string, extension: AllowedExtension }>();
		quickPick.canSelectMany = true;
		const usages = readAccountUsages(this.storageService, this.id, accountName);
		const items = allowedExtensions.map(extension => {
			const usage = usages.find(usage => extension.id === usage.extensionId);
			return {
				label: extension.name,
				description: usage
					? nls.localize({ key: 'accountLastUsedDate', comment: ['The placeholder {0} is a string with time information, such as "3 days ago"'] }, "Last used this account {0}", fromNow(usage.lastUsed, true))
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
			this.storageService.store(`${this.id}-${accountName}`, JSON.stringify(updatedAllowedList), StorageScope.GLOBAL, StorageTarget.USER);

			quickPick.dispose();
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		quickPick.show();
	}

	private async registerCommandsAndContextMenuItems(): Promise<void> {
		try {
			const sessions = await this._proxy.$getSessions(this.id);
			sessions.forEach(session => this.registerSession(session));
		} catch (_) {
			// Ignore
		}
	}

	private registerSession(session: modes.AuthenticationSession) {
		this._sessions.set(session.id, session.account.label);

		const existingSessionsForAccount = this._accounts.get(session.account.label);
		if (existingSessionsForAccount) {
			this._accounts.set(session.account.label, existingSessionsForAccount.concat(session.id));
			return;
		} else {
			this._accounts.set(session.account.label, [session.id]);
		}
	}

	async signOut(accountName: string): Promise<void> {
		const accountUsages = readAccountUsages(this.storageService, this.id, accountName);
		const sessionsForAccount = this._accounts.get(accountName);

		const result = await this.dialogService.confirm({
			title: nls.localize('signOutConfirm', "Sign out of {0}", accountName),
			message: accountUsages.length
				? nls.localize('signOutMessagve', "The account {0} has been used by: \n\n{1}\n\n Sign out of these features?", accountName, accountUsages.map(usage => usage.extensionName).join('\n'))
				: nls.localize('signOutMessageSimple', "Sign out of {0}?", accountName)
		});

		if (result.confirmed) {
			sessionsForAccount?.forEach(sessionId => this.logout(sessionId));
			removeAccountUsage(this.storageService, this.id, accountName);
			this.storageService.remove(`${this.id}-${accountName}`, StorageScope.GLOBAL);
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
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);

		this._register(this.authenticationService.onDidChangeSessions(e => {
			this._proxy.$onDidChangeAuthenticationSessions(e.providerId, e.label, e.event);
		}));

		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(info => {
			this._proxy.$onDidChangeAuthenticationProviders([info], []);
		}));

		this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(info => {
			this._proxy.$onDidChangeAuthenticationProviders([], [info]);
		}));

		this._proxy.$setProviders(this.authenticationService.declaredProviders);

		this._register(this.authenticationService.onDidChangeDeclaredProviders(e => {
			this._proxy.$setProviders(e);
		}));
	}

	async $registerAuthenticationProvider(id: string, label: string, supportsMultipleAccounts: boolean): Promise<void> {
		const provider = new MainThreadAuthenticationProvider(this._proxy, id, label, supportsMultipleAccounts, this.notificationService, this.storageService, this.quickInputService, this.dialogService);
		await provider.initialize();
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	$unregisterAuthenticationProvider(id: string): void {
		this.authenticationService.unregisterAuthenticationProvider(id);
	}

	$ensureProvider(id: string): Promise<void> {
		return this.extensionService.activateByEvent(getAuthenticationProviderActivationEvent(id), ActivationKind.Immediate);
	}

	$sendDidChangeSessions(id: string, event: modes.AuthenticationSessionsChangeEvent): void {
		this.authenticationService.sessionsUpdate(id, event);
	}

	$logout(providerId: string, sessionId: string): Promise<void> {
		return this.authenticationService.logout(providerId, sessionId);
	}

	private isAccessAllowed(providerId: string, accountName: string, extensionId: string): boolean {
		const allowList = readAllowedExtensions(this.storageService, providerId, accountName);
		const extensionData = allowList.find(extension => extension.id === extensionId);
		return !!extensionData;
	}

	private async loginPrompt(providerName: string, extensionName: string): Promise<boolean> {
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

	private async setTrustedExtensionAndAccountPreference(providerId: string, accountName: string, extensionId: string, extensionName: string, sessionId: string): Promise<void> {
		const allowList = readAllowedExtensions(this.storageService, providerId, accountName);
		if (!allowList.find(allowed => allowed.id === extensionId)) {
			allowList.push({ id: extensionId, name: extensionName });
			this.storageService.store(`${providerId}-${accountName}`, JSON.stringify(allowList), StorageScope.GLOBAL, StorageTarget.USER);
		}

		this.storageService.store(`${extensionName}-${providerId}`, sessionId, StorageScope.GLOBAL, StorageTarget.MACHINE);

	}

	private async selectSession(providerId: string, extensionId: string, extensionName: string, potentialSessions: modes.AuthenticationSession[], clearSessionPreference: boolean): Promise<modes.AuthenticationSession> {
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
					const allowed = await this.authenticationService.showGetSessionPrompt(providerId, matchingSession.account.label, extensionId, extensionName);
					if (allowed) {
						return matchingSession;
					}
				}
			}
		}

		return this.authenticationService.selectSession(providerId, extensionId, extensionName, potentialSessions);
	}

	async $getSession(providerId: string, scopes: string[], extensionId: string, extensionName: string, options: { createIfNone: boolean, clearSessionPreference: boolean }): Promise<modes.AuthenticationSession | undefined> {
		const orderedScopes = scopes.sort().join(' ');
		const sessions = (await this.authenticationService.getSessions(providerId)).filter(session => session.scopes.slice().sort().join(' ') === orderedScopes);

		const silent = !options.createIfNone;
		let session: modes.AuthenticationSession | undefined;
		if (sessions.length) {
			if (!this.authenticationService.supportsMultipleAccounts(providerId)) {
				session = sessions[0];
				const allowed = this.isAccessAllowed(providerId, session.account.label, extensionId);
				if (!allowed) {
					if (!silent) {
						const didAcceptPrompt = await this.authenticationService.showGetSessionPrompt(providerId, session.account.label, extensionId, extensionName);
						if (!didAcceptPrompt) {
							throw new Error('User did not consent to login.');
						}
					} else {
						this.authenticationService.requestSessionAccess(providerId, extensionId, extensionName, [session]);
					}
				}
			} else {
				if (!silent) {
					session = await this.selectSession(providerId, extensionId, extensionName, sessions, !!options.clearSessionPreference);
				} else {
					this.authenticationService.requestSessionAccess(providerId, extensionId, extensionName, sessions);
				}
			}
		} else {
			if (!silent) {
				const isAllowed = await this.loginPrompt(providerId, extensionName);
				if (!isAllowed) {
					throw new Error('User did not consent to login.');
				}

				session = await this.authenticationService.login(providerId, scopes);
				await this.setTrustedExtensionAndAccountPreference(providerId, session.account.label, extensionId, extensionName, session.id);
			} else {
				await this.authenticationService.requestNewSession(providerId, scopes, extensionId, extensionName);
			}
		}

		if (session) {
			addAccountUsage(this.storageService, providerId, session.account.label, extensionId, extensionName);
		}

		return session;
	}
}
