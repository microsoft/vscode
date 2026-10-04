/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IReference, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostService } from '../../native/common/native.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../telemetry/common/telemetryUtils.js';
import { createGitHubClientMetadata } from '../common/githubRequestMetadata.js';
import { GitHubService, IGitHubAnonymousClient } from '../common/githubService.js';
import { GitHubAnonymousClientOptions } from '../common/githubTypes.js';
import { createFetch } from './githubFetch.js';

export class SharedProcessGitHubService extends GitHubService {

	private readonly publicAnonymousClient = this._register(new MutableDisposable<IReference<IGitHubAnonymousClient>>());

	constructor(
		@INativeHostService nativeHostService: INativeHostService,
		@IConfigurationService configurationService: IConfigurationService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super({
			fetch: createFetch(nativeHostService, configurationService, environmentService, logService),
			telemetrySource: 'sharedProcess',
			clientMetadata: createGitHubClientMetadata(productService, 'shared-process', 'node'),
			onDidChangeTelemetryLevel: Event.map(Event.filter(configurationService.onDidChangeConfiguration, event =>
				event.affectsConfiguration(TELEMETRY_SETTING_ID)
				|| event.affectsConfiguration(TELEMETRY_OLD_SETTING_ID)
				|| event.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)
			), () => getTelemetryLevel(configurationService)),
		}, logService, telemetryService);
	}

	override acquireAnonymousClient(options: GitHubAnonymousClientOptions): IReference<IGitHubAnonymousClient> {
		const reference = super.acquireAnonymousClient(options);
		if (reference.object.apiBaseUri === 'https://api.github.com') {
			this.publicAnonymousClient.value ??= super.acquireAnonymousClient({ apiBaseUri: reference.object.apiBaseUri });
		}
		return reference;
	}
}
