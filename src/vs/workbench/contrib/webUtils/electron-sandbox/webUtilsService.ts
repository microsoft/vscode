/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webUtils } from 'vs/base/parts/sandbox/electron-sandbox/globals.js';

export class ElectronWebUtilsService {
	getPathForFile(file: File): string {
		return webUtils.getPathForFile(file);
	}
}
