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
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
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

export class MainThreadAuthenticationProvider extends Disposable {
	private _sessionMenuItems = new Map<string, IDisposable[]>();
	private _sessionIds: string[] = [];

	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		public readonly displayName: string,
		public readonly dependents: AuthDependent[]
	) {
		super();

		if (!dependents.length) {
			return;
		}

		this.registerCommandsAndContextMenuItems();
	}

	private setPermissionsForAccount(quickInputService: IQuickInputService, doLogin?: boolean) {
		const quickPick = quickInputService.createQuickPick();
		quickPick.canSelectMany = true;
		const items = this.dependents.map(dependent => {
			return {
				label: dependent.label,
				description: dependent.scopeDescriptions,
				picked: true,
				scopes: dependent.scopes
			};
		});

		quickPick.items = items;
		// TODO read from storage and filter is not doLogin
		quickPick.selectedItems = items;
		quickPick.title = nls.localize('signInTo', "Sign in to {0}", this.displayName);
		quickPick.placeholder = nls.localize('accountPermissions', "Choose what features and extensions to authorize to use this account");

		quickPick.onDidAccept(() => {
			const scopes = quickPick.selectedItems.reduce((previous, current) => previous.concat((current as any).scopes), []);
			if (scopes.length && doLogin) {
				this.login(scopes);
			}

			quickPick.dispose();
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		quickPick.show();
	}

	private registerCommandsAndContextMenuItems(): void {
		this._register(CommandsRegistry.registerCommand({
			id: `signIn${this.id}`,
			handler: (accessor, args) => {
				this.setPermissionsForAccount(accessor.get(IQuickInputService), true);
			},
		}));

		this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '2_providers',
			command: {
				id: `signIn${this.id}`,
				title: nls.localize('addAccount', "Sign in to {0}", this.displayName)
			},
			order: 3
		}));

		this._proxy.$getSessions(this.id).then(sessions => {
			sessions.forEach(session => this.registerSession(session));
		});
	}

	private registerSession(session: modes.AuthenticationSession) {
		this._sessionIds.push(session.id);
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

				const quickPick = quickInputService.createQuickPick();
				const items = [{ label: 'Sign Out' }];

				quickPick.items = items;

				quickPick.onDidAccept(e => {
					const selected = quickPick.selectedItems[0];
					if (selected.label === 'Sign Out') {
						this.logout(session.id);
					}

					quickPick.dispose();
				});

				quickPick.onDidHide(_ => {
					quickPick.dispose();
				});

				quickPick.show();
			},
		});

		this._sessionMenuItems.set(session.id, [menuItem, manageCommand]);
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

	async updateSessionItems(): Promise<void> {
		const currentSessions = await this._proxy.$getSessions(this.id);
		const removedSessionIds = this._sessionIds.filter(id => !currentSessions.some(session => session.id === id));
		const addedSessions = currentSessions.filter(session => !this._sessionIds.some(id => id === session.id));

		removedSessionIds.forEach(id => {
			const disposeables = this._sessionMenuItems.get(id);
			if (disposeables) {
				disposeables.forEach(disposeable => disposeable.dispose());
				this._sessionMenuItems.delete(id);
			}
		});

		addedSessions.forEach(session => this.registerSession(session));

		this._sessionIds = currentSessions.map(session => session.id);
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

	async $getSessionsPrompt(providerId: string, providerName: string, extensionId: string, extensionName: string): Promise<boolean> {
		const alwaysAllow = this.storageService.get(`${extensionId}-${providerId}`, StorageScope.GLOBAL);
		if (alwaysAllow) {
			return alwaysAllow === 'true';
		}

		const { choice, checkboxChecked } = await this.dialogService.show(
			Severity.Info,
			nls.localize('confirmAuthenticationAccess', "The extension '{0}' is trying to access authentication information from {1}.", extensionName, providerName),
			[nls.localize('cancel', "Cancel"), nls.localize('allow', "Allow")],
			{
				cancelId: 0,
				checkbox: {
					label: nls.localize('neverAgain', "Don't Show Again")
				}
			}
		);

		const allow = choice === 1;
		if (checkboxChecked) {
			this.storageService.store(`${extensionId}-${providerId}`, allow ? 'true' : 'false', StorageScope.GLOBAL);
		}

		return allow;
	}

	async $loginPrompt(providerId: string, providerName: string, extensionId: string, extensionName: string): Promise<boolean> {
		const alwaysAllow = this.storageService.get(`${extensionId}-${providerId}`, StorageScope.GLOBAL);
		if (alwaysAllow) {
			return alwaysAllow === 'true';
		}

		const { choice, checkboxChecked } = await this.dialogService.show(
			Severity.Info,
			nls.localize('confirmLogin', "The extension '{0}' wants to sign in using {1}.", extensionName, providerName),
			[nls.localize('cancel', "Cancel"), nls.localize('continue', "Continue")],
			{
				cancelId: 0,
				checkbox: {
					label: nls.localize('neverAgain', "Don't Show Again")
				}
			}
		);

		const allow = choice === 1;
		if (checkboxChecked) {
			this.storageService.store(`${extensionId}-${providerId}`, allow ? 'true' : 'false', StorageScope.GLOBAL);
		}

		return allow;
	}
}
