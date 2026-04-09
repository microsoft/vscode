/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContentBlockParam, DocumentBlockParam, ImageBlockParam, MessageParam, RedactedThinkingBlockParam, TextBlockParam, ThinkingBlockParam, ToolReferenceBlockParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources';
import { Raw } from '@vscode/prompt-tsx';
import { Response, withStreamIdleTimeout } from '../../../platform/networking/common/fetcherService';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { SSEParser } from '../../../util/vs/base/common/sseParser';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation } from '../../chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { AnthropicMessagesTool, ContextManagementResponse, CUSTOM_TOOL_SEARCH_NAME, getContextManagementFromConfig, isAnthropicContextEditingEnabled, isAnthropicCustomToolSearchEnabled, isAnthropicToolSearchEnabled, ServerToolUse, TOOL_SEARCH_TOOL_NAME, TOOL_SEARCH_TOOL_TYPE, ToolSearchToolResult } from '../../networking/common/anthropic';
import { FinishedCallback, IIPCodeCitation, IResponseDelta } from '../../networking/common/fetch';
import { IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody } from '../../networking/common/networking';
import { ChatCompletion, FinishedCompletionReason, rawMessageToCAPI } from '../../networking/common/openai';
import { IToolDeferralService } from '../../networking/common/toolDeferralService';
import { sendEngineMessagesTelemetry } from '../../networking/node/chatStream';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';

/**
 * Build the `input_schema` for an Anthropic tool from an arbitrary JSON Schema
 * object. Ensures `type: 'object'` and `properties` default, preserves extra
 * keys like `$defs` and `additionalProperties`, and strips `$schema` which the
 * Anthropic API rejects.
 */
export function buildToolInputSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> & { type: 'object' } {
	if (!schema) {
		return { type: 'object', properties: {} };
	}
	const { $schema: _, ...rest } = schema;
	return { type: 'object', properties: {}, ...rest };
}

/** IP Code Citation annotation from Messages API copilot_annotations */
interface AnthropicIPCodeCitation {
	id: number;
	start_offset: number;
	end_offset: number;
	details: Record<string, unknown>;
	citations: {
		snippet: string;
		url: string;
		ip_type?: string;
		license: string;
	};
}

interface AnthropicStreamEvent {
	type: string;
	message?: {
		id: string;
		type: string;
		role: string;
		content: ContentBlockParam[];
		model: string;
		stop_reason: string | null;
		stop_sequence: string | null;
		usage: {
			input_tokens: number;
			output_tokens: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
			server_tool_use?: {
				tool_search_requests?: number;
			};
		};
	};
	index?: number;
	content_block?: ContentBlockParam | ThinkingBlockParam | RedactedThinkingBlockParam | ServerToolUse | ToolSearchToolResult;
	delta?: {
		type: string;
		text?: string;
		partial_json?: string;
		thinking?: string;
		signature?: string;
		stop_reason?: string;
		stop_sequence?: string;
	};
	copilot_annotations?: {
		IPCodeCitations?: AnthropicIPCodeCitation[];
	};
	usage?: {
		output_tokens: number;
		input_tokens?: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
		server_tool_use?: {
			tool_search_requests?: number;
		};
	};
	context_management?: ContextManagementResponse;
}

export function createMessagesRequestBody(accessor: ServicesAccessor, options: ICreateEndpointBodyOptions, model: string, endpoint: IChatEndpoint): IEndpointBody {
	const configurationService = accessor.get(IConfigurationService);
	const experimentationService = accessor.get(IExperimentationService);
	const toolDeferralService = accessor.get(IToolDeferralService);

	const toolSearchEnabled = isAnthropicToolSearchEnabled(endpoint, configurationService);
	const customToolSearchEnabled = isAnthropicCustomToolSearchEnabled(endpoint, configurationService, experimentationService);

	// Split tools into non-deferred and deferred up front so we can build finalTools
	// with non-deferred first. This ensures the cache_control breakpoint on the last
	// non-deferred tool caches the maximum stable prefix.
	const nonDeferredTools: AnthropicMessagesTool[] = [];
	const deferredTools: AnthropicMessagesTool[] = [];
	if (options.requestOptions?.tools) {
		for (const tool of options.requestOptions.tools) {
			if (!tool.function.name || tool.function.name.length === 0) {
				continue;
			}
			const isDeferred = options.modelCapabilities?.enableToolSearch && toolSearchEnabled && !toolDeferralService.isNonDeferredTool(tool.function.name);
			const anthropicTool: AnthropicMessagesTool = {
				name: tool.function.name,
				description: tool.function.description || '',
				input_schema: buildToolInputSchema(tool.function.parameters as Record<string, unknown> | undefined),
				...(isDeferred ? { defer_loading: true } : {}),
			};
			(isDeferred ? deferredTools : nonDeferredTools).push(anthropicTool);
		}
	}

	// Build final tools array, adding tool search tool if enabled
	const finalTools: AnthropicMessagesTool[] = [];
	if (options.modelCapabilities?.enableToolSearch && toolSearchEnabled && !customToolSearchEnabled) {
		// Server-side tool search: use the built-in tool_search_tool_regex
		finalTools.push({ name: TOOL_SEARCH_TOOL_NAME, type: TOOL_SEARCH_TOOL_TYPE, defer_loading: false });
	}
	// When customToolSearchEnabled, the search_tools tool is already in the
	// anthropicTools array (registered as a model-specific VS Code tool) and will handle
	// tool search client-side. Deferred tools still have defer_loading: true so the model
	// knows to use the search tool to discover them.
	finalTools.push(...nonDeferredTools, ...deferredTools);

	// Thinking is enabled only when options.modelCapabilities?.enableThinking is true, a non-zero thinking budget
	// is configured for the model, and the model supports thinking. reasoningEffort (if present)
	// is used only to configure the effort level when thinking is enabled, not to gate it.
	const reasoningEffort = options.modelCapabilities?.reasoningEffort;
	let thinkingConfig: { type: 'enabled' | 'adaptive'; budget_tokens?: number } | undefined;
	if (options.modelCapabilities?.enableThinking) {
		const configuredBudget = configurationService.getConfig(ConfigKey.AnthropicThinkingBudget);
		const thinkingExplicitlyDisabled = configuredBudget === 0;
		if (endpoint.supportsAdaptiveThinking && !thinkingExplicitlyDisabled) {
			thinkingConfig = { type: 'adaptive' };
		} else if (!thinkingExplicitlyDisabled && endpoint.maxThinkingBudget && endpoint.minThinkingBudget) {
			const maxTokens = options.postOptions.max_tokens ?? 1024;
			const minBudget = endpoint.minThinkingBudget ?? 1024;
			const normalizedBudget = (configuredBudget && configuredBudget > 0)
				? (configuredBudget < minBudget ? minBudget : configuredBudget)
				: undefined;
			const maxBudget = endpoint.maxThinkingBudget ?? 32000;
			const thinkingBudget = normalizedBudget
				? Math.min(maxBudget, maxTokens - 1, normalizedBudget)
				: undefined;
			if (thinkingBudget) {
				thinkingConfig = { type: 'enabled', budget_tokens: thinkingBudget };
			}
		}
	}

	const thinkingEnabled = !!thinkingConfig;
	let effort: 'low' | 'medium' | 'high' | undefined;
	if (thinkingConfig && endpoint.supportsReasoningEffort?.length) {
		const candidateEffort = configurationService.getConfig(ConfigKey.TeamInternal.AnthropicThinkingEffort) ?? reasoningEffort;
		if (candidateEffort === 'low' || candidateEffort === 'medium' || candidateEffort === 'high') {
			effort = candidateEffort;
		}
	}

	// Build context management configuration
	const contextManagement = options.modelCapabilities?.enableContextEditing && isAnthropicContextEditingEnabled(endpoint, configurationService, experimentationService)
		? getContextManagementFromConfig(configurationService, experimentationService, thinkingEnabled)
		: undefined;

	const logService = accessor.get(ILogService);
	const telemetryService = accessor.get(ITelemetryService);
	// TODO: Ideally the custom tool_search tool should filter results itself, but it doesn't
	// have access to the enabled tools for the request. For now, filter tool_reference blocks
	// here against the actual tools sent to Anthropic to avoid 400 errors from unknown tool names.
	const validToolNames = finalTools.length > 0 ? new Set(finalTools.map(t => t.name)) : undefined;
	const messagesResult = rawMessagesToMessagesAPI(options.messages, customToolSearchEnabled ? validToolNames : undefined);

	// Add cache_control to the last tool and last system block so the stable tools+system
	// prefix is cached across turns. Per the Anthropic docs, cache prefixes are created in
	// order: tools → system → messages, and a max of 4 cache_control blocks is allowed.
	// Count existing cache_control in messages+system first to stay within the limit.
	addToolsAndSystemCacheControl(finalTools, messagesResult);

	// Guard: The Anthropic Messages API requires the conversation to end with a user message.
	// A trailing assistant message is treated as a prefill request, which is not supported
	// and will return a 400 error. This catches upstream edge cases where isContinuation
	// skips the UserMessage or validateToolMessages drops trailing tool messages.
	const lastMessage = messagesResult.messages.at(-1);
	if (lastMessage && lastMessage.role === 'assistant') {
		logService.warn(`[messagesAPI] Trailing assistant message detected — appending synthetic user message to prevent prefill error. Total messages: ${messagesResult.messages.length}`);

		/* __GDPR__
			"messagesApi.trailingAssistantGuard" : {
				"owner": "bhavyaus",
				"comment": "Tracks when a trailing assistant message is detected and a synthetic user message is appended to prevent prefill errors",
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model being used" },
				"location": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat location (agent, panel, etc)" },
				"messageCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of messages in the conversation" }
			}
		*/
		telemetryService.sendMSFTTelemetryEvent('messagesApi.trailingAssistantGuard',
			{ model, location: ChatLocation.toString(options.location) },
			{ messageCount: messagesResult.messages.length }
		);

		messagesResult.messages.push({
			role: 'user',
			content: [{ type: 'text', text: 'Please continue.' }],
		});
	}

	return {
		model,
		...messagesResult,
		stream: true,
		tools: finalTools.length > 0 ? finalTools : undefined,
		top_p: options.postOptions.top_p,
		max_tokens: options.postOptions.max_tokens,
		thinking: thinkingConfig,
		...(effort ? { output_config: { effort } } : {}),
		...(contextManagement ? { context_management: contextManagement } : {}),
	};
}

export function rawMessagesToMessagesAPI(messages: readonly Raw.ChatMessage[], validToolNames?: Set<string>): { messages: MessageParam[]; system?: TextBlockParam[] } {
	const unmergedMessages: MessageParam[] = [];
	const systemBlocks: TextBlockParam[] = [];
	const toolCallIdToName = new Map<string, string>();

	for (const message of messages) {
		switch (message.role) {
			case Raw.ChatRole.System: {
				systemBlocks.push(...rawContentToAnthropicContent(message.content).filter((c): c is TextBlockParam => c.type === 'text'));
				break;
			}
			case Raw.ChatRole.User: {
				const content = rawContentToAnthropicContent(message.content);
				if (content.length > 0) {
					unmergedMessages.push({
						role: 'user',
						content,
					});
				}
				break;
			}
			case Raw.ChatRole.Assistant: {
				const content = rawContentToAnthropicContent(message.content);
				if (message.toolCalls) {
					for (const toolCall of message.toolCalls) {
						let parsedInput: Record<string, unknown> = {};
						try {
							parsedInput = JSON.parse(toolCall.function.arguments);
						} catch {
							// Keep empty object if parse fails
						}
						content.push({
							type: 'tool_use',
							id: toolCall.id,
							name: toolCall.function.name,
							input: parsedInput,
						});
						toolCallIdToName.set(toolCall.id, toolCall.function.name);
					}
				}

				if (content.length > 0) {
					unmergedMessages.push({
						role: 'assistant',
						content,
					});
				}
				break;
			}
			case Raw.ChatRole.Tool: {
				if (message.toolCallId) {
					const toolContent = rawContentToAnthropicContent(message.content);
					// Extract cache_control from content blocks - it belongs on the tool_result block, not inner content
					let hasCacheControl = false;
					for (const block of toolContent) {
						if (contentBlockSupportsCacheControl(block) && block.cache_control) {
							hasCacheControl = true;
							delete block.cache_control;
						}
					}

					// If this is a custom tool search result and validToolNames is provided,
					// attempt to convert the text content into tool_reference blocks per the
					// Anthropic custom tool search spec. When validToolNames is undefined
					// (i.e. tool_reference conversion is disabled/unsupported for this
					// request), fall through to the regular text/image filter to avoid
					// sending unsupported content types.
					const isCustomToolSearch = validToolNames && toolCallIdToName.get(message.toolCallId) === CUSTOM_TOOL_SEARCH_NAME;
					const toolReferenceContent = isCustomToolSearch
						? tryParseToolReferences(toolContent, validToolNames)
						: undefined;

					const validContent = toolReferenceContent
						?? toolContent.filter((c): c is TextBlockParam | ImageBlockParam | DocumentBlockParam =>
							(c.type === 'text' || c.type === 'image' || c.type === 'document') && !(c.type === 'text' && c.text.trim() === '')
						);

					const toolResultBlock: ToolResultBlockParam = {
						type: 'tool_result',
						tool_use_id: message.toolCallId,
						content: validContent.length > 0 ? validContent : undefined,
					};
					if (hasCacheControl) {
						toolResultBlock.cache_control = { type: 'ephemeral' };
					}
					unmergedMessages.push({
						role: 'user',
						content: [toolResultBlock],
					});
				}
				break;
			}
		}
	}

	const mergedMessages: MessageParam[] = [];
	for (const message of unmergedMessages) {
		const lastMessage = mergedMessages[mergedMessages.length - 1];
		if (lastMessage && lastMessage.role === message.role) {
			const prevContent = Array.isArray(lastMessage.content) ? lastMessage.content : [{ type: 'text' as const, text: lastMessage.content }];
			const newContent = Array.isArray(message.content) ? message.content : [{ type: 'text' as const, text: message.content }];
			lastMessage.content = [...prevContent, ...newContent];
		} else {
			mergedMessages.push(message);
		}
	}

	return {
		messages: mergedMessages,
		...(systemBlocks.length ? { system: systemBlocks } : {}),
	};
}

/**
 * Parses tool result content from the custom tool search tool into
 * tool_reference content blocks that the Anthropic API understands.
 * Expects a single text block containing a JSON array of tool name strings.
 * @see https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool#custom-tool-search-implementation
 */
function tryParseToolReferences(content: ContentBlockParam[], validToolNames?: Set<string>): ToolReferenceBlockParam[] | undefined {
	if (content.length !== 1 || content[0].type !== 'text') {
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content[0].text);
	} catch {
		return undefined;
	}

	if (!Array.isArray(parsed)) {
		return undefined;
	}

	return parsed
		.filter((name): name is string => typeof name === 'string' && (!validToolNames || validToolNames.has(name)))
		.map((name): ToolReferenceBlockParam => ({ type: 'tool_reference', tool_name: name }));
}

