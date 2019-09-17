/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { MainContext, ExtHostContext, IExtHostContext, MainThreadUserDataShape, ExtHostUserDataShape } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IUserData, IUserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSync';

@extHostNamedCustomer(MainContext.MainThreadUserData)
export class MainThreadUserData extends Disposable implements MainThreadUserDataShape {

	private readonly proxy: ExtHostUserDataShape;

	constructor(
		extHostContext: IExtHostContext,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostUserData);
		this._register(toDisposable(() => this.userDataSyncStoreService.deregisterUserDataSyncStore()));
	}

	$registerUserDataProvider(id: string, name: string): void {
		const proxy = this.proxy;
		this.userDataSyncStoreService.registerUserDataSyncStore({
			id,
			name,
			read(key: string): Promise<IUserData | null> {
				return proxy.$read(key);
			},
			write(key: string, content: string, ref: string): Promise<string> {
				return proxy.$write(key, content, ref);
			}
		});
	}

	$deregisterUserDataProvider(): void {
		this.userDataSyncStoreService.deregisterUserDataSyncStore();
	}

}
