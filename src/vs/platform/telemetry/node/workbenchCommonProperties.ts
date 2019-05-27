/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';

export const instanceStorageKey = 'telemetry.instanceId';
export const currentSessionDateStorageKey = 'telemetry.currentSessionDate';
export const firstSessionDateStorageKey = 'telemetry.firstSessionDate';
export const lastSessionDateStorageKey = 'telemetry.lastSessionDate';

export async function resolveWorkbenchCommonProperties(storageService: IStorageService, commit: string | undefined, version: string | undefined, machineId: string, installSourcePath: string): Promise<{ [name: string]: string | undefined }> {
	const result = await resolveCommonProperties(commit, version, machineId, installSourcePath);
	const instanceId = storageService.get(instanceStorageKey, StorageScope.GLOBAL)!;
	const firstSessionDate = storageService.get(firstSessionDateStorageKey, StorageScope.GLOBAL)!;
	const lastSessionDate = storageService.get(lastSessionDateStorageKey, StorageScope.GLOBAL)!;

	// __GDPR__COMMON__ "common.version.shell" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.version.shell'] = process.versions && process.versions['electron'];
	// __GDPR__COMMON__ "common.version.renderer" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.version.renderer'] = process.versions && process.versions['chrome'];
	// __GDPR__COMMON__ "common.firstSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.firstSessionDate'] = firstSessionDate;
	// __GDPR__COMMON__ "common.lastSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.lastSessionDate'] = lastSessionDate || '';
	// __GDPR__COMMON__ "common.isNewSession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.isNewSession'] = !lastSessionDate ? '1' : '0';
	// __GDPR__COMMON__ "common.instanceId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.instanceId'] = instanceId;

	return result;
}
