/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, LanguageModelToolInformation } from 'vscode';
import { ChatMessage } from '@vscode/prompt-tsx/dist/base/output/rawTypes';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { isAnthropicFamily, isGeminiFamily } from '../../../../platform/endpoint/common/chatModelCapabilities';
import { ChatEndpointFamily, IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../../platform/log/common/logService';
import { OpenAiFunctionTool } from '../../../../platform/networking/common/fetch';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ThinkingData } from '../../../../platform/thinking/common/thinking';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ToolCallingLoop } from '../../../intents/node/toolCallingLoop';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { normalizeToolSchema } from '../../../tools/common/toolSchemaNormalizer';
import { renderPromptElement } from '../base/promptRenderer';
import { ConversationHistorySummarizationPrompt, replaceImageContentWithPlaceholders, stripCacheBreakpoints, stripToolSearchMessages, SummarizedConversationHistoryPropsBuilder } from './summarizedConversationHistory';

/** Default CAPI model family used for prism trajectory-compaction when `ConversationUsePrismCompaction` is enabled without an explicit `ConversationCompactionModel`. The model is served via the standard Copilot CAPI chat-completions endpoint. */
export const DEFAULT_COMPACTION_MODEL = 'trajectory-compaction';

/**
 * Resolve the endpoint to use for trajectory (conversation-history) compaction
 * requests:
 *
 *   - When `ConversationUsePrismCompaction` is enabled, the configured
 *     model (or `DEFAULT_COMPACTION_MODEL`) is resolved through the standard
 *     CAPI endpoint provider — i.e. the same path as any other Copilot chat
 *     model. The resulting endpoint routes requests via
 *     `RequestType.ChatCompletions`.
 *   - When only `ConversationCompactionModel` is set, the endpoint provider is
 *     asked for that model directly.
 *   - With neither configured, `mainEndpoint` is returned unchanged — i.e. the
 *     pre-existing behaviour of using the main agent model for compaction.
 *
 * Any failure to resolve the requested model falls back to `mainEndpoint` so a
 * misconfigured experiment never aborts the agent loop.
 *
 * The caller decides whether to apply provider-specific message/tool
 * adjustments (e.g. re-normalising tool schemas against the returned
 * endpoint's family).
 */
export async function resolveCompactionEndpoint(
	mainEndpoint: IChatEndpoint,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	endpointProvider: IEndpointProvider,
	logService: ILogService,
): Promise<IChatEndpoint> {
	const modelName = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ConversationCompactionModel, experimentationService);
	const usePrismCompaction = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ConversationUsePrismCompaction, experimentationService);

	const resolvedModelName = usePrismCompaction
		? (modelName || DEFAULT_COMPACTION_MODEL)
		: modelName;

	if (!resolvedModelName) {
		return mainEndpoint;
	}

	try {
		return await endpointProvider.getChatEndpoint(resolvedModelName as ChatEndpointFamily);
	} catch (error) {
		logService.warn(`[compaction] Failed to get model ${resolvedModelName}, falling back to main agent endpoint: ${error}`);
		return mainEndpoint;
	}
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

/**
 * Render conversation-history compaction messages against an arbitrary
 * endpoint, mirroring the cleanup the foreground (`/compact`) path applies in
 * `ConversationHistorySummarizer.getSummary`.
 *
 * Used from the background auto-compaction path when the resolved compaction
 * endpoint differs from the main agent endpoint (e.g. when prism compaction
 * is enabled): the main-agent render is shaped for the main endpoint's model
 * family and the target model would either reject it or return empty
 * completions.
 *
 * Returns `undefined` when there is nothing to summarize (no rounds yet).
 *
 * NOTE: The cleanup orchestration (cache breakpoints → images → tool ids →
 * family-specific strips) is duplicated with the foreground path. Each
 * cleanup step is a single function call, so the duplication is glue rather
 * than logic. If you add a step in one place, mirror it here.
 */
export async function renderCompactionMessages(
	endpoint: IChatEndpoint,
	promptContext: IBuildPromptContext,
	tools: ReadonlyArray<LanguageModelToolInformation> | undefined,
	instantiationService: IInstantiationService,
	logService: ILogService,
	token: CancellationToken,
): Promise<{ messages: ChatMessage[]; summarizedToolCallRoundId: string; summarizedThinking?: ThinkingData } | undefined> {
	const propsInfo = instantiationService.createInstance(SummarizedConversationHistoryPropsBuilder).getProps({
		priority: 1,
		endpoint,
		location: ChatLocation.Agent,
		promptContext,
		tools,
		maxToolResultLength: Infinity,
	});
	if (!propsInfo) {
		return undefined;
	}

	const rendered = await renderPromptElement(
		instantiationService,
		endpoint,
		ConversationHistorySummarizationPrompt,
		{ ...propsInfo.props, enableCacheBreakpoints: false, simpleMode: false },
		undefined,
		token,
	);
	const prompt = rendered.messages;

	stripCacheBreakpoints(prompt);
	replaceImageContentWithPlaceholders(prompt);

	let messages = ToolCallingLoop.stripInternalToolCallIds(prompt);

	// Anthropic rejects custom client-side tool_search tool_use/tool_result pairs
	// when tool search isn't enabled on the request — same reasoning as foreground.
	if (isAnthropicFamily(endpoint)) {
		messages = stripToolSearchMessages(messages);
	}

	// Gemini requires every function_call to have a matching function_response;
	// strip orphaned tool calls left over from prompt-tsx pruning.
	if (isGeminiFamily(endpoint)) {
		const v = ToolCallingLoop.validateToolMessagesCore(messages, { stripOrphanedToolCalls: true });
		messages = v.messages;
		if (v.strippedToolCallCount > 0) {
			logService.info(`[compaction] Stripped ${v.strippedToolCallCount} orphaned tool calls from compaction prompt`);
		}
	}

	return {
		messages,
		summarizedToolCallRoundId: propsInfo.summarizedToolCallRoundId,
		summarizedThinking: propsInfo.summarizedThinking,
	};
}
