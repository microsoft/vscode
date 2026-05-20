/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ChatEndpointFamily, IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ProxyAgenticEndpoint } from '../../../../platform/endpoint/node/proxyAgenticEndpoint';
import { ILogService } from '../../../../platform/log/common/logService';
import { OpenAiFunctionTool } from '../../../../platform/networking/common/fetch';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { normalizeToolSchema } from '../../../tools/common/toolSchemaNormalizer';

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

/**
 * Build the `Error` thrown when a compaction request returns a non-success
 * `ChatResponse`. Surfaces enough diagnostic detail to identify the root
 * cause without the chat debug log: most notably
 * `RESPONSE_CONTAINED_NO_CHOICES` lives on `reason`, not `type` (which would
 * be `unknown` for that case).
 */
export function formatCompactionFailureError(response: { readonly type: string;[k: string]: unknown }): Error {
	const reason = typeof response.reason === 'string' ? response.reason : undefined;
	const requestId = typeof response.requestId === 'string' ? response.requestId : undefined;
	return new Error(`Background summarization request failed: type=${response.type}${reason ? `, reason=${reason}` : ''}${requestId ? `, requestId=${requestId}` : ''}`);
}

/**
 * Shared request options for trajectory-compaction calls.
 *
 * The compaction prompt instructs the model to emit a `<summary>` tag and to
 * NOT invoke any tools. The actual tool definitions are still forwarded so
 * the prompt prefix (system + tools + messages) is byte-identical to the
 * surrounding agent loop, which preserves cache hits on the main endpoint.
 *
 * The hard guarantee that the model never tries to call a tool lives in
 * `tool_choice: 'none'`. Text-summarization-only proxy models such as
 * `trajectory-compaction-v1` empirically return empty/invalid completions
 * (`RESPONSE_CONTAINED_NO_CHOICES`) when offered tools with the default
 * `tool_choice: 'auto'`. Foreground (`/compact`) has always set it; the
 * background auto-compaction path was missing it and is now aligned via this
 * shared helper.
 */
export type CompactionToolOpts = { readonly tool_choice: 'none'; readonly tools: OpenAiFunctionTool[] };

/**
 * Build the `{ tool_choice, tools }` slice of a compaction request body from
 * the agent loop's available tools, normalised against the target endpoint's
 * model family. Returns `undefined` when there are no tools to forward (in
 * which case `tool_choice` MUST also be omitted — sending `tool_choice` with
 * no tools is rejected by CAPI/proxy as a 400).
 */
export function buildCompactionToolOpts(
	availableTools: ReadonlyArray<LanguageModelToolInformation> | undefined,
	targetFamily: string,
	onWarn: (tool: string, rule: string) => void,
): CompactionToolOpts | undefined {
	if (!availableTools?.length) {
		return undefined;
	}
	const normalizedTools = normalizeToolSchema(
		targetFamily,
		availableTools.map(tool => ({
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.inputSchema && Object.keys(tool.inputSchema).length ? tool.inputSchema : undefined,
			},
			type: 'function' as const,
		})),
		onWarn,
	);
	if (!normalizedTools?.length) {
		return undefined;
	}
	return { tool_choice: 'none', tools: normalizedTools };
}
