/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from '../../../base/common/platform.js';
import { getMachineId, getSqmMachineId, getdevDeviceId } from '../../../base/node/id.js';
import { ILogService } from '../../log/common/log.js';
import { IStateReadService } from '../../state/node/state.js';
import { machineIdKey, sqmIdKey, devDeviceIdKey } from '../common/telemetry.js';


export async function resolveMachineId(stateService: IStateReadService, logService: ILogService): Promise<string> {
	// We cache the machineId for faster lookups
	// and resolve it only once initially if not cached or we need to replace the macOS iBridge device
	let machineId = stateService.getItem<string>(machineIdKey);
	if (typeof machineId !== 'string' || (isMacintosh && machineId === '6c9d2bc8f91b89624add29c0abeae7fb42bf539fa1cdb2e3e57cd668fa9bcead')) {
		machineId = await getMachineId(logService.error.bind(logService));
	}

	return machineId;
}

export async function resolveSqmId(stateService: IStateReadService, logService: ILogService): Promise<string> {
	let sqmId = stateService.getItem<string>(sqmIdKey);
	if (typeof sqmId !== 'string') {
		sqmId = await getSqmMachineId(logService.error.bind(logService));
	}

	return sqmId;
}

export async function resolvedevDeviceId(stateService: IStateReadService, logService: ILogService): Promise<string> {
	let devDeviceId = stateService.getItem<string>(devDeviceIdKey);
	if (typeof devDeviceId !== 'string') {
		devDeviceId = await getdevDeviceId(logService.error.bind(logService));
	}

	return devDeviceId;
}
