/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { IRequestService } from '../../request/common/request.js';
import { AgentHostProxyResolver, IAgentHostProxyResolver } from './agentHostProxyResolver.js';
import { AgentHostRequestService } from './agentHostRequestService.js';

export interface IAgentHostNetworkServices {
	readonly proxyResolver: IAgentHostProxyResolver;
	readonly requestService: IRequestService;
}

/**
 * Register `IAgentHostProxyResolver` and `IRequestService` into the agent host's
 * DI container — the services that `IAgentSdkDownloader` (and proxy-aware
 * network diagnostics) depend on.
 *
 * Used by both entry points (`agentHostMain.ts` and `agentHostServerMain.ts`)
 * to avoid drift between them. The order of registration matters because
 * Consumers (the downloader itself, and through it `ClaudeAgentSdkService` /
 * `CodexAgent`) must be constructed AFTER this call. The resolver is bound to
 * `IAgentConfigurationService` after `AgentService` creates the host-owned
 * configuration service.
 */
export function registerAgentHostNetworkServices(
	diServices: ServiceCollection,
	logService: ILogService,
	disposables: DisposableStore,
): IAgentHostNetworkServices {
	const proxyResolver = disposables.add(new AgentHostProxyResolver(logService));
	diServices.set(IAgentHostProxyResolver, proxyResolver);
	const requestService = disposables.add(new AgentHostRequestService(logService, proxyResolver));
	diServices.set(IRequestService, requestService);
	return { proxyResolver, requestService };
}
