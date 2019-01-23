/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';

export const lastSessionDateStorageKey = 'telemetry.lastSessionDate';

export function resolveWorkbenchCommonProperties(storageService: IStorageService, commit: string, version: string, machineId: string, installSourcePath: string): Promise<{ [name: string]: string | undefined }> {
	return resolveCommonProperties(commit, version, machineId, installSourcePath).then(result => {
		const instanceId = storageService.get('telemetry.instanceId', StorageScope.GLOBAL)!;
		const firstSessionDate = storageService.get('telemetry.firstSessionDate', StorageScope.GLOBAL)!;
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
	});
}
