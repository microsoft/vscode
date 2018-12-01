/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as uuid from 'vs/base/common/uuid';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';

export const lastSessionDateStorageKey = 'telemetry.lastSessionDate';

export function resolveWorkbenchCommonProperties(storageService: IStorageService, commit: string, version: string, machineId: string, installSourcePath: string): Promise<{ [name: string]: string }> {
	return resolveCommonProperties(commit, version, machineId, installSourcePath).then(result => {
		// __GDPR__COMMON__ "common.version.shell" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
		result['common.version.shell'] = process.versions && process.versions['electron'];
		// __GDPR__COMMON__ "common.version.renderer" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
		result['common.version.renderer'] = process.versions && process.versions['chrome'];

		const lastSessionDate = storageService.get(lastSessionDateStorageKey, StorageScope.GLOBAL);
		if (!process.env['VSCODE_TEST_STORAGE_MIGRATION']) {
			storageService.store(lastSessionDateStorageKey, new Date().toUTCString(), StorageScope.GLOBAL);
		}

		// __GDPR__COMMON__ "common.firstSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.firstSessionDate'] = getOrCreateFirstSessionDate(storageService);
		// __GDPR__COMMON__ "common.lastSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.lastSessionDate'] = lastSessionDate || '';
		// __GDPR__COMMON__ "common.isNewSession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.isNewSession'] = !lastSessionDate ? '1' : '0';
		// __GDPR__COMMON__ "common.instanceId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.instanceId'] = getOrCreateInstanceId(storageService);

		return result;
	});
}

function getOrCreateInstanceId(storageService: IStorageService): string {
	const key = 'telemetry.instanceId';

	let instanceId = storageService.get(key, StorageScope.GLOBAL, void 0);
	if (instanceId) {
		return instanceId;
	}

	instanceId = uuid.generateUuid();
	storageService.store(key, instanceId, StorageScope.GLOBAL);

	return instanceId;
}

function getOrCreateFirstSessionDate(storageService: IStorageService): string {
	const key = 'telemetry.firstSessionDate';

	let firstSessionDate = storageService.get(key, StorageScope.GLOBAL, void 0);
	if (firstSessionDate) {
		return firstSessionDate;
	}

	firstSessionDate = new Date().toUTCString();
	storageService.store(key, firstSessionDate, StorageScope.GLOBAL);

	return firstSessionDate;
}
