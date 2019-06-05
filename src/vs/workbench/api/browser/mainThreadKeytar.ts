/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { MainContext, MainThreadKeytarShape, IExtHostContext } from 'vs/workbench/api/common/extHost.protocol';

interface IKeytarModule {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
	findPassword(service: string): Promise<string | null>;
}

@extHostNamedCustomer(MainContext.MainThreadKeytar)
export class MainThreadKeytar implements MainThreadKeytarShape {

	private _keytar: Promise<IKeytarModule | null>;

	constructor(
		extHostContext: IExtHostContext
	) {
		// tslint:disable-next-line:import-patterns
		this._keytar = import('keytar')
			.catch(e => null);
	}

	dispose(): void {
		//
	}

	async $getPassword(service: string, account: string): Promise<string | null> {
		const keytar = await this._keytar;
		if (keytar) {
			return keytar.getPassword(service, account);
		}
		return null;
	}

	async $setPassword(service: string, account: string, password: string): Promise<void> {
		const keytar = await this._keytar;
		if (keytar) {
			return keytar.setPassword(service, account, password);
		}
	}

	async $deletePassword(service: string, account: string): Promise<boolean> {
		const keytar = await this._keytar;
		if (keytar) {
			return keytar.deletePassword(service, account);
		}
		return false;
	}

	async $findPassword(service: string): Promise<string | null> {
		const keytar = await this._keytar;
		if (keytar) {
			return keytar.findPassword(service);
		}
		return null;
	}
}
