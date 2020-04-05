/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { ExtHostAuthenticationShape, ExtHostContext, IExtHostContext, MainContext, MainThreadAuthenticationShape } from '../common/extHost.protocol';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import Severity from 'vs/base/common/severity';
import { MenuRegistry, MenuId, IMenuItem } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

interface AuthDependent {
	providerId: string;
	label: string;
	scopes: string[];
	scopeDescriptions?: string;
}

const BUILT_IN_AUTH_DEPENDENTS: AuthDependent[] = [
	{
		providerId: 'microsoft',
		label: 'Settings sync',
		scopes: ['https://management.core.windows.net/.default', 'offline_access'],
		scopeDescriptions: 'Read user email'
	}
];

interface AllowedExtension {
	id: string;
	name: string;
}

function readAllowedExtensions(storageService: IStorageService, providerId: string, accountName: string): AllowedExtension[] {
	let trustedExtensions: AllowedExtension[] = [];
	try {
		const trustedExtensionSrc = storageService.get(`${providerId}-${accountName}`, StorageScope.GLOBAL);
		if (trustedExtensionSrc) {
			trustedExtensions = JSON.parse(trustedExtensionSrc);
		}
	} catch (err) { }

	return trustedExtensions;
}

export class MainThreadAuthenticationProvider extends Disposable {
	private _sessionMenuItems = new Map<string, IDisposable[]>();
	private _accounts = new Map<string, string[]>(); // Map account name to session ids
	private _sessions = new Map<string, string>(); // Map account id to name
	private _signInMenuItem: IMenuItem | undefined;

	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		public readonly displayName: string,
		public readonly dependents: AuthDependent[]
	) {
		super();

		this.registerCommandsAndContextMenuItems();
	}

	private manageTrustedExtensions(quickInputService: IQuickInputService, storageService: IStorageService, accountName: string) {
		const quickPick = quickInputService.createQuickPick<{ label: string, extension: AllowedExtension }>();
		quickPick.canSelectMany = true;
		const allowedExtensions = readAllowedExtensions(storageService, this.id, accountName);
		const items = allowedExtensions.map(extension => {
			return {
				label: extension.name,
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

		if (this.dependents.length) {
			this._register(CommandsRegistry.registerCommand({
				id: `signIn${this.id}`,
				handler: (accessor, args) => {
					this.login(this.dependents.reduce((previous: string[], current) => previous.concat(current.scopes), []));
				},
			}));

			this._signInMenuItem = {
				group: '2_providers',
				command: {
					id: `signIn${this.id}`,
					title: sessions.length
						? nls.localize('addAnotherAccount', "Sign in to another {0} account", this.displayName)
						: nls.localize('addAccount', "Sign in to {0}", this.displayName)
				},
				order: 3
			};

			this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, this._signInMenuItem));
		}

		sessions.forEach(session => this.registerSession(session));
	}

	private registerSession(session: modes.AuthenticationSession) {
		this._sessions.set(session.id, session.accountName);

		const existingSessionsForAccount = this._accounts.get(session.accountName);
		if (existingSessionsForAccount) {
			this._accounts.set(session.accountName, existingSessionsForAccount.concat(session.id));
			return;
		} else {
			this._accounts.set(session.accountName, [session.id]);
		}

		const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '1_accounts',
			command: {
				id: `configureSessions${session.id}`,
				title: session.accountName
			},
			order: 3
		});

		const manageCommand = CommandsRegistry.registerCommand({
			id: `configureSessions${session.id}`,
			handler: (accessor, args) => {
				const quickInputService = accessor.get(IQuickInputService);
				const storageService = accessor.get(IStorageService);

				const quickPick = quickInputService.createQuickPick();
				const manage = nls.localize('manageTrustedExtensions', "Manage Trusted Extensions");
				const signOut = nls.localize('signOut', "Sign Out");
				const items = ([{ label: manage }, { label: signOut }]);

				quickPick.items = items;

				quickPick.onDidAccept(e => {
					const selected = quickPick.selectedItems[0];
					if (selected.label === signOut) {
						const sessionsForAccount = this._accounts.get(session.accountName);
						sessionsForAccount?.forEach(sessionId => this.logout(sessionId));
					}

					if (selected.label === manage) {
						this.manageTrustedExtensions(quickInputService, storageService, session.accountName);
					}

					quickPick.dispose();
				});

				quickPick.onDidHide(_ => {
					quickPick.dispose();
				});

				quickPick.show();
			},
		});

		this._sessionMenuItems.set(session.accountName, [menuItem, manageCommand]);
	}

	async getSessions(): Promise<ReadonlyArray<modes.AuthenticationSession>> {
		return (await this._proxy.$getSessions(this.id)).map(session => {
			return {
				id: session.id,
				accountName: session.accountName,
				getAccessToken: () => this._proxy.$getSessionAccessToken(this.id, session.id)
			};
		});
	}

	async updateSessionItems(event: modes.AuthenticationSessionsChangeEvent): Promise<void> {
		const { added, removed } = event;
		const session = await this._proxy.$getSessions(this.id);
		const addedSessions = session.filter(session => added.some(id => id === session.id));

		removed.forEach(sessionId => {
			const accountName = this._sessions.get(sessionId);
			if (accountName) {
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

					if (this._signInMenuItem) {
						this._signInMenuItem.command.title = nls.localize('addAccount', "Sign in to {0}", this.displayName);
					}
				}
			}
		});

		addedSessions.forEach(session => this.registerSession(session));

		if (addedSessions.length && this._signInMenuItem) {
			this._signInMenuItem.command.title = nls.localize('addAnotherAccount', "Sign in to another {0} account", this.displayName);
		}
	}

	login(scopes: string[]): Promise<modes.AuthenticationSession> {
		return this._proxy.$login(this.id, scopes).then(session => {
			return {
				id: session.id,
				accountName: session.accountName,
				getAccessToken: () => this._proxy.$getSessionAccessToken(this.id, session.id)
			};
		});
	}

	logout(sessionId: string): Promise<void> {
		return this._proxy.$logout(this.id, sessionId);
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
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);
	}

	async $registerAuthenticationProvider(id: string, displayName: string): Promise<void> {
		const dependentBuiltIns = BUILT_IN_AUTH_DEPENDENTS.filter(dependency => dependency.providerId === id);

		const provider = new MainThreadAuthenticationProvider(this._proxy, id, displayName, dependentBuiltIns);
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	$unregisterAuthenticationProvider(id: string): void {
		this.authenticationService.unregisterAuthenticationProvider(id);
	}

	$onDidChangeSessions(id: string, event: modes.AuthenticationSessionsChangeEvent): void {
		this.authenticationService.sessionsUpdate(id, event);
	}

	async $getSessionsPrompt(providerId: string, accountName: string, providerName: string, extensionId: string, extensionName: string): Promise<boolean> {
		const allowList = readAllowedExtensions(this.storageService, providerId, accountName);
		const extensionData = allowList.find(extension => extension.id === extensionId);
		if (extensionData) {
			return true;
		}

		const { choice } = await this.dialogService.show(
			Severity.Info,
			nls.localize('confirmAuthenticationAccess', "The extension '{0}' is trying to access authentication information for the {1} account '{2}'.", extensionName, providerName, accountName),
			[nls.localize('cancel', "Cancel"), nls.localize('allow', "Allow")],
			{
				cancelId: 0
			}
		);

		const allow = choice === 1;
		if (allow) {
			allowList.push({ id: extensionId, name: extensionName });
			this.storageService.store(`${providerId}-${accountName}`, JSON.stringify(allowList), StorageScope.GLOBAL);
		}

		return allow;
	}

	async $loginPrompt(providerName: string, extensionName: string): Promise<boolean> {
		const { choice } = await this.dialogService.show(
			Severity.Info,
			nls.localize('confirmLogin', "The extension '{0}' wants to sign in using {1}.", extensionName, providerName),
			[nls.localize('cancel', "Cancel"), nls.localize('allow', "Allow")],
			{
				cancelId: 0
			}
		);

		return choice === 1;
	}
}
