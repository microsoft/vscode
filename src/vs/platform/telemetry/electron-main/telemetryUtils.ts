/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { machineIdKey } from 'vs/platform/telemetry/common/telemetry';
import { resolveMachineId as resolveNodeMachineId } from 'vs/platform/telemetry/node/telemetryUtils';

export async function resolveMachineId(stateService: IStateService, logService: ILogService) {
	// Call the node layers implementation to avoid code duplication
	const machineId = await resolveNodeMachineId(stateService, logService);
	stateService.setItem(machineIdKey, machineId);
	return machineId;
}
