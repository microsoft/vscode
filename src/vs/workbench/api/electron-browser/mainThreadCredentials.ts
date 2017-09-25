/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ExtHostContext, MainThreadCredentialsShape, ExtHostCredentialsShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadCredentials)
export class MainThreadCredentials implements MainThreadCredentialsShape {

	private _proxy: ExtHostCredentialsShape;

	constructor(
		extHostContext: IExtHostContext,
		@ICredentialsService private _credentialsService: ICredentialsService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostCredentials);
	}

	public dispose(): void {
	}

	$readSecret(service: string, account: string): Thenable<string | undefined> {
		return this._credentialsService.readSecret(service, account);
	}

	$writeSecret(service: string, account: string, secret: string): Thenable<void> {
		return this._credentialsService.writeSecret(service, account, secret);
	}
	$deleteSecret(service: string, account: string): Thenable<boolean> {
		return this._credentialsService.deleteSecret(service, account);
	}
}
