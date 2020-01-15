/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { ExtHostAuthenticationShape, ExtHostContext, IExtHostContext, MainContext, MainThreadAuthenticationShape } from '../common/extHost.protocol';

export class MainThreadAuthenticationProvider {
	public readonly handle: number;
	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		handle: number
	) {
		this.handle = handle;
	}

	accounts(): Promise<ReadonlyArray<modes.Account>> {
		return this._proxy.$accounts(this.handle);
	}

	login(): Promise<modes.Account> {
		return this._proxy.$login(this.handle);
	}

	logout(accountId: string): Promise<void> {
		return this._proxy.$logout(this.handle, accountId);
	}
}

@extHostNamedCustomer(MainContext.MainThreadAuthentication)
export class MainThreadAuthentication extends Disposable implements MainThreadAuthenticationShape {
	private readonly _proxy: ExtHostAuthenticationShape;
	private _handlers = new Map<number, string>();

	constructor(
		extHostContext: IExtHostContext,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);
	}

	$registerAuthenticationProvider(handle: number, id: string): void {
		const provider = new MainThreadAuthenticationProvider(this._proxy, id, handle);
		this._handlers.set(handle, id);
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	$unregisterAuthenticationProvider(handle: number): void {
		const id = this._handlers.get(handle);
		if (!id) {
			throw new Error(`No authentication provider registered with id ${id}`);
		}

		this.authenticationService.unregisterAuthenticationProvider(id);
	}

	$onDidChangeAccounts(handle: number, accounts: ReadonlyArray<modes.Account>) {
		const id = this._handlers.get(handle);
		if (id) {
			this.authenticationService.accountsUpdate(id, accounts);
		}
	}
}
