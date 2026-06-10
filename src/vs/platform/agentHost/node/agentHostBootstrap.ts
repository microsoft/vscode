/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ConfigurationService } from '../../configuration/common/configurationService.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { IPolicyService, NullPolicyService } from '../../policy/common/policy.js';
import { IRequestService } from '../../request/common/request.js';
import { RequestService } from '../../request/node/requestService.js';

/**
 * Register `IPolicyService`, `IConfigurationService`, and `IRequestService`
 * into the agent host's DI container — the trio that `IAgentSdkDownloader`
 * depends on for proxy-aware downloads.
 *
 * Used by both entry points (`agentHostMain.ts` and `agentHostServerMain.ts`)
 * to avoid drift between them. The order of registration matters because
 * `RequestService` injects `IConfigurationService`; consumers (the downloader
 * itself, and through it `ClaudeAgentSdkService` / `CodexAgent`) must be
 * constructed AFTER this call.
 *
 * Reads the default profile's `settings.json` from `<userRoamingDataHome>` —
 * the same file the workbench writes user settings to. Initialization is
 * async because the settings file is read off disk.
 *
 * `NullPolicyService` matches the pattern used by sibling node-side processes
 * (server, CLI). Enterprise policy enforcement happens in the main process and
 * lands in `settings.json`; we don't re-resolve it here. `RequestService` runs
 * in `'local'` mode because the agent host runs on the user's machine.
 */
export async function registerAgentHostNetworkServices(
	diServices: ServiceCollection,
	fileService: IFileService,
	environmentService: INativeEnvironmentService,
	logService: ILogService,
	disposables: DisposableStore,
): Promise<void> {
	const policyService = new NullPolicyService();
	diServices.set(IPolicyService, policyService);
	const settingsResource = joinPath(environmentService.userRoamingDataHome, 'settings.json');
	const configurationService = disposables.add(new ConfigurationService(settingsResource, fileService, policyService, logService));
	await configurationService.initialize();
	diServices.set(IConfigurationService, configurationService);
	diServices.set(IRequestService, disposables.add(new RequestService('local', configurationService, environmentService, logService)));
}
