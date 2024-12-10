/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import * as Platform from '../../../../base/common/platform.js';
import * as uuid from '../../../../base/common/uuid.js';
import { cleanRemoteAuthority } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { mixin } from '../../../../base/common/objects.js';
import { ICommonProperties, firstSessionDateStorageKey, lastSessionDateStorageKey, machineIdKey } from '../../../../platform/telemetry/common/telemetry.js';
import { Gesture } from '../../../../base/browser/touch.js';

/**
 * General function to help reduce the individuality of user agents
 * @param userAgent userAgent from browser window
 * @returns A simplified user agent with less detail
 */
function cleanUserAgent(userAgent: string): string {
	return userAgent.replace(/(\d+\.\d+)(\.\d+)+/g, '$1');
}

export function resolveWorkbenchCommonProperties(
	storageService: IStorageService,
	commit: string | undefined,
	version: string | undefined,
	isInternalTelemetry: boolean,
	remoteAuthority?: string,
	productIdentifier?: string,
	removeMachineId?: boolean,
	resolveAdditionalProperties?: () => { [key: string]: any }
): ICommonProperties {
	const result: ICommonProperties = Object.create(null);
	const firstSessionDate = storageService.get(firstSessionDateStorageKey, StorageScope.APPLICATION)!;
	const lastSessionDate = storageService.get(lastSessionDateStorageKey, StorageScope.APPLICATION)!;

	let machineId: string | undefined;
	if (!removeMachineId) {
		machineId = storageService.get(machineIdKey, StorageScope.APPLICATION);
		if (!machineId) {
			machineId = uuid.generateUuid();
			storageService.store(machineIdKey, machineId, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	} else {
		machineId = `Redacted-${productIdentifier ?? 'web'}`;
	}


	/**
	 * Note: In the web, session date information is fetched from browser storage, so these dates are tied to a specific
	 * browser and not the machine overall.
	 */
	// __GDPR__COMMON__ "common.firstSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.firstSessionDate'] = firstSessionDate;
	// __GDPR__COMMON__ "common.lastSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.lastSessionDate'] = lastSessionDate || '';
	// __GDPR__COMMON__ "common.isNewSession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.isNewSession'] = !lastSessionDate ? '1' : '0';
	// __GDPR__COMMON__ "common.remoteAuthority" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.remoteAuthority'] = cleanRemoteAuthority(remoteAuthority);

	// __GDPR__COMMON__ "common.machineId" : { "endPoint": "MacAddressHash", "classification": "EndUserPseudonymizedInformation", "purpose": "FeatureInsight" }
	result['common.machineId'] = machineId;
	// __GDPR__COMMON__ "sessionID" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['sessionID'] = uuid.generateUuid() + Date.now();
	// __GDPR__COMMON__ "commitHash" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['commitHash'] = commit;
	// __GDPR__COMMON__ "version" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['version'] = version;
	// __GDPR__COMMON__ "common.platform" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.platform'] = Platform.PlatformToString(Platform.platform);
	// __GDPR__COMMON__ "common.product" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.product'] = productIdentifier ?? 'web';
	// __GDPR__COMMON__ "common.userAgent" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.userAgent'] = Platform.userAgent ? cleanUserAgent(Platform.userAgent) : undefined;
	// __GDPR__COMMON__ "common.isTouchDevice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.isTouchDevice'] = String(Gesture.isTouchDevice());

	if (isInternalTelemetry) {
		// __GDPR__COMMON__ "common.msftInternal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		result['common.msftInternal'] = isInternalTelemetry;
	}

	// dynamic properties which value differs on each call
	let seq = 0;
	const startTime = Date.now();
	Object.defineProperties(result, {
		// __GDPR__COMMON__ "timestamp" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		'timestamp': {
			get: () => new Date(),
			enumerable: true
		},
		// __GDPR__COMMON__ "common.timesincesessionstart" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		'common.timesincesessionstart': {
			get: () => Date.now() - startTime,
			enumerable: true
		},
		// __GDPR__COMMON__ "common.sequence" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		'common.sequence': {
			get: () => seq++,
			enumerable: true
		}
	});

	if (resolveAdditionalProperties) {
		mixin(result, resolveAdditionalProperties());
	}

	return result;
}

