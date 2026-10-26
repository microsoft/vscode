/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../platform/github/electron-browser/githubService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IGitHubAccountClient } from '../../../../platform/github/common/account/account.js';
import { IGitHubAnonymousClient } from '../../../../platform/github/common/anonymous/anonymous.js';
import { GitHubClientOptions } from '../../../../platform/github/common/githubTypes.js';
import { ISharedProcessGitHubService } from '../../../../platform/github/common/remote/ipc.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IAuthenticationService } from '../../authentication/common/authentication.js';
import { WorkbenchGitHubService } from '../browser/githubService.js';
import { IWorkbenchGitHubService } from '../common/githubService.js';

export class NativeWorkbenchGitHubService extends WorkbenchGitHubService {
	constructor(
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IDefaultAccountService defaultAccountService: IDefaultAccountService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@ISharedProcessGitHubService private readonly sharedGitHubService: ISharedProcessGitHubService,
	) {
		super(authenticationService, defaultAccountService, logService, telemetryService, productService, configurationService);
	}

	override acquireAnonymousApiClient(signal: AbortSignal): Promise<IGitHubAnonymousClient> {
		return this.sharedGitHubService.acquireAnonymousClient(signal);
	}

	protected override acquireApiClient(options: GitHubClientOptions, signal: AbortSignal): Promise<IGitHubAccountClient> {
		return this.sharedGitHubService.acquireClient(options.authorization, signal);
	}
}

registerSingleton(IWorkbenchGitHubService, NativeWorkbenchGitHubService, InstantiationType.Delayed);
