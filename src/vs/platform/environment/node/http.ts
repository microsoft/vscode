/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { getMachineId } from 'vs/base/node/id';
import pkg from 'vs/platform/node/package';

export function getCommonHTTPHeaders(): TPromise<{ [key: string]: string; }> {
	return getMachineId().then(machineId => ({
		'X-Market-Client-Id': `VSCode ${pkg.version}`,
		'User-Agent': `VSCode ${pkg.version}`,
		'X-Market-User-Id': machineId
	}));
}