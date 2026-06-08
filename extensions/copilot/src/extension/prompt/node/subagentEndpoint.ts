/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatRequest } from 'vscode';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';

/**
 * Resolves the endpoint a subagent should run on, optimizing for low cost.
 *
 * Resolution order:
 * 1. The `preferredModel` (matched by `family` or `model` id), when it is available
 *    and supports tool calls.
 * 2. Otherwise the cheapest available tool-capable model by cost multiplier, but only
 *    when it is strictly cheaper than the main agent model. This guarantees a subagent
 *    is never routed to a model more expensive than simply reusing the main agent.
 * 3. Otherwise the main agent endpoint (the same model serving the parent request).
 *
 * The main agent endpoint is always a safe fallback, so this never throws for resolution
 * failures — it logs and degrades to the main agent.
 *
 * @param preferredModel The desired subagent model family or model id.
 * @param mainAgentRequest The parent chat request, used to resolve the main agent endpoint.
 * @param logPrefix Short label (e.g. "Search subagent") used in diagnostic log messages.
 */
export async function resolveLowCostSubagentEndpoint(
	endpointProvider: IEndpointProvider,
	preferredModel: string,
	mainAgentRequest: ChatRequest,
	logService: ILogService,
	logPrefix: string,
): Promise<IChatEndpoint> {
	const mainAgentEndpoint = await endpointProvider.getChatEndpoint(mainAgentRequest);

	let allEndpoints: IChatEndpoint[];
	try {
		allEndpoints = await endpointProvider.getAllChatEndpoints();
	} catch (error) {
		logService.warn(`${logPrefix}: failed to list chat endpoints, using main agent endpoint: ${error}`);
		return mainAgentEndpoint;
	}

	// 1. Prefer the requested model when it is available and tool-capable. Resolve by
	//    `family` or `model` id since the family-only `getChatEndpoint(string)` resolver
	//    only understands the `copilot-utility*` families, not real models.
	const exact = allEndpoints.find(e => (e.family === preferredModel || e.model === preferredModel) && e.supportsToolCalls);
	if (exact) {
		return exact;
	}

	// 2. Preferred model unavailable: pick the cheapest tool-capable model by cost
	//    multiplier, excluding the main agent itself. Only accept it when it is strictly
	//    cheaper than the main agent so we never upgrade cost.
	const mainMultiplier = mainAgentEndpoint.multiplier;
	const cheapest = allEndpoints
		.filter(e => e.supportsToolCalls && e.model !== mainAgentEndpoint.model && e.multiplier !== undefined)
		.sort((a, b) => a.multiplier! - b.multiplier!)[0];

	if (cheapest && (mainMultiplier === undefined || cheapest.multiplier! < mainMultiplier)) {
		logService.warn(`${logPrefix}: preferred model '${preferredModel}' unavailable, using cheaper model '${cheapest.model}' (multiplier ${cheapest.multiplier})`);
		return cheapest;
	}

	// 3. No cheaper model available: use the main agent endpoint.
	logService.warn(`${logPrefix}: preferred model '${preferredModel}' unavailable and no cheaper model found, using main agent endpoint`);
	return mainAgentEndpoint;
}
