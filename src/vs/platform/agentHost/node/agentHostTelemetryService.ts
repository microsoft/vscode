/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hostname, release } from 'os';
import { toDisposable, type DisposableStore } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { getDevDeviceId, getMachineId, getSqmMachineId } from '../../../base/node/id.js';
import { ConfigurationService } from '../../configuration/common/configurationService.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService, ILoggerService } from '../../log/common/log.js';
import { NullPolicyService } from '../../policy/common/policy.js';
import { IProductService } from '../../product/common/productService.js';
import { OneDataSystemAppender } from '../../telemetry/node/1dsAppender.js';
import { resolveCommonProperties } from '../../telemetry/common/commonProperties.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { TelemetryLogAppender } from '../../telemetry/common/telemetryLogAppender.js';
import { TelemetryService } from '../../telemetry/common/telemetryService.js';
import { getPiiPathsFromEnvironment, isInternalTelemetry, isLoggingOnly, NullTelemetryService, supportsTelemetry, type ITelemetryAppender } from '../../telemetry/common/telemetryUtils.js';

export interface IAgentHostTelemetryServiceOptions {
	readonly environmentService: INativeEnvironmentService;
	readonly productService: IProductService;
	readonly fileService: IFileService;
	readonly loggerService: ILoggerService | undefined;
	readonly logService: ILogService;
	readonly disposables: DisposableStore;
	readonly disableTelemetry?: boolean;
}

export async function createAgentHostTelemetryService(options: IAgentHostTelemetryServiceOptions): Promise<ITelemetryService> {
	const { environmentService, productService, fileService, loggerService, logService, disposables } = options;
	if (options.disableTelemetry || !loggerService || !supportsTelemetry(productService, environmentService)) {
		return NullTelemetryService;
	}

	const configurationService = disposables.add(new ConfigurationService(joinPath(environmentService.appSettingsHome, 'settings.json'), fileService, new NullPolicyService(), logService));
	await configurationService.initialize();

	const appenders: ITelemetryAppender[] = [
		disposables.add(new TelemetryLogAppender('', false, loggerService, environmentService, productService)),
	];
	const internalTelemetry = isInternalTelemetry(productService, configurationService);
	if (!isLoggingOnly(productService, environmentService) && productService.aiConfig?.ariaKey) {
		const collectorAppender = new OneDataSystemAppender(undefined, internalTelemetry, 'monacoworkbench', null, productService.aiConfig.ariaKey);
		disposables.add(toDisposable(() => { void collectorAppender.flush(); }));
		appenders.push(collectorAppender);
	}

	const [machineId, sqmId, devDeviceId] = await Promise.all([
		getMachineId(error => logService.error(error)),
		getSqmMachineId(error => logService.error(error)),
		getDevDeviceId(error => logService.error(error)),
	]);

	return disposables.add(new TelemetryService({
		appenders,
		sendErrorTelemetry: true,
		commonProperties: resolveCommonProperties(release(), hostname(), process.arch, productService.commit, productService.version, machineId, sqmId, devDeviceId, internalTelemetry, productService.date),
		piiPaths: getPiiPathsFromEnvironment(environmentService),
	}, configurationService, productService));
}
