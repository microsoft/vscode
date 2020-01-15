/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Account } from 'vs/editor/common/modes';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { MainThreadAuthenticationProvider } from 'vs/workbench/api/browser/mainThreadAuthentication';

export const IAuthenticationService = createDecorator<IAuthenticationService>('IAuthenticationService');

export interface ChangeAccountEventData {
	providerId: string;
	accounts: ReadonlyArray<Account>;
}

export interface IAuthenticationService {
	_serviceBrand: undefined;

	registerAuthenticationProvider(id: string, provider: MainThreadAuthenticationProvider): void;
	unregisterAuthenticationProvider(id: string): void;
	accountsUpdate(providerId: string, accounts: ReadonlyArray<Account>): void;

	readonly onDidRegisterAuthenticationProvider: Event<string>;
	readonly onDidUnregisterAuthenticationProvider: Event<string>;

	readonly onDidChangeAccounts: Event<ChangeAccountEventData>;
	getAccounts(providerId: string): Promise<ReadonlyArray<Account> | undefined>;
	login(providerId: string): Promise<Account>;
	logout(providerId: string, accountId: string): Promise<void>;
}

export class AuthenticationService extends Disposable implements IAuthenticationService {
	_serviceBrand: undefined;

	private _authenticationProviders: Map<string, MainThreadAuthenticationProvider> = new Map<string, MainThreadAuthenticationProvider>();

	private _onDidRegisterAuthenticationProvider: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidRegisterAuthenticationProvider: Event<string> = this._onDidRegisterAuthenticationProvider.event;

	private _onDidUnregisterAuthenticationProvider: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidUnregisterAuthenticationProvider: Event<string> = this._onDidUnregisterAuthenticationProvider.event;

	private _onDidChangeAccounts: Emitter<ChangeAccountEventData> = this._register(new Emitter<ChangeAccountEventData>());
	readonly onDidChangeAccounts: Event<ChangeAccountEventData> = this._onDidChangeAccounts.event;

	constructor() {
		super();
	}

	registerAuthenticationProvider(id: string, authenticationProvider: MainThreadAuthenticationProvider): void {
		this._authenticationProviders.set(id, authenticationProvider);
		this._onDidRegisterAuthenticationProvider.fire(id);
	}

	unregisterAuthenticationProvider(id: string): void {
		this._authenticationProviders.delete(id);
		this._onDidUnregisterAuthenticationProvider.fire(id);
	}

	accountsUpdate(providerId: string, accounts: ReadonlyArray<Account>): void {
		this._onDidChangeAccounts.fire({ providerId, accounts });
	}

	async getAccounts(id: string): Promise<ReadonlyArray<Account> | undefined> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return await authProvider.accounts();
		}

		return undefined;
	}

	async login(id: string): Promise<Account> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.login();
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
