/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IExtHostContext } from '../node/extHost.protocol';
import { extHostCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';

@extHostCustomer
export class MainThreadLogLevelManagementChannel extends Disposable {

	constructor(
		extHostContext: IExtHostContext,
		@ILogService logService: ILogService,
	) {
		super();
		// this._register(logService.onDidChangeLogLevel(level => extHostContext.getProxy(ExtHostContext.ExtHostLogService).$setLogLevel(level)));
	}

}