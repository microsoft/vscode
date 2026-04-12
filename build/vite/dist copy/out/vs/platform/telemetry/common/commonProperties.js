/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isLinuxSnap, platform, PlatformToString } from '../../../base/common/platform.js';
import { env, platform as nodePlatform } from '../../../base/common/process.js';
import { generateUuid } from '../../../base/common/uuid.js';
function getPlatformDetail(hostname) {
    if (platform === 2 /* Platform.Linux */ && /^penguin(\.|$)/i.test(hostname)) {
        return 'chromebook';
    }
    return undefined;
}
export function resolveCommonProperties(release, hostname, arch, commit, version, machineId, sqmId, devDeviceId, isInternalTelemetry, releaseDate, product) {
    const result = Object.create(null);
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
    // __GDPR__COMMON__ "common.releaseDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
    result['common.releaseDate'] = releaseDate;
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
export function verifyMicrosoftInternalDomain(domainList) {
    const userDnsDomain = env['USERDNSDOMAIN'];
    if (!userDnsDomain) {
        return false;
    }
    const domain = userDnsDomain.toLowerCase();
    return domainList.some(msftDomain => domain === msftDomain);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uUHJvcGVydGllcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vY29tbW9uUHJvcGVydGllcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBWSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxHQUFHLEVBQUUsUUFBUSxJQUFJLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUc1RCxTQUFTLGlCQUFpQixDQUFDLFFBQWdCO0lBQzFDLElBQUksUUFBUSwyQkFBbUIsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUNyRSxPQUFPLFlBQVksQ0FBQztJQUNyQixDQUFDO0lBRUQsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQztBQUVELE1BQU0sVUFBVSx1QkFBdUIsQ0FDdEMsT0FBZSxFQUNmLFFBQWdCLEVBQ2hCLElBQVksRUFDWixNQUEwQixFQUMxQixPQUEyQixFQUMzQixTQUE2QixFQUM3QixLQUF5QixFQUN6QixXQUErQixFQUMvQixtQkFBNEIsRUFDNUIsV0FBK0IsRUFDL0IsT0FBZ0I7SUFFaEIsTUFBTSxNQUFNLEdBQXNCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFdEQsMkpBQTJKO0lBQzNKLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLFNBQVMsQ0FBQztJQUN2QyxzSkFBc0o7SUFDdEosTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHLEtBQUssQ0FBQztJQUMvQiw0SkFBNEo7SUFDNUosTUFBTSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsV0FBVyxD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