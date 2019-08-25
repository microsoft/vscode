/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { MainContext, ExtHostContext, IExtHostContext, MainThreadUserDataShape, ExtHostUserDataShape } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IUserDataProviderService, IUserIdentityService, IUserDataProvider, IUserLoginProvider } from 'vs/workbench/services/userData/common/userData';
import { Emitter, Event } from 'vs/base/common/event';

@extHostNamedCustomer(MainContext.MainThreadUserData)
export class MainThreadUserData extends Disposable implements MainThreadUserDataShape {

	private readonly proxy: ExtHostUserDataShape;
	private readonly loginProviders: Map<string, UserLoginProvider> = new Map<string, UserLoginProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@IUserIdentityService private readonly userIdentityService: IUserIdentityService,
		@IUserDataProviderService private readonly userDataProviderService: IUserDataProviderService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostUserData);
		this._register(toDisposable(() => {
			this.userDataProviderService.deregisterAll();
			this.loginProviders.forEach((loginProvider, identity) => this.userIdentityService.deregisterUserLoginProvider(identity));
			this.loginProviders.clear();
		}));
	}

	$registerUserLoginProvider(identity: string, loggedIn: boolean): void {
		const userLoginProvider = new UserLoginProvider(identity, loggedIn, this.proxy);
		this.loginProviders.set(identity, userLoginProvider);
		this.userIdentityService.registerUserLoginProvider(identity, userLoginProvider);
	}

	$registerUserDataProvider(identity: string, userDataProvider: IUserDataProvider): void {
		this.userDataProviderService.registerUserDataProvider(identity, userDataProvider);
	}

	$updateLoggedIn(identity: string, loggedIn: boolean): void {
		const loginProvider = this.loginProviders.get(identity);
		if (loginProvider) {
			loginProvider.loggedIn = loggedIn;
		}
	}

}


class UserLoginProvider extends Disposable implements IUserLoginProvider {

	private _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _loggedIn: boolean;
	get loggedIn(): boolean { return this._loggedIn; }
	set loggedIn(loggedIn: boolean) {
		if (this._loggedIn !== loggedIn) {
			this._loggedIn = loggedIn;
			this._onDidChange.fire();
		}
	}

	constructor(private readonly identity: string, loggedIn: boolean, private readonly proxy: ExtHostUserDataShape) {
		super();
		this._loggedIn = loggedIn;
	}

	login(): Promise<void> {
		return this.proxy.$logIn(this.identity);
	}

	logout(): Promise<void> {
		return this.proxy.$logOut(this.identity);
	}

}
