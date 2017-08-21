/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';

import { ExtHostContext, MainThreadTaskShape, ExtHostTaskShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadTask)
export class MainThreadTask implements MainThreadTaskShape {

	private _proxy: ExtHostTaskShape;
	private _activeHandles: { [handle: number]: boolean; };

	constructor(
		extHostContext: IExtHostContext,
		@ITaskService private _taskService: ITaskService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostTask);
		this._activeHandles = Object.create(null);
	}

	public dispose(): void {
		Object.keys(this._activeHandles).forEach((handle) => {
			this._taskService.unregisterTaskProvider(parseInt(handle, 10));
		});
		this._activeHandles = Object.create(null);
	}

	public $registerTaskProvider(handle: number): TPromise<void> {
		this._taskService.registerTaskProvider(handle, {
			provideTasks: () => {
				return this._proxy.$provideTasks(handle);
			}
		});
		this._activeHandles[handle] = true;
		return TPromise.as<void>(undefined);
	}

	public $unregisterTaskProvider(handle: number): TPromise<any> {
		this._taskService.unregisterTaskProvider(handle);
		delete this._activeHandles[handle];
		return TPromise.as<void>(undefined);
	}
}
