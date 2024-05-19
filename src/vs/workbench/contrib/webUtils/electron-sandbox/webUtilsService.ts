/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webUtils } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import type { IWebUtilsService } from '../browser/webUtils';

export class ElectronWebUtilsService implements IWebUtilsService {
	declare readonly _serviceBrand: undefined;

	getPathForFile(file: File): string {
		return webUtils.getPathForFile(file);
	}
}
