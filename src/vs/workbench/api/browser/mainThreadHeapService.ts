/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostContext, IExtHostContext } from '../common/extHost.protocol';
import { Disposable } from 'vs/base/common/lifecycle';
import { extHostCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IHeapService } from 'vs/workbench/services/heap/common/heap';

@extHostCustomer
export class MainThreadHeapService extends Disposable {

	constructor(
		extHostContext: IExtHostContext,
		@IHeapService heapService: IHeapService,
	) {
		super();
		const proxy = extHostContext.getProxy(ExtHostContext.ExtHostHeapService);
		this._register(heapService.onGarbageCollection((ids) => {
			// send to ext host
			proxy.$onGarbageCollection(ids);
		}));
	}
}