function rawContentToAnthropicContent(content: readonly Raw.ChatCompletionContentPart[]): ContentBlockParam[] {
	const convertedContent: ContentBlockParam[] = [];
	// Track pending cache_control that couldn't be attached to a preceding block
	let pendingCacheControl = false;

	for (const part of content) {
		switch (part.type) {
			case Raw.ChatCompletionContentPartKind.Text:
				if (part.text.trim()) {
					convertedContent.push({ type: 'text', text: part.text });
				}
				break;
			case Raw.ChatCompletionContentPartKind.Image: {
				const url = part.imageUrl.url;
				// Parse data URL: data:image/png;base64,<data>
				const match = url.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
				if (match) {
					convertedContent.push({
						type: 'image',
						source: {
							type: 'base64',
							media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
							data: match[2],
						}
					});
				} else if (url.startsWith('https://')) {
					// URL image source: https://platform.claude.com/docs/en/api/messages#url_image_source
					convertedContent.push({
						type: 'image',
						source: {
							type: 'url',
							url,
						}
					});
				}
				break;
			}
			case Raw.ChatCompletionContentPartKind.CacheBreakpoint: {
				const previousBlock = convertedContent.at(-1);
				if (previousBlock && contentBlockSupportsCacheControl(previousBlock)) {
					previousBlock.cache_control = { type: 'ephemeral' };
				} else {
					// No preceding block to attach to — defer until the next
					// cacheable content block is added, or silently drop it.
					// Previously this created a whitespace-only text block which
					// the Anthropic API rejects with "text content block must
					// contain non-whitespace text".
					pendingCacheControl = true;
				}
				break;
			}
			case Raw.ChatCompletionContentPartKind.Document: {
				if (part.documentData.mediaType === 'application/pdf') {
					convertedContent.push({
						type: 'document',
						source: {
							type: 'base64',
							media_type: 'application/pdf',
							data: part.documentData.data,
						}
					} satisfies DocumentBlockParam);
				}
				break;
			}
			case Raw.ChatCompletionContentPartKind.Opaque: {
				if (part.value && typeof part.value === 'object' && 'type' in part.value) {
					const opaqueValue = part.value as { type: string; thinking?: { id: string; text?: string | string[]; encrypted?: string } };
					if (opaqueValue.type === 'thinking' && opaqueValue.thinking) {
						const thinkingText = Array.isArray(opaqueValue.thinking.text)
							? opaqueValue.thinking.text.join('')
							: opaqueValue.thinking.text;
						if (thinkingText && opaqueValue.thinking.encrypted) {
							// Regular thinking block: text is present, encrypted field contains the signature
							convertedContent.push({
								type: 'thinking',
								thinking: thinkingText,
								signature: opaqueValue.thinking.encrypted,
							});
						} else if (opaqueValue.thinking.encrypted && !thinkingText) {
							// Redacted thinking block: no text, only encrypted data from Claude
							convertedContent.push({
								type: 'redacted_thinking',
								data: opaqueValue.thinking.encrypted,
							});
						}
					}
				}
				break;
			}
		}

		// Attach any pending cache_control to the block we just added
		if (pendingCacheControl && convertedContent.length > 0) {
			const lastBlock = convertedContent.at(-1)!;
			if (contentBlockSupportsCacheControl(lastBlock)) {
				lastBlock.cache_control = { type: 'ephemeral' };
				pendingCacheControl = false;
			}
		}
	}

	return convertedContent;
}

function contentBlockSupportsCacheControl(block: ContentBlockParam): block is Exclude<ContentBlockParam, ThinkingBlockParam | RedactedThinkingBlockParam> {
	return block.type !== 'thinking' && block.type !== 'redacted_thinking';
}

const maxCacheBreakpoints = 4;

/**
 * Optionally adds cache_control to the tools and system prefix when there are spare
 * slots available (i.e. existing breakpoints < max). The last non-deferred tool is
 * marked first if possible, and the last system block is marked only while slots remain.
 * Message-level cache breakpoints are never evicted because they already implicitly
 * cache the tools+system prefix (Anthropic cache hierarchy: tools → system → messages)
 * and cover more content.
 */
export function addToolsAndSystemCacheControl(
	tools: AnthropicMessagesTool[],
	messagesResult: { messages: MessageParam[]; system?: TextBlockParam[] },
): void {
	// Count existing cache_control in messages and system
	let existingCount = 0;
	if (messagesResult.system) {
		for (const block of messagesResult.system) {
			if (block.cache_control) {
				existingCount++;
			}
		}
	}
	for (const msg of messagesResult.messages) {
		if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (typeof block === 'object' && 'cache_control' in block && block.cache_control) {
					existingCount++;
				}
			}
		}
	}

	let slotsAvailable = maxCacheBreakpoints - existingCount;
	if (slotsAvailable <= 0) {
		return;
	}

	// Find the last non-deferred tool — deferred tools cannot have cache_control.
	let lastCacheableTool: AnthropicMessagesTool | undefined;
	for (let i = tools.length - 1; i >= 0; i--) {
		if (!tools[i].defer_loading) {
			lastCacheableTool = tools[i];
			break;
		}
	}

	if (lastCacheableTool && slotsAvailable > 0) {
		lastCacheableTool.cache_control = { type: 'ephemeral' };
		slotsAvailable--;
	}

	// Add cache_control to the last system block (caches the stable system prompt)
	const lastSystemBlock = messagesResult.system?.at(-1);
	if (lastSystemBlock && !lastSystemBlock.cache_control && slotsAvailable > 0) {
		lastSystemBlock.cache_control = { type: 'ephemeral' };
	}
}

