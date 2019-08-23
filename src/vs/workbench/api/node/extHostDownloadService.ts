/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { tmpdir } from 'os';
import { generateUuid } from 'vs/base/common/uuid';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { Disposable } from 'vs/base/common/lifecycle';
import { MainThreadDownloadServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { URI } from 'vs/base/common/uri';

export class ExtHostDownloadService extends Disposable {

	constructor(
		proxy: MainThreadDownloadServiceShape,
		commands: ExtHostCommands
	) {
		super();
		commands.registerCommand(false, '_workbench.downloadResource', async (resource: URI): Promise<any> => {
			const location = URI.file(join(tmpdir(), generateUuid()));
			await proxy.$download(resource, location);
			return location;
		});
	}

}