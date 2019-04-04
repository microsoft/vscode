/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as pfs from 'vs/base/node/pfs';
import { IConfigurationFileService } from 'vs/workbench/services/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';

export class ConfigurationFileService implements IConfigurationFileService {

	exists(resource: URI): Promise<boolean> {
		return pfs.exists(resource.fsPath);
	}

	async resolveContent(resource: URI): Promise<string> {
		const contents = await pfs.readFile(resource.fsPath);
		return contents.toString();
	}

}
