/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { MainContext, MainThreadKeytarShape, IExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { optional } from 'vs/platform/instantiation/common/instantiation';

@extHostNamedCustomer(MainContext.MainThreadKeytar)
export class MainThreadKeytar implements MainThreadKeytarShape {

	private readonly _credentialsService?: ICredentialsService;

	constructor(
		_extHostContext: IExtHostContext,
		@optional(ICredentialsService) credentialsService: ICredentialsService,
	) {
		this._credentialsService = credentialsService;
	}

	dispose(): void {
		//
	}

	async $getPassword(service: string, account: string): Promise<string | null> {
		if (this._credentialsService) {
			return this._credentialsService.getPassword(service, account);
		}
		return null;
	}

	async $setPassword(service: string, account: string, password: string): Promise<void> {
		if (this._credentialsService) {
			return this._credentialsService.setPassword(service, account, password);
		}
	}

	async $deletePassword(service: string, account: string): Promise<boolean> {
		if (this._credentialsService) {
			return this._credentialsService.deletePassword(service, account);
		}
		return false;
	}

	async $findPassword(service: string): Promise<string | null> {
		if (this._credentialsService) {
			return this._credentialsService.findPassword(service);
		}
		return null;
	}
}
