/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { INativeEnvService } from '../common/envService';
import { EnvServiceImpl } from '../vscode/envServiceImpl';
import { URI } from '../../../util/vs/base/common/uri';

export class NativeEnvServiceImpl extends EnvServiceImpl implements INativeEnvService {
	declare readonly _serviceBrand: undefined;

	get userHome() {
		return URI.file(os.homedir());
	}
}