/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { machineIdKey, sqmIdKey, devDeviceIdKey } from 'vs/platform/telemetry/common/telemetry';
import { resolveMachineId as resolveNodeMachineId, resolveSqmId as resolveNodeSqmId, resolvedevDeviceId as resolveNodedevDeviceId } from 'vs/platform/telemetry/node/telemetryUtils';

export async function resolveMachineId(stateService: IStateService, logService: ILogService): Promise<string> {
	// Call the node layers implementation to avoid code duplication
	const machineId = await resolveNodeMachineId(stateService, logService);
	stateService.setItem(machineIdKey, machineId);
	return machineId;
}

export async function resolveSqmId(stateService: IStateService, logService: ILogService): Promise<string> {
	const sqmId = await resolveNodeSqmId(stateService, logService);
	stateService.setItem(sqmIdKey, sqmId);
	return sqmId;
}

export async function resolvedevDeviceId(stateService: IStateService, logService: ILogService): Promise<string> {
	const devDeviceId = await resolveNodedevDeviceId(stateService, logService);
	stateService.setItem(devDeviceIdKey, devDeviceId);
	return devDeviceId;
}
