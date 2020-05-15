/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { AuthenticationSession, AuthenticationSessionsChangeEvent } from 'vs/editor/common/modes';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { MainThreadAuthenticationProvider } from 'vs/workbench/api/browser/mainThreadAuthentication';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

export const IAuthenticationService = createDecorator<IAuthenticationService>('IAuthenticationService');

export interface IAuthenticationService {
	_serviceBrand: undefined;

	isAuthenticationProviderRegistered(id: string): boolean;
	registerAuthenticationProvider(id: string, provider: MainThreadAuthenticationProvider): void;
	unregisterAuthenticationProvider(id: string): void;
	requestNewSession(id: string, scopes: string[], extensionId: string, extensionName: string): void;
	sessionsUpdate(providerId: string, event: AuthenticationSessionsChangeEvent): void;

	readonly onDidRegisterAuthenticationProvider: Event<string>;
	readonly onDidUnregisterAuthenticationProvider: Event<string>;

	readonly onDidChangeSessions: Event<{ providerId: string, event: AuthenticationSessionsChangeEvent }>;
	getSessions(providerId: string): Promise<ReadonlyArray<AuthenticationSession> | undefined>;
	getDisplayName(providerId: string): string;
	login(providerId: string, scopes: string[]): Promise<AuthenticationSession>;
	logout(providerId: string, accountId: string): Promise<void>;
}

export interface AllowedExtension {
	id: string;
	name: string;
}

export function readAllowedExtensions(storageService: IStorageService, providerId: string, accountName: string): AllowedExtension[] {
	let trustedExtensions: AllowedExtension[] = [];
	try {
		const trustedExtensionSrc = storageService.get(`${providerId}-${accountName}`, StorageScope.GLOBAL);
		if (trustedExtensionSrc) {
			trustedExtensions = JSON.parse(trustedExtensionSrc);
		}
	} catch (err) { }

	return trustedExtensions;
}

export interface SessionRequest {
	[scopes: string]: IDisposable[];
}

export class AuthenticationService extends Disposable implements IAuthenticationService {
	_serviceBrand: undefined;
	private _placeholderMenuItem: IDisposable | undefined;
	private _noAccountsMenuItem: IDisposable | undefined;
	private _signInRequestItems = new Map<string, SessionRequest>();
	private _badgeDisposable: IDisposable | undefined;

	private _authenticationProviders: Map<string, MainThreadAuthenticationProvider> = new Map<string, MainThreadAuthenticationProvider>();

	private _onDidRegisterAuthenticationProvider: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidRegisterAuthenticationProvider: Event<string> = this._onDidRegisterAuthenticationProvider.event;

	private _onDidUnregisterAuthenticationProvider: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidUnregisterAuthenticationProvider: Event<string> = this._onDidUnregisterAuthenticationProvider.event;

	private _onDidChangeSessions: Emitter<{ providerId: string, event: AuthenticationSessionsChangeEvent }> = this._register(new Emitter<{ providerId: string, event: AuthenticationSessionsChangeEvent }>());
	readonly onDidChangeSessions: Event<{ providerId: string, event: AuthenticationSessionsChangeEvent }> = this._onDidChangeSessions.event;

