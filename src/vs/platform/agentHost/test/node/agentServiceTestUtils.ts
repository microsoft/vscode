/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { type IAgentCustomizationSettingsRegistration } from '../../common/agentCustomizationSettings.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from '../../node/agentHostFileMonitorService.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { AgentService } from '../../node/agentService.js';
import { createAgentService } from '../../node/agentServiceComposition.js';
import { ICopilotApiService } from '../../node/shared/copilotApiService.js';

export function createTestAgentService(
	logService: ILogService,
	fileService: IFileService,
	sessionDataService: ISessionDataService,
	productService: IProductService,
	gitService: IAgentHostGitService,
	rootConfigResource?: URI,
	telemetryService: ITelemetryService = NullTelemetryService,
	fileMonitorService?: IAgentHostFileMonitorService,
	copilotApiService?: ICopilotApiService,
	fetchFn: typeof globalThis.fetch = globalThis.fetch,
	providerConfigurations: readonly IAgentCustomizationSettingsRegistration[] = [],
	hostLaunchKind = AgentHostLaunchKind.Unknown,
	storageResource?: URI,
	orchestratorDatabase?: IAgentHostDatabase,
): AgentService {
	const effectiveFileMonitorService = fileMonitorService ?? new AgentHostFileMonitorService(fileService, logService);
	const proxyResolver: IAgentHostProxyResolver = {
		_serviceBrand: undefined,
		onDidRegisterConnection: Event.None,
		onDidChangeConfiguration: Event.None,
		register: () => Disposable.None,
		bindConfigurationService: () => { },
		getConfigurationValue: () => undefined,
		resolveProxy: async () => undefined,
		fetch: fetchFn,
	};
	const services = new ServiceCollection(
		[ILogService, logService],
		[IFileService, fileService],
		[ISessionDataService, sessionDataService],
		[IProductService, productService],
		[IAgentHostGitService, gitService],
		[ITelemetryService, telemetryService],
		[IAgentHostFileMonitorService, effectiveFileMonitorService],
		[IAgentHostProxyResolver, proxyResolver],
	);
	const instantiationService = new InstantiationService(services, /*strict*/ true);
	const options = {
		rootConfigResource,
		copilotApiService,
		providerConfigurations,
		hostLaunchKind,
		storageResource,
		orchestratorDatabase,
	};
	const service = createAgentService(
		options,
		services,
		instantiationService,
		fetchFn,
		logService,
		productService,
		fileMonitorService ? [instantiationService] : [effectiveFileMonitorService, instantiationService],
	);
	return service;
}
