/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../telemetry/common/telemetryUtils.js';
import { createGitHubClientMetadata } from '../common/githubRequestMetadata.js';
import { GitHubService } from '../common/githubService.js';
import { RequestFetch } from '../common/types.js';

export class SharedProcessGitHubService extends GitHubService {
	constructor(
		fetch: RequestFetch | undefined,
		@IConfigurationService configurationService: IConfigurationService,
		@IProductService productService: IProductService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super({
			fetch,
			telemetrySource: 'sharedProcess',
			clientMetadata: createGitHubClientMetadata(productService, 'shared-process', 'node'),
			onDidChangeTelemetryLevel: Event.map(Event.filter(configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(TELEMETRY_SETTING_ID)
				|| event.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)
				|| event.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)
			), () => getTelemetryLevel(configurationService)),
		}, logService, telemetryService);
	}
}
