/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../base/common/path';
import { tmpdir } from 'os';
import { generateUuid } from '../../../base/common/uuid';
import { IExtHostCommands } from '../common/extHostCommands';
import { Disposable } from '../../../base/common/lifecycle';
import { MainContext } from '../common/extHost.protocol';
import { URI } from '../../../base/common/uri';
import { IExtHostRpcService } from '../common/extHostRpcService';

export class ExtHostDownloadService extends Disposable {

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostCommands commands: IExtHostCommands
	) {
		super();

		const proxy = extHostRpc.getProxy(MainContext.MainThreadDownloadService);

		commands.registerCommand(false, '_workbench.downloadResource', async (resource: URI): Promise<any> => {
			const location = URI.file(join(tmpdir(), generateUuid()));
			await proxy.$download(resource, location);
			return location;
		});
	}
}
