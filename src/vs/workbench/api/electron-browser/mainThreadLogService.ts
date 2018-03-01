/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { extHostCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtHostContext, ExtHostContext } from 'vs/workbench/api/node/extHost.protocol';

@extHostCustomer
export class MainThreadLogService extends Disposable {

	constructor(
		extHostContext: IExtHostContext,
		@ILogService logService: ILogService,
	) {
		super();
		this._register(logService.onDidChangeLogLevel(level => extHostContext.getProxy(ExtHostContext.ExtHostLogService).$setLevel(level)));
	}

}