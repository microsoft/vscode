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
	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string
	) { }

	getSessions(): Promise<ReadonlyArray<modes.Session>> {
		return this._proxy.$getSessions(this.id);
	}

	login(): Promise<modes.Session> {
		return this._proxy.$login(this.id);
	}

	logout(accountId: string): Promise<void> {
		return this._proxy.$logout(this.id, accountId);
	}
}

@extHostNamedCustomer(MainContext.MainThreadAuthentication)
export class MainThreadAuthentication extends Disposable implements MainThreadAuthenticationShape {
	private readonly _proxy: ExtHostAuthenticationShape;

	constructor(
		extHostContext: IExtHostContext,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);
	}

	$registerAuthenticationProvider(id: string): void {
		const provider = new MainThreadAuthenticationProvider(this._proxy, id);
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	$unregisterAuthenticationProvider(id: string): void {
		this.authenticationService.unregisterAuthenticationProvider(id);
	}

	$onDidChangeSessions(id: string) {
		this.authenticationService.sessionsUpdate(id);
	}
}
