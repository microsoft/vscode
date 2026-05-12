/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ChatEndpointFamily, IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ProxyAgenticEndpoint } from '../../../../platform/endpoint/node/proxyAgenticEndpoint';
import { ILogService } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';

/** Default model name forwarded to the agentic proxy when `ConversationCompactionUseAgenticProxy` is set without an explicit `ConversationCompactionModel`. Registered on the copilot-proxy as `trajectory-compaction-v1` (routes to Fireworks deployment `accounts/msft/deployments/ihfptseo`). */
export const DEFAULT_COMPACTION_AGENTIC_PROXY_MODEL = 'trajectory-compaction-v1';

/**
 * Resolve the endpoint to use for trajectory (conversation-history) compaction
 * requests. Mirrors `SearchSubagentToolCallingLoop.getEndpoint()`:
 *
 *   - When `ConversationCompactionUseAgenticProxy` is enabled, the configured
 *     model (or `DEFAULT_COMPACTION_AGENTIC_PROXY_MODEL`) is wrapped in a
 *     `ProxyAgenticEndpoint` so the request is routed through the Copilot
 *     agentic proxy (which in turn fans out to providers like Fireworks).
 *   - When only `ConversationCompactionModel` is set, the endpoint provider is
 *     asked for that model directly. Any failure falls back to `mainEndpoint`
 *     so a misconfigured experiment never aborts the agent loop.
 *   - With neither configured, `mainEndpoint` is returned unchanged — i.e. the
 *     pre-existing behaviour of using the main agent model for compaction.
 *
 * The caller decides whether to apply provider-specific message/tool
 * adjustments (e.g. re-normalising tool schemas against the returned
 * endpoint's family).
 */
export async function resolveCompactionEndpoint(
	mainEndpoint: IChatEndpoint,
	instantiationService: IInstantiationService,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	endpointProvider: IEndpointProvider,
	logService: ILogService,
): Promise<IChatEndpoint> {
	const modelName = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ConversationCompactionModel, experimentationService);
	const useAgenticProxy = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ConversationCompactionUseAgenticProxy, experimentationService);

	if (useAgenticProxy) {
		const agenticProxyModel = modelName || DEFAULT_COMPACTION_AGENTIC_PROXY_MODEL;
		return instantiationService.createInstance(ProxyAgenticEndpoint, agenticProxyModel, undefined);
	}

	if (modelName) {
		try {
			return await endpointProvider.getChatEndpoint(modelName as ChatEndpointFamily);
		} catch (error) {
			logService.warn(`[compaction] Failed to get model ${modelName}, falling back to main agent endpoint: ${error}`);
			return mainEndpoint;
		}
	}

	return mainEndpoint;
}
