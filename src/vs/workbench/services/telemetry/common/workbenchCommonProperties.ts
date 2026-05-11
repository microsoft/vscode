/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { resolveCommonProperties } from '../../../../platform/telemetry/common/commonProperties.js';
import { ICommonProperties, firstSessionDateStorageKey, lastSessionDateStorageKey } from '../../../../platform/telemetry/common/telemetry.js';
import { cleanRemoteAuthority } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { INodeProcess } from '../../../../base/common/platform.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';

export function resolveWorkbenchCommonProperties(
	storageService: IStorageService,
	productService: IProductService,
	environmentService: IWorkbenchEnvironmentService,
	release: string,
	hostname: string,
	machineId: string,
	sqmId: string,
	devDeviceId: string,
	isInternalTelemetry: boolean,
	process: INodeProcess,
): ICommonProperties {
	const { commit, version, date: releaseDate } = productService ?? {};
	const result = resolveCommonProperties(release, hostname, process.arch, commit, version, machineId, sqmId, devDeviceId, isInternalTelemetry, releaseDate);
	const firstSessionDate = storageService.get(firstSessionDateStorageKey, StorageScope.APPLICATION)!;
	const lastSessionDate = storageService.get(lastSessionDateStorageKey, StorageScope.APPLICATION)!;

	// __GDPR__COMMON__ "common.version.shell" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.version.shell'] = process.versions?.['electron'];
	// __GDPR__COMMON__ "common.version.renderer" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.version.renderer'] = process.versions?.['chrome'];
	// __GDPR__COMMON__ "common.firstSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.firstSessionDate'] = firstSessionDate;
	// __GDPR__COMMON__ "common.lastSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.lastSessionDate'] = lastSessionDate || '';
	// __GDPR__COMMON__ "common.isNewSession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.isNewSession'] = !lastSessionDate ? '1' : '0';
	// __GDPR__COMMON__ "common.remoteAuthority" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result['common.remoteAuthority'] = cleanRemoteAuthority(environmentService.remoteAuthority, productService);
	// __GDPR__COMMON__ "common.cli" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result['common.cli'] = !!process.env['VSCODE_CLI'];

	if (environmentService.isSessionsWindow) {
		// __GDPR__COMMON__ "common.isAgentsWindow" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		result['common.isAgentsWindow'] = true;
	}

	return result;
}