export async function processResponseFromMessagesEndpoint(
	instantiationService: IInstantiationService,
	telemetryService: ITelemetryService,
	logService: ILogService,
	response: Response,
	finishCallback: FinishedCallback,
	telemetryData: TelemetryData
): Promise<AsyncIterableObject<ChatCompletion>> {
	return new AsyncIterableObject<ChatCompletion>(async feed => {
		const requestId = response.headers.get('X-Request-ID') ?? generateUuid();
		const ghRequestId = response.headers.get('x-github-request-id') ?? '';
		const processor = instantiationService.createInstance(AnthropicMessagesProcessor, telemetryData, requestId, ghRequestId);
		const parser = new SSEParser((ev) => {
			try {
				logService.trace(`[messagesAPI]SSE: ${ev.data}`);
				const trimmed = ev.data?.trim();
				if (!trimmed || trimmed === '[DONE]') {
					return;
				}

				const parsed = JSON.parse(trimmed) as Partial<AnthropicStreamEvent>;
				const type = parsed.type ?? ev.type;
				if (!type) {
					return;
				}
				const completion = processor.push({ ...parsed, type } as AnthropicStreamEvent, finishCallback);
				if (completion) {
					logService.info(`[messagesAPI] message ${completion.choiceIndex} returned. finish reason: [${completion.finishReason}]`);

					const dataToSendToTelemetry = telemetryData.extendedBy({
						completionChoiceFinishReason: completion.finishReason,
						headerRequestId: completion.requestId.headerRequestId
					});
					telemetryService.sendGHTelemetryEvent('completion.finishReason', dataToSendToTelemetry.properties, dataToSendToTelemetry.measurements);

					const telemetryMessage = rawMessageToCAPI(completion.message);
					let telemetryDataWithUsage = telemetryData;
					if (completion.usage) {
						telemetryDataWithUsage = telemetryData.extendedBy({}, {
							promptTokens: completion.usage.prompt_tokens,
							completionTokens: completion.usage.completion_tokens,
							totalTokens: completion.usage.total_tokens
						});
					}
					sendEngineMessagesTelemetry(telemetryService, [telemetryMessage], telemetryDataWithUsage, true, logService);

					feed.emitOne(completion);
				}
			} catch (e) {
				feed.reject(e);
			}
		});

		for await (const chunk of withStreamIdleTimeout(response.body)) {
			parser.feed(chunk);
		}
	}, async () => {
		await response.body.destroy();
	});
}

export class AnthropicMessagesProcessor {
	private textAccumulator: string = '';
	private toolCallAccumulator: Map<number, { id: string; name: string; arguments: string }> = new Map();
	private serverToolCallAccumulator: Map<number, { id: string; name: string; arguments: string }> = new Map();
	private completedServerToolCalls: Map<string, { id: string; name: string; arguments: string }> = new Map();
	private thinkingAccumulator: Map<number, { thinking: string; signature: string }> = new Map();
	private completedToolCalls: Array<{ id: string; name: string; arguments: string }> = [];
	private messageId: string = '';
	private model: string = '';
	private inputTokens: number = 0;
	private outputTokens: number = 0;
	private cacheCreationTokens: number = 0;
	private cacheReadTokens: number = 0;
	private contextManagementResponse?: ContextManagementResponse;
	private toolSearchRequests: number = 0;
	private stopReason: string | undefined;

	constructor(
		private readonly telemetryData: TelemetryData,
		private readonly requestId: string,
		private readonly ghRequestId: string,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	/**
	 * Extract IP code citations from copilot_annotations and convert to IIPCodeCitation format
	 */
	private extractIPCodeCitations(annotations?: { IPCodeCitations?: AnthropicIPCodeCitation[] }): IIPCodeCitation[] {
		if (!annotations?.IPCodeCitations?.length) {
			return [];
		}

		// Deduplicate by URL since the same citation can appear multiple times
		const seenUrls = new Set<string>();
		const citations: IIPCodeCitation[] = [];

		for (const citation of annotations.IPCodeCitations) {
			const citationDetails = citation.citations;
			if (!citationDetails) {
				continue;
			}

			const { url, license, snippet } = citationDetails;

			if (typeof url !== 'string' || url.trim() === '') {
				continue;
			}

			if (typeof license !== 'string' || license.trim() === '') {
				continue;
			}

			if (typeof snippet !== 'string' || snippet.trim() === '') {
				continue;
			}

			if (!seenUrls.has(url)) {
				seenUrls.add(url);
				citations.push({
					citations: {
						url,
						license,
						snippet,
					}
				});
			}
		}

		if (citations.length > 0) {
			this.logService.trace(`[messagesAPI] IP code citations found: ${citations.length} unique citations`);
		}

		return citations;
	}

	public push(chunk: AnthropicStreamEvent, _onProgress: FinishedCallback): ChatCompletion | undefined {
		const onProgress = (delta: IResponseDelta): undefined => {
			this.textAccumulator += delta.text;
			_onProgress(this.textAccumulator, 0, delta);
		};

		switch (chunk.type) {
			case 'message_start':
				if (chunk.message) {
					this.messageId = chunk.message.id;
					this.model = chunk.message.model;
					this.inputTokens = chunk.message.usage.input_tokens ?? 0;
					this.outputTokens = chunk.message.usage.output_tokens ?? 0;
					this.cacheCreationTokens = chunk.message.usage.cache_creation_input_tokens ?? 0;
					this.cacheReadTokens = chunk.message.usage.cache_read_input_tokens ?? 0;
					if (chunk.message.usage.server_tool_use?.tool_search_requests) {
						this.toolSearchRequests = chunk.message.usage.server_tool_use.tool_search_requests;
					}
				}
				return;
			case 'content_block_start':
				if (chunk.content_block?.type === 'tool_use' && chunk.index !== undefined) {
					const toolCallId = chunk.content_block.id || generateUuid();
					this.toolCallAccumulator.set(chunk.index, {
						id: toolCallId,
						name: chunk.content_block.name || '',
						arguments: '',
					});
					if (this.textAccumulator.length) {
						onProgress({ text: ' ' });
					}
					onProgress({
						text: '',
						beginToolCalls: [{ name: chunk.content_block.name || '', id: toolCallId }]
					});
				} else if (chunk.content_block?.type === 'server_tool_use' && chunk.index !== undefined) {
					const serverToolUse = chunk.content_block as ServerToolUse;
					const serverToolCallId = serverToolUse.id || generateUuid();
					this.serverToolCallAccumulator.set(chunk.index, {
						id: serverToolCallId,
						name: serverToolUse.name || '',
						arguments: '',
					});
				} else if (chunk.content_block?.type === 'tool_search_tool_result' && chunk.index !== undefined) {
					const toolSearchResult = chunk.content_block as ToolSearchToolResult;
					if (toolSearchResult.content.type === 'tool_search_tool_search_result') {
						const toolReferences = toolSearchResult.content.tool_references;
						const toolNames = toolReferences.map(ref => ref.tool_name);

						this.logService.trace(`[messagesAPI] Tool search discovered ${toolNames.length} tools: ${toolNames.join(', ')}`);

						/* __GDPR__
							"toolSearchToolInvoked" : {
								"owner": "bhavyaus",
								"comment": "Details about invocation of tools",
								"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request ID for correlation" },
								"interactionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The interaction ID for correlation" },
								"validateOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the tool input validation. valid, invalid and unknown" },
								"invokeOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the tool invocation. success, error" },
								"toolName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the tool being invoked." },
								"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
								"errorCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error code if failed" },
								"discoveredToolCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tools discovered", "isMeasurement": true }
							}
						*/
						this.telemetryService.sendMSFTTelemetryEvent('toolSearchToolInvoked',
							{ requestId: this.requestId, interactionId: this.requestId, validateOutcome: 'unknown', invokeOutcome: 'success', toolName: TOOL_SEARCH_TOOL_NAME, model: this.model },
							{ discoveredToolCount: toolNames.length }
						);

						// Get the original server tool call to pair with this result
						const serverToolCall = this.completedServerToolCalls.get(toolSearchResult.tool_use_id);
						this.completedServerToolCalls.delete(toolSearchResult.tool_use_id);

						// Parse the arguments from JSON string
						let parsedArgs: unknown;
						if (serverToolCall?.arguments) {
							try {
								parsedArgs = JSON.parse(serverToolCall.arguments);
							} catch {
								parsedArgs = serverToolCall.arguments;
							}
						}

						// Report combined entry with both args and result (like regular tools)
						return onProgress({
							text: '',
							serverToolCalls: [{
								id: toolSearchResult.tool_use_id,
								name: serverToolCall?.name ?? 'tool_search_tool_regex',
								args: parsedArgs,
								isServer: true,
								result: { tool_references: toolReferences },
							}],
						});
					} else if (toolSearchResult.content.type === 'tool_search_tool_result_error') {
						this.logService.warn(`[messagesAPI] Tool search error: ${toolSearchResult.content.error_code}`);

						/* __GDPR__
							"toolSearchToolInvoked" : {
								"owner": "bhavyaus",
								"comment": "Details about invocation of tools",
								"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request ID for correlation" },
								"interactionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The interaction ID for correlation" },
								"validateOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the tool input validation. valid, invalid and unknown" },
								"invokeOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the tool invocation. success, error" },
								"toolName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the tool being invoked." },
								"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
								"errorCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error code if failed" },
								"discoveredToolCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tools discovered", "isMeasurement": true }
							}
						*/
						this.telemetryService.sendMSFTTelemetryEvent('toolSearchToolInvoked',
							{ requestId: this.requestId, interactionId: this.requestId, validateOutcome: 'unknown', invokeOutcome: 'error', toolName: TOOL_SEARCH_TOOL_NAME, model: this.model, errorCode: toolSearchResult.content.error_code },
							{ discoveredToolCount: 0 }
						);

						// Get the original server tool call to pair with this error result
						const serverToolCall = this.completedServerToolCalls.get(toolSearchResult.tool_use_id);
						this.completedServerToolCalls.delete(toolSearchResult.tool_use_id);

						// Parse the arguments from JSON string
						let parsedArgs: unknown;
						if (serverToolCall?.arguments) {
							try {
								parsedArgs = JSON.parse(serverToolCall.arguments);
							} catch {
								parsedArgs = serverToolCall.arguments;
							}
						}

						// Report server tool call with error result for logging
						onProgress({
							text: '',
							serverToolCalls: [{
								id: toolSearchResult.tool_use_id,
								name: serverToolCall?.name ?? 'tool_search_tool_regex',
								args: parsedArgs,
								isServer: true,
								result: { error: toolSearchResult.content.error_code },
							}],
						});

						return onProgress({
							text: '',
							copilotErrors: [{
								agent: 'anthropic',
								code: toolSearchResult.content.error_code,
								message: `Tool search error: ${toolSearchResult.content.error_code}`,
								type: 'error',
								identifier: undefined
							}]
						});
					}
				} else if (chunk.content_block?.type === 'thinking' && chunk.index !== undefined) {
					this.thinkingAccumulator.set(chunk.index, {
						thinking: '',
						signature: '',
					});
				} else if (chunk.content_block?.type === 'redacted_thinking' && chunk.index !== undefined) {
					const data = (chunk.content_block as { type: 'redacted_thinking'; data: string }).data;
					onProgress({
						text: '',
						thinking: {
							id: `thinking_${chunk.index}`,
							encrypted: data,
						}
					});
				} else if (chunk.content_block) {
					const unknownType = (chunk.content_block as { type?: string }).type ?? 'undefined';
					this.logService.warn(`[messagesAPI] Unknown content_block type '${unknownType}' at index ${chunk.index ?? -1} for model ${this.model}`);

					/* __GDPR__
						"messagesApi.unknownContentBlock" : {
							"owner": "bhavyaus",
							"comment": "Tracks unknown Anthropic content block types",
							"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request ID for correlation" },
							"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that emitted the unknown block" },
							"blockType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The unknown content_block.type string" }
						}
					*/
					this.telemetryService.sendMSFTTelemetryEvent('messagesApi.unknownContentBlock',
						{
							requestId: this.requestId,
							model: this.model,
							blockType: unknownType,
						}
					);
				}
				return;
			case 'content_block_delta':
				if (chunk.delta) {
					if (chunk.delta.type === 'text_delta' && chunk.delta.text) {
						const ipCitations = this.extractIPCodeCitations(chunk.copilot_annotations);
						if (ipCitations.length > 0) {
							return onProgress({ text: chunk.delta.text, ipCitations });
						}
						return onProgress({ text: chunk.delta.text });
					} else if (chunk.delta.type === 'thinking_delta' && chunk.delta.thinking && chunk.index !== undefined) {
						const thinking = this.thinkingAccumulator.get(chunk.index);
						if (thinking) {
							thinking.thinking += chunk.delta.thinking;
						}
						return onProgress({
							text: '',
							thinking: {
								id: `thinking_${chunk.index}`,
								text: chunk.delta.thinking,
							}
						});
					} else if (chunk.delta.type === 'signature_delta' && chunk.delta.signature && chunk.index !== undefined) {
						const thinking = this.thinkingAccumulator.get(chunk.index);
						if (thinking) {
							thinking.signature += chunk.delta.signature;
						}
						// Don't report signature deltas to the user
					} else if (chunk.delta.type === 'input_json_delta' && chunk.delta.partial_json && chunk.index !== undefined) {
						const toolCall = this.toolCallAccumulator.get(chunk.index);
						if (toolCall) {
							toolCall.arguments += chunk.delta.partial_json;
							onProgress({
								text: '',
								copilotToolCallStreamUpdates: [{
									id: toolCall.id,
									name: toolCall.name,
									arguments: toolCall.arguments,
								}],
							});
						}
						const serverToolCall = this.serverToolCallAccumulator.get(chunk.index);
						if (serverToolCall) {
							serverToolCall.arguments += chunk.delta.partial_json;
						}
					}
				}
				return;
			case 'content_block_stop':
				if (chunk.index !== undefined) {
					const toolCall = this.toolCallAccumulator.get(chunk.index);
					if (toolCall) {
						this.completedToolCalls.push(toolCall);
						onProgress({
							text: '',
							copilotToolCalls: [{
								id: toolCall.id,
								name: toolCall.name,
								arguments: toolCall.arguments,
							}],
						});
						this.toolCallAccumulator.delete(chunk.index);
					}
					// Handle server tool call completion (tool search) - store for result pairing
					const serverToolCall = this.serverToolCallAccumulator.get(chunk.index);
					if (serverToolCall) {
						// Store completed server tool call by ID, waiting for tool_search_tool_result
						this.completedServerToolCalls.set(serverToolCall.id, serverToolCall);
						this.serverToolCallAccumulator.delete(chunk.index);
					}
					const thinking = this.thinkingAccumulator.get(chunk.index);
					if (thinking && thinking.signature) {
						onProgress({
							text: '',
							thinking: {
								id: `thinking_${chunk.index}`,
								encrypted: thinking.signature,
							}
						});
						this.thinkingAccumulator.delete(chunk.index);
					}
				}
				return;
			case 'message_delta':
				if (chunk.usage) {
					// message_delta provides the most accurate token counts
					this.outputTokens = chunk.usage.output_tokens;
					this.inputTokens = chunk.usage.input_tokens ?? this.inputTokens;
					this.cacheCreationTokens = chunk.usage.cache_creation_input_tokens ?? this.cacheCreationTokens;
					this.cacheReadTokens = chunk.usage.cache_read_input_tokens ?? this.cacheReadTokens;
					if (chunk.usage.server_tool_use?.tool_search_requests) {
						this.toolSearchRequests = chunk.usage.server_tool_use.tool_search_requests;
					}
				}
				if (chunk.context_management) {
					this.contextManagementResponse = chunk.context_management;
					// Report context management via delta so it gets logged to request logger
					return onProgress({
						text: '',
						contextManagement: chunk.context_management
					});
				}
				// Track stop_reason for determining finish reason in message_stop
				if (chunk.delta?.stop_reason) {
					this.stopReason = chunk.delta.stop_reason;
				}
				return;
			case 'message_stop': {
				if (this.contextManagementResponse) {
					const totalClearedTokens = this.contextManagementResponse.applied_edits.reduce(
						(sum, edit) => sum + (edit.cleared_input_tokens || 0),
						0
					);
					const totalClearedToolUses = this.contextManagementResponse.applied_edits.reduce(
						(sum, edit) => sum + (edit.cleared_tool_uses || 0),
						0
					);
					const totalClearedThinkingTurns = this.contextManagementResponse.applied_edits.reduce(
						(sum, edit) => sum + (edit.cleared_thinking_turns || 0),
						0
					);
					this.logService.trace(`[messagesAPI] Anthropic context editing applied: cleared ${totalClearedTokens} tokens, ${totalClearedToolUses} tool uses.`);

					/* __GDPR__
						"contextEditingApplied" : {
							"owner": "bhavyaus",
							"comment": "Tracks when Anthropic context editing is applied to manage context window",
							"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request ID for correlation" },
							"interactionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The interaction ID for correlation" },
							"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model used" },
							"clearedTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total tokens cleared" },
							"clearedToolUses": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total tool uses cleared" },
							"clearedThinkingTurns": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total thinking turns cleared" }
						}
					*/
					this.telemetryService.sendMSFTTelemetryEvent('contextEditingApplied',
						{
							requestId: this.requestId,
							interactionId: this.requestId,
							model: this.model,
						},
						{
							clearedTokens: totalClearedTokens,
							clearedToolUses: totalClearedToolUses,
							clearedThinkingTurns: totalClearedThinkingTurns,
						}
					);
				}
				if (this.toolSearchRequests > 0) {
					this.logService.trace(`[messagesAPI] Anthropic tool search requests: ${this.toolSearchRequests}.`);
					this.telemetryData.extendedBy({
						toolSearchUsed: 'true',
						toolSearchRequests: this.toolSearchRequests.toString(),
					});
				}
				let finishReason: FinishedCompletionReason;
				switch (this.stopReason) {
					case 'refusal':
						finishReason = FinishedCompletionReason.ClientDone;
						break;
					case 'max_tokens':
					case 'model_context_window_exceeded':
						finishReason = FinishedCompletionReason.Length;
						break;
					default:
						finishReason = FinishedCompletionReason.Stop;
						break;
				}

				const computedPromptTokens = this.inputTokens + this.cacheCreationTokens + this.cacheReadTokens;
				if (computedPromptTokens < this.cacheReadTokens) {
					this.logService.warn(`[messagesAPI] Token count inconsistency: computed prompt_tokens (${computedPromptTokens}) < cached_tokens (${this.cacheReadTokens}). Raw values: inputTokens=${this.inputTokens}, cacheCreationTokens=${this.cacheCreationTokens}, cacheReadTokens=${this.cacheReadTokens}`);
				}

				return {
					blockFinished: true,
					choiceIndex: 0,
					model: this.model,
					tokens: [],
					telemetryData: this.telemetryData,
					requestId: {
						headerRequestId: this.requestId,
						gitHubRequestId: this.ghRequestId,
						completionId: this.messageId,
						created: Date.now(),
						deploymentId: '',
						serverExperiments: ''
					},
					usage: {
						prompt_tokens: computedPromptTokens,
						completion_tokens: this.outputTokens,
						total_tokens: computedPromptTokens + this.outputTokens,
						prompt_tokens_details: {
							cached_tokens: this.cacheReadTokens,
						},
						completion_tokens_details: {
							reasoning_tokens: 0,
							accepted_prediction_tokens: 0,
							rejected_prediction_tokens: 0,
						},
					},
					finishReason,
					message: {
						role: Raw.ChatRole.Assistant,
						content: this.textAccumulator ? [{
							type: Raw.ChatCompletionContentPartKind.Text,
							text: this.textAccumulator
						}] : [],
						...(this.completedToolCalls.length > 0 ? {
							toolCalls: this.completedToolCalls.map(tc => ({
								id: tc.id,
								type: 'function' as const,
								function: {
									name: tc.name,
									arguments: tc.arguments
								}
							}))
						} : {})
					}
				};
			}
			case 'error': {
				const errorMessage = (chunk as unknown as { error?: { message?: string } }).error?.message || 'Unknown error';
				return onProgress({
					text: '',
					copilotErrors: [{
						agent: 'anthropic',
						code: 'unknown',
						message: errorMessage,
						type: 'error',
						identifier: undefined
					}]
				});
			}
		}
	}
}


