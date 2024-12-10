/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLinuxSnap, platform, Platform, PlatformToString } from '../../../base/common/platform.js';
import { env, platform as nodePlatform } from '../../../base/common/process.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ICommonProperties } from './telemetry.js';

function getPlatformDetail(hostname: string): string | undefined {
	if (platform === Platform.Linux && /^penguin(\.|$)/i.test(hostname)) {
		return 'chromebook';
	}

	return undefined;
}

export function resolveCommonProperties(
	release: string,
	hostname: string,
	arch: string,
	commit: string | undefined,
	version: string | undefined,
	machineId: string | undefined,
	sqmId: string | undefined,
	devDeviceId: string | undefined,
	isInternalTelemetry: boolean,
	product?: string
): ICommonProperties {
	const result: ICommonProperties = Object.create(null);

	// __GDPR__COMMON__ "common.machineId" : { "endPoint": "MacAddressHash", "classification": "EndUserPseudonymizedInformation", "purpose": "FeatureInsight" }
	result['common.machineId'] = machineId;
	// __GDPR__COMMON__ "common.sqmId" : { "endPoint": "SqmMachineId", "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight" }
	result['common.sqmId'] = sqmId;
	// __GDPR__COMMON__ "common.devDeviceId" : { "endPoint": "SqmMachineId", "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight" }
	result['common.devDeviceId'] = devDeviceId;
	// __GDPR__COMMON__ "sessionID" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['sessionID'] = generateUuid() + Date.now();
	// __GDPR__COMMON__ "commitHash" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['commitHash'] = commit;
	// __GDPR__COMMON__ "version" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['version'] = version;
	// __GDPR__COMMON__ "common.platformVersion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.platformVersion'] = (release || '').replace(/^(\d+)(\.\d+)?(\.\d+)?(.*)/, '$1$2$3');
	// __GDPR__COMMON__ "common.platform" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.platform'] = PlatformToString(platform);
	// __GDPR__COMMON__ "common.nodePlatform" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.nodePlatform'] = nodePlatform;
	// __GDPR__COMMON__ "common.nodeArch" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.nodeArch'] = arch;
	// __GDPR__COMMON__ "common.product" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.product'] = product || 'desktop';

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

	if (isLinuxSnap) {
		// __GDPR__COMMON__ "common.snap" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.snap'] = 'true';
	}

	const platformDetail = getPlatformDetail(hostname);

	if (platformDetail) {
		// __GDPR__COMMON__ "common.platformDetail" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.platformDetail'] = platformDetail;
	}

	return result;
}

export function verifyMicrosoftInternalDomain(domainList: readonly string[]): boolean {
	const userDnsDomain = env['USERDNSDOMAIN'];
	if (!userDnsDomain) {
		return false;
	}

	const domain = userDnsDomain.toLowerCase();
	return domainList.some(msftDomain => domain === msftDomain);
}
