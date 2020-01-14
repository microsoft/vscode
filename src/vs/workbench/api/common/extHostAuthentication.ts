/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as modes from 'vs/editor/common/modes';
import { Emitter, Event } from 'vs/base/common/event';
import { IMainContext, MainContext, MainThreadAuthenticationShape, ExtHostAuthenticationShape } from 'vs/workbench/api/common/extHost.protocol';
import { IDisposable } from 'vs/base/common/lifecycle';

export class ExtHostAuthenticationProvider implements IDisposable {
	constructor(private _provider: vscode.AuthenticationProvider,
		private readonly _handle: number,
		private _proxy: MainThreadAuthenticationShape) {
		this._provider.onDidChangeAccounts(x => this._proxy.$onDidChangeAccounts(this._handle, this._provider.accounts));
	}

	get accounts(): ReadonlyArray<vscode.Account> {
		return this._provider.accounts;
	}

	login(): Promise<vscode.Account> {
		return this._provider.login();
	}

	logout(accountId: string): Promise<void> {
		return this._provider.logout(accountId);
	}

	dispose(): void {
		this._proxy.$unregisterAuthenticationProvider(this._handle);
	}
}

export class ExtHostAuthentication implements ExtHostAuthenticationShape {
	public static _handlePool: number = 0;
	private _proxy: MainThreadAuthenticationShape;
	private _authenticationProviders: Map<number, ExtHostAuthenticationProvider> = new Map<number, ExtHostAuthenticationProvider>();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAuthentication);
	}

	private readonly _onDidRefreshToken = new Emitter<any>();
	readonly onDidRefreshToken: Event<any> = this._onDidRefreshToken.event;

	registerAuthenticationProvider(provider: vscode.AuthenticationProvider) {
		const handle = ExtHostAuthentication._handlePool++;
		const authenticationProvider = new ExtHostAuthenticationProvider(provider, handle, this._proxy);
		this._authenticationProviders.set(handle, authenticationProvider);

		this._proxy.$registerAuthenticationProvider(handle, provider.id);
		return authenticationProvider;
	}

	$accounts(handle: number): Promise<ReadonlyArray<modes.Account>> {
		const authProvider = this._authenticationProviders.get(handle);
		if (authProvider) {
			return Promise.resolve(authProvider.accounts);
		}

		throw new Error(`Unable to find authentication provider with handle: ${handle}`);
	}

	$login(handle: number): Promise<modes.Account> {
		const authProvider = this._authenticationProviders.get(handle);
		if (authProvider) {
			return authProvider.login();
		}

		throw new Error(`Unable to find authentication provider with handle: ${handle}`);
	}

	$logout(handle: number, accountId: string): Promise<void> {
		const authProvider = this._authenticationProviders.get(handle);
		if (authProvider) {
			return authProvider.logout(accountId);
		}

		throw new Error(`Unable to find authentication provider with handle: ${handle}`);
	}
}
