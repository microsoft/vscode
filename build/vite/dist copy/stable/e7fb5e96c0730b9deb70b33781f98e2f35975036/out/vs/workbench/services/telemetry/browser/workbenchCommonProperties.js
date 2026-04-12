/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as Platform from '../../../../base/common/platform.js';
import * as uuid from '../../../../base/common/uuid.js';
import { cleanRemoteAuthority } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { mixin } from '../../../../base/common/objects.js';
import { firstSessionDateStorageKey, lastSessionDateStorageKey, machineIdKey } from '../../../../platform/telemetry/common/telemetry.js';
import { Gesture } from '../../../../base/browser/touch.js';
/**
 * General function to help reduce the individuality of user agents
 * @param userAgent userAgent from browser window
 * @returns A simplified user agent with less detail
 */
function cleanUserAgent(userAgent) {
    return userAgent.replace(/(\d+\.\d+)(\.\d+)+/g, '$1');
}
export function resolveWorkbenchCommonProperties(storageService, productService, isInternalTelemetry, remoteAuthority, resolveAdditionalProperties) {
    const { commit, version, embedderIdentifier: productIdentifier, removeTelemetryMachineId: removeMachineId } = productService ?? {};
    const result = Object.create(null);
    const firstSessionDate = storageService.get(firstSessionDateStorageKey, -1 /* StorageScope.APPLICATION */);
    const lastSessionDate = storageService.get(lastSessionDateStorageKey, -1 /* StorageScope.APPLICATION */);
    let machineId;
    if (!removeMachineId) {
        machineId = storageService.get(machineIdKey, -1 /* StorageScope.APPLICATION */);
        if (!machineId) {
            machineId = uuid.generateUuid();
            storageService.store(machineIdKey, machineId, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
    }
    else {
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
    result['common.remoteAuthority'] = cleanRemoteAuthority(remoteAuthority, productService);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoQ29tbW9uUHJvcGVydGllcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZWxlbWV0cnkvYnJvd3Nlci93b3JrYmVuY2hDb21tb25Qcm9wZXJ0aWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sS0FBSyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFxQiwwQkFBMEIsRUFBRSx5QkFBeUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM1SixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHNUQ7Ozs7R0FJRztBQUNILFNBQVMsY0FBYyxDQUFDLFNBQWlCO0lBQ3hDLE9BQU8sU0FBUyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUN2RCxDQUFDO0FBRUQsTUFBTSxVQUFVLGdDQUFnQyxDQUMvQyxjQUErQixFQUMvQixjQUErQixFQUMvQixtQkFBNEIsRUFDNUIsZUFBd0IsRUFDeEIsMkJBQThEO0lBRTlELE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGlCQUFpQixFQUFFLHdCQUF3QixFQUFFLGVBQWUsRUFBRSxHQUFHLGNBQWMsSUFBSSxFQUFFLENBQUM7SUFDbkksTUFBTSxNQUFNLEdBQXNCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEQsTUFBTSxnQkFBZ0IsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFD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