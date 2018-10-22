/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as uuid from 'vs/base/common/uuid';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';

export const lastSessionDateStorageKey = 'telemetry.lastSessionDate';

export function resolveWorkbenchCommonProperties(storageService: IStorageService, commit: string, version: string, machineId: string, installSourcePath: string): TPromise<{ [name: string]: string }> {
	return resolveCommonProperties(commit, version, machineId, installSourcePath).then(result => {
		// __GDPR__COMMON__ "common.version.shell" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
		result['common.version.shell'] = process.versions && (<any>process).versions['electron'];
		// __GDPR__COMMON__ "common.version.renderer" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
		result['common.version.renderer'] = process.versions && (<any>process).versions['chrome'];

		const lastSessionDate = storageService.get(lastSessionDateStorageKey, StorageScope.GLOBAL);
		storageService.store('telemetry.lastSessionDate', new Date().toUTCString(), StorageScope.GLOBAL);

		// __GDPR__COMMON__ "common.firstSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.firstSessionDate'] = getOrCreateFirstSessionDate(storageService);
		// __GDPR__COMMON__ "common.lastSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.lastSessionDate'] = lastSessionDate;
		// __GDPR__COMMON__ "common.isNewSession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.isNewSession'] = !lastSessionDate ? '1' : '0';
		// __GDPR__COMMON__ "common.instanceId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.instanceId'] = getOrCreateInstanceId(storageService);

		return result;
	});
}

function getOrCreateInstanceId(storageService: IStorageService): string {
	const key = 'telemetry.instanceId';

	const result = storageService.get(key, StorageScope.GLOBAL, uuid.generateUuid());
	storageService.store(key, result, StorageScope.GLOBAL);

	return result;
}

function getOrCreateFirstSessionDate(storageService: IStorageService): string {
	const key = 'telemetry.firstSessionDate';

	const firstSessionDate = storageService.get(key, StorageScope.GLOBAL, new Date().toUTCString());
	storageService.store(key, firstSessionDate, StorageScope.GLOBAL);

	return firstSessionDate;
}