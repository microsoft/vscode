/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDevDeviceId } from '../../../base/node/id.js';
import { ILogService } from '../../log/common/log.js';
import { IStateService } from '../../state/node/state.js';
import { machineIdKey, sqmIdKey, devDeviceIdKey } from '../common/telemetry.js';
import { resolveMachineId as resolveNodeMachineId, resolveSqmId as resolveNodeSqmId, resolveDevDeviceId as resolveNodeDevDeviceId } from '../node/telemetryUtils.js';

export async function resolveMachineId(stateService: IStateService, logService: ILogService): Promise<string> {
	logService.trace('Resolving machine identifier...');
	const machineId = await resolveNodeMachineId(stateService, logService);
	stateService.setItem(machineIdKey, machineId);
	logService.trace(`Resolved machine identifier: ${machineId}`);
	return machineId;
}

export async function resolveSqmId(stateService: IStateService, logService: ILogService): Promise<string> {
	logService.trace('Resolving SQM identifier...');
	const sqmId = await resolveNodeSqmId(stateService, logService);
	stateService.setItem(sqmIdKey, sqmId);
	logService.trace(`Resolved SQM identifier: ${sqmId}`);
	return sqmId;
}

export async function resolveDevDeviceId(stateService: IStateService, logService: ILogService): Promise<string> {
	logService.trace('Resolving devDevice identifier...');
	const devDeviceId = await resolveNodeDevDeviceId(stateService, logService);
	stateService.setItem(devDeviceIdKey, devDeviceId);
	logService.trace(`Resolved devDevice identifier: ${devDeviceId}`);
	return devDeviceId;
}

export async function validateDevDeviceId(stateService: IStateService, logService: ILogService): Promise<void> {
	const actualDeviceId = await getDevDeviceId(logService.error.bind(logService));
	const currentDeviceId = await resolveNodeDevDeviceId(stateService, logService);
	if (actualDeviceId !== currentDeviceId) {
		stateService.setItem(devDeviceIdKey, actualDeviceId);
	}
}