	constructor(@IActivityService private readonly activityService: IActivityService) {
		super();
		this._placeholderMenuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			command: {
				id: 'noAuthenticationProviders',
				title: nls.localize('loading', "Loading..."),
				precondition: ContextKeyExpr.false()
			},
		});
	}

	isAuthenticationProviderRegistered(id: string): boolean {
		return this._authenticationProviders.has(id);
	}

	private updateAccountsMenuItem(): void {
		let hasSession = false;
		this._authenticationProviders.forEach(async provider => {
			hasSession = hasSession || provider.hasSessions();
		});

		if (hasSession && this._noAccountsMenuItem) {
			this._noAccountsMenuItem.dispose();
			this._noAccountsMenuItem = undefined;
		}

		if (!hasSession && !this._noAccountsMenuItem) {
			this._noAccountsMenuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
				group: '0_accounts',
				command: {
					id: 'noAccounts',
					title: nls.localize('noAccounts', "You are not signed in to any accounts"),
					precondition: ContextKeyExpr.false()
				},
			});
		}
	}

	registerAuthenticationProvider(id: string, authenticationProvider: MainThreadAuthenticationProvider): void {
		this._authenticationProviders.set(id, authenticationProvider);
		this._onDidRegisterAuthenticationProvider.fire(id);

		if (this._placeholderMenuItem) {
			this._placeholderMenuItem.dispose();
			this._placeholderMenuItem = undefined;
		}

		this.updateAccountsMenuItem();
	}

	unregisterAuthenticationProvider(id: string): void {
		const provider = this._authenticationProviders.get(id);
		if (provider) {
			provider.dispose();
			this._authenticationProviders.delete(id);
			this._onDidUnregisterAuthenticationProvider.fire(id);
			this.updateAccountsMenuItem();
		}

		if (!this._authenticationProviders.size) {
			this._placeholderMenuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
				command: {
					id: 'noAuthenticationProviders',
					title: nls.localize('loading', "Loading..."),
					precondition: ContextKeyExpr.false()
				},
			});
		}
	}

	async sessionsUpdate(id: string, event: AuthenticationSessionsChangeEvent): Promise<void> {
		this._onDidChangeSessions.fire({ providerId: id, event: event });
		const provider = this._authenticationProviders.get(id);
		if (provider) {
			await provider.updateSessionItems(event);
			this.updateAccountsMenuItem();

			if (event.added) {
				await this.updateNewSessionRequests(provider);
			}
		}
	}

	private async updateNewSessionRequests(provider: MainThreadAuthenticationProvider): Promise<void> {
		const existingRequestsForProvider = this._signInRequestItems.get(provider.id);
		if (!existingRequestsForProvider) {
			return;
		}

		const sessions = await provider.getSessions();
		let changed = false;

		Object.keys(existingRequestsForProvider).forEach(requestedScopes => {
			if (sessions.some(session => session.scopes.sort().join('') === requestedScopes)) {
				// Request has been completed
				changed = true;
				const disposables = existingRequestsForProvider[requestedScopes];
				disposables?.forEach(item => item.dispose());

				delete existingRequestsForProvider[requestedScopes];
				if (Object.keys(existingRequestsForProvider).length === 0) {
					this._signInRequestItems.delete(provider.id);
				} else {
					this._signInRequestItems.set(provider.id, existingRequestsForProvider);
				}
			}
		});

		if (changed) {
			if (this._signInRequestItems.size === 0) {
				this._badgeDisposable?.dispose();
				this._badgeDisposable = undefined;
			} else {
				const badge = new NumberBadge(this._signInRequestItems.size, () => nls.localize('sign in', "Sign in requested"));
				this._badgeDisposable = this.activityService.showAccountsActivity({ badge });
			}
		}
	}

	requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): void {
		const provider = this._authenticationProviders.get(providerId);
		if (provider) {
			// TODO handle extension requesting same scopes multiple times
			const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
				group: '2_signInRequests',
				command: {
					id: `${extensionId}signIn`,
					title: nls.localize('signInRequest', "Sign in to use {0} (1)", extensionName)
				}
			});

			const signInCommand = CommandsRegistry.registerCommand({
				id: `${extensionId}signIn`,
				handler: async (accessor) => {
					const authenticationService = accessor.get(IAuthenticationService);
					const storageService = accessor.get(IStorageService);
					const session = await authenticationService.login(providerId, scopes);

					// Add extension to allow list since user explicitly signed in on behalf of it
					const allowList = readAllowedExtensions(storageService, providerId, session.account.displayName);
					if (!allowList.find(allowed => allowed.id === extensionId)) {
						allowList.push({ id: extensionId, name: extensionName });
						storageService.store(`${providerId}-${session.account.displayName}`, JSON.stringify(allowList), StorageScope.GLOBAL);
					}

					// And also set it as the preferred account for the extension
					storageService.store(`${extensionName}-${providerId}`, session.id, StorageScope.GLOBAL);
				}
			});

			const existingRequestsForProvider = this._signInRequestItems.get(providerId);
			const scopesList = scopes.sort().join('');
			if (existingRequestsForProvider) {
				const existingDisposables = existingRequestsForProvider[scopesList] || [];

				existingRequestsForProvider[scopesList] = [...existingDisposables, menuItem, signInCommand];
				this._signInRequestItems.set(providerId, existingRequestsForProvider);
			} else {
				this._signInRequestItems.set(providerId, { [scopesList]: [menuItem, signInCommand] });
			}


			const badge = new NumberBadge(this._signInRequestItems.size, () => nls.localize('sign in', "Sign in requested"));
			this._badgeDisposable = this.activityService.showAccountsActivity({ badge });
		}
	}
	getDisplayName(id: string): string {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.displayName;
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async getSessions(id: string): Promise<ReadonlyArray<AuthenticationSession> | undefined> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return await authProvider.getSessions();
		}

		return undefined;
	}

	async login(id: string, scopes: string[]): Promise<AuthenticationSession> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.login(scopes);
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async logout(id: string, accountId: string): Promise<void> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.logout(accountId);
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}
}

registerSingleton(IAuthenticationService, AuthenticationService);
