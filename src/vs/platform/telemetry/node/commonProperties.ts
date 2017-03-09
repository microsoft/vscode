/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Platform from 'vs/base/common/platform';
import * as os from 'os';
import { TPromise } from 'vs/base/common/winjs.base';
import * as uuid from 'vs/base/common/uuid';

export const machineIdStorageKey = 'telemetry.machineId';
export const machineIdIpcChannel = 'vscode:machineId';

export function resolveCommonProperties(commit: string, version: string): TPromise<{ [name: string]: string; }> {
	const result: { [name: string]: string; } = Object.create(null);

	result['sessionID'] = uuid.generateUuid() + Date.now();
	result['commitHash'] = commit;
	result['version'] = version;
	result['common.osVersion'] = os.release();
	result['common.platform'] = Platform.Platform[Platform.platform];

	// dynamic properties which value differs on each call
	let seq = 0;
	const startTime = Date.now();
	Object.defineProperties(result, {
		'timestamp': {
			get: () => new Date(),
			enumerable: true
		},
		'common.timesincesessionstart': {
			get: () => Date.now() - startTime,
			enumerable: true
		},
		'common.sequence': {
			get: () => seq++,
			enumerable: true
		}
	});

	return TPromise.as(result);
}