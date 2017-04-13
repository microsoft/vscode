/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';

import { ExtHostContext, MainThreadTaskShape, ExtHostTaskShape } from './extHost.protocol';

export class MainThreadTask extends MainThreadTaskShape {

	private _proxy: ExtHostTaskShape;

	constructor( @IThreadService threadService: IThreadService, @ITaskService private _taskService: ITaskService) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostTask);
	}

	public $registerTaskProvider(handle: number): TPromise<void> {
		this._taskService.registerTaskProvider(handle, {
			provideTasks: () => {
				return this._proxy.$provideTasks(handle);
			}
		});
		return TPromise.as<void>(undefined);
	}

	public $unregisterTaskProvider(handle: number): TPromise<any> {
		this._taskService.unregisterTaskProvider(handle);
		return TPromise.as<void>(undefined);
	}
}