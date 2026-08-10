/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';
import * as path from '../../../base/common/path.js';
import { UpdateType } from '../common/update.js';

export function isInnoSetupInstall(executablePath = process.execPath, fileExists: (path: string) => boolean = existsSync): boolean {
	return fileExists(path.join(path.dirname(executablePath), 'unins000.exe'));
}

export function getWin32UpdateType(): UpdateType {
	return isInnoSetupInstall() ? UpdateType.Setup : UpdateType.Archive;
}
