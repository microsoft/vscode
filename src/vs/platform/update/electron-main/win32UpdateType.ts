/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UpdateType } from '../common/update.js';

export function isInnoSetupInstall(target: string | undefined): boolean {
	return target === 'user' || target === 'system';
}

export function getWin32UpdateType(target: string | undefined): UpdateType {
	return isInnoSetupInstall(target) ? UpdateType.Setup : UpdateType.Archive;
}
