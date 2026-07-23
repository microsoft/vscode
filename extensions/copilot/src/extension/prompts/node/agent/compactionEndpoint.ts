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

/** Default CAPI model family used for trajectory-compaction when `ConversationUsePrismCompaction` is enabled. */
export const DEFAULT_COMPACTION_MODEL = 'trajectory-compaction';

/**
 * Resolve the endpoint to use for trajectory (conversation-history) compaction.
 * When `ConversationUsePrismCompaction` is on, resolves the configured model
 * (or `DEFAULT_COMPACTION_MODEL`) via the standard CAPI endpoint provider.
 * Falls back to `mainEndpoint` if no model is configured or resolution fails.
 */
export async function resolveCompactionEndpoint(
	mainEndpoint: IChatEndpoint,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	endpointProvider: IEndpointProvider,
	logService: ILogService,
): Promise<IChatEndpoint> {
	const modelName = configurationService.getExperimentBasedConfig(ConfigKey.ConversationCompactionModel, experimentationService);
	const usePrismCompaction = configurationService.getExperimentBasedConfig(ConfigKey.ConversationUsePrismCompaction, experimentationService);

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

/** `Error` for non-success compaction `ChatResponse`. `reason` carries the CAPI failure detail (e.g. `RESPONSE_CONTAINED_NO_CHOICES`). */
export function formatCompactionFailureError(response: { readonly type: string;[k: string]: unknown }): Error {
	const reason = typeof response.reason === 'string' ? response.reason : undefined;
	const requestId = typeof response.requestId === 'string' ? response.requestId : undefined;
	return new Error(`Background summarization request failed: type=${response.type}${reason ? `, reason=${reason}` : ''}${requestId ? `, requestId=${requestId}` : ''}`);
}

/**
 * Tool options for a compaction request. `tool_choice: 'none'` is the hard
 * guarantee that the model never tries to call a tool; text-summarization-only
 * models such as `trajectory-compaction` empirically return empty completions
 * (`RESPONSE_CONTAINED_NO_CHOICES`) when offered tools with default `'auto'`.
 */
export type CompactionToolOpts = { readonly tool_choice: 'none'; readonly tools: OpenAiFunctionTool[] };

/**
 * Normalise `availableTools` against `targetFamily` and return the
 * `{ tool_choice, tools }` slice for a compaction request body, or `undefined`
 * when there are no tools to forward.
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
 * Render and clean up the compaction prompt against `endpoint` — mirrors the
 * foreground `getSummary` flow (cache breakpoints → images → tool ids → family
 * strips). Returns `undefined` when there is nothing to summarize.
 *
 * If you add a cleanup step in the foreground path, mirror it here.
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
