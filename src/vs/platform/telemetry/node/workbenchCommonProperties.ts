/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as uuid from 'vs/base/common/uuid';
import { INextStorage2Service, StorageScope } from 'vs/platform/storage2/common/storage2';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';

export function resolveWorkbenchCommonProperties(nextStorage2Service: INextStorage2Service, commit: string, version: string, machineId: string, installSourcePath: string): TPromise<{ [name: string]: string }> {
	return resolveCommonProperties(commit, version, machineId, installSourcePath).then(result => {
		// __GDPR__COMMON__ "common.version.shell" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
		result['common.version.shell'] = process.versions && (<any>process).versions['electron'];
		// __GDPR__COMMON__ "common.version.renderer" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
		result['common.version.renderer'] = process.versions && (<any>process).versions['chrome'];

		const lastSessionDate = nextStorage2Service.get('telemetry.lastSessionDate', StorageScope.GLOBAL);
		nextStorage2Service.set('telemetry.lastSessionDate', new Date().toUTCString(), StorageScope.GLOBAL);

		// __GDPR__COMMON__ "common.firstSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.firstSessionDate'] = getOrCreateFirstSessionDate(nextStorage2Service);
		// __GDPR__COMMON__ "common.lastSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.lastSessionDate'] = lastSessionDate;
		// __GDPR__COMMON__ "common.isNewSession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.isNewSession'] = !lastSessionDate ? '1' : '0';
		// __GDPR__COMMON__ "common.instanceId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.instanceId'] = getOrCreateInstanceId(nextStorage2Service);

		return result;
	});
}

function getOrCreateInstanceId(nextStorage2Service: INextStorage2Service): string {
	const result = nextStorage2Service.get('telemetry.instanceId', StorageScope.GLOBAL, uuid.generateUuid());
	nextStorage2Service.set('telemetry.instanceId', result, StorageScope.GLOBAL);

	return result;
}

function getOrCreateFirstSessionDate(nextStorage2Service: INextStorage2Service): string {
	const firstSessionDate = nextStorage2Service.get('telemetry.firstSessionDate', StorageScope.GLOBAL, new Date().toUTCString());
	nextStorage2Service.set('telemetry.firstSessionDate', firstSessionDate, StorageScope.GLOBAL);

	return firstSessionDate;
}