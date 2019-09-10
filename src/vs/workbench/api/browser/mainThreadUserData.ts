/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { MainContext, ExtHostContext, IExtHostContext, MainThreadUserDataShape, ExtHostUserDataShape } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IRemoteUserDataService, IUserData } from 'vs/workbench/services/userData/common/userData';

@extHostNamedCustomer(MainContext.MainThreadUserData)
export class MainThreadUserData extends Disposable implements MainThreadUserDataShape {

	private readonly proxy: ExtHostUserDataShape;

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteUserDataService private readonly remoteUserDataService: IRemoteUserDataService
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostUserData);
		this._register(toDisposable(() => this.remoteUserDataService.deregisterRemoteUserDataProvider()));
	}

	$registerUserDataProvider(name: string): void {
		const proxy = this.proxy;
		this.remoteUserDataService.registerRemoteUserDataProvider(name, {
			read(key: string): Promise<IUserData | null> {
				return proxy.$read(key);
			},
			write(key: string, version: number, content: string): Promise<void> {
				return proxy.$write(key, version, content);
			}
		});
	}

	$deregisterUserDataProvider(): void {
		this.remoteUserDataService.deregisterRemoteUserDataProvider();
	}

}
