/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { MainContext, ExtHostContext, IExtHostContext, MainThreadUserDataShape, ExtHostUserDataShape } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IUserData } from 'vs/platform/userDataSync/common/userDataSync';
import { Registry } from 'vs/platform/registry/common/platform';
import { IUserDataSyncStoresRegistry, Extensions } from 'vs/workbench/services/userDataSync/common/userDataSyncStores';

@extHostNamedCustomer(MainContext.MainThreadUserData)
export class MainThreadUserData extends Disposable implements MainThreadUserDataShape {

	private readonly proxy: ExtHostUserDataShape;

	constructor(
		extHostContext: IExtHostContext,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostUserData);
	}

	$registerUserDataProvider(id: string, name: string): void {
		const proxy = this.proxy;
		Registry.as<IUserDataSyncStoresRegistry>(Extensions.UserDataSyncStoresRegistry).registerUserDataSyncStore({
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

	$deregisterUserDataProvider(id: string): void {
		Registry.as<IUserDataSyncStoresRegistry>(Extensions.UserDataSyncStoresRegistry).deregisterUserDataSyncStore(id);
	}

	dispose(): void {
		const registry = Registry.as<IUserDataSyncStoresRegistry>(Extensions.UserDataSyncStoresRegistry);
		registry.all.forEach(store => registry.deregisterUserDataSyncStore(store.id));
	}

}
