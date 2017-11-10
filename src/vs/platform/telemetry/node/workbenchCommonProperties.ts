/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { TPromise } from 'vs/base/common/winjs.base';
import * as uuid from 'vs/base/common/uuid';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { getMachineId } from 'vs/base/node/id';
import { resolveCommonProperties, machineIdStorageKey } from '../node/commonProperties';


export function resolveWorkbenchCommonProperties(storageService: IStorageService, commit: string, version: string, source: string): TPromise<{ [name: string]: string }> {
	return resolveCommonProperties(commit, version, source).then(result => {
		// __GDPR__COMMON__ "common.version.shell" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.version.shell'] = process.versions && (<any>process).versions['electron'];
		// __GDPR__COMMON__ "common.version.renderer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.version.renderer'] = process.versions && (<any>process).versions['chrome'];
		// __GDPR__COMMON__ "common.osVersion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.osVersion'] = os.release();

		const lastSessionDate = storageService.get('telemetry.lastSessionDate');
		const firstSessionDate = storageService.get('telemetry.firstSessionDate') || new Date().toUTCString();
		storageService.store('telemetry.firstSessionDate', firstSessionDate);
		storageService.store('telemetry.lastSessionDate', new Date().toUTCString());

		// __GDPR__COMMON__ "common.firstSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.firstSessionDate'] = firstSessionDate;
		// __GDPR__COMMON__ "common.lastSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.lastSessionDate'] = lastSessionDate;
		// __GDPR__COMMON__ "common.isNewSession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.isNewSession'] = !lastSessionDate ? '1' : '0';

		const promises: TPromise<any>[] = [];
		// __GDPR__COMMON__ "common.instanceId" : { "classification": "EndUserPseudonymizedInformation", "purpose": "FeatureInsight" }
		promises.push(getOrCreateInstanceId(storageService).then(value => result['common.instanceId'] = value));
		// __GDPR__COMMON__ "common.machineId" : { "classification": "EndUserPseudonymizedInformation", "purpose": "FeatureInsight" }
		promises.push(getOrCreateMachineId(storageService).then(value => result['common.machineId'] = value));

		return TPromise.join(promises).then(() => result);
	});
}

function getOrCreateInstanceId(storageService: IStorageService): TPromise<string> {
	let result = storageService.get('telemetry.instanceId') || uuid.generateUuid();
	storageService.store('telemetry.instanceId', result);
	return TPromise.as(result);
}

export function getOrCreateMachineId(storageService: IStorageService): TPromise<string> {
	let result = storageService.get(machineIdStorageKey);

	if (result) {
		return TPromise.as(result);
	}

	return getMachineId().then(result => {
		storageService.store(machineIdStorageKey, result);
		return result;
	});
}
