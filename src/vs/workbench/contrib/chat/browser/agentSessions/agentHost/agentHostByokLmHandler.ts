/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { decodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import {
	ByokLmImageMimeType,
	getByokLmAgentModelId,
	IAgentHostByokLmHandler,
	IByokLmChatRequest,
	IByokLmChatResult,
	IByokLmContentPart,
	IByokLmInputItem,
	IByokLmModelInfo,
	IByokLmOutputItem,
	IByokLmReasoningItem,
} from '../../../../../../platform/agentHost/common/agentHostByokLm.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import {
	ChatImageMimeType,
	ChatMessageRole,
	IChatMessage,
	IChatMessagePart,
	ILanguageModelChatRequestOptions,
	ILanguageModelsService,
} from '../../../common/languageModels.js';
import { SessionType } from '../../../common/chatSessionsService.js';

const STATEFUL_MARKER_MIME_TYPE = 'stateful_marker';
const USAGE_MIME_TYPE = 'usage';
const REASONING_METADATA_PREFIX = 'vscode-reasoning-metadata:';
const VSCODE_REASONING_SUMMARY_PART_DONE = 'vscode_reasoning_summary_part_done';
const CLIENT_BYOK_CONTEXT_KEYS = new Set([ChatEntitlementContextKeys.clientByokEnabled.key]);

/**
 * Renderer-side {@link IAgentHostByokLmHandler}. Services BYOK chat requests
 * forwarded by the node agent host's OpenAI proxy by calling the VS Code LM
 * API for the matching extension-registered model.
 *
 * The bridge DTOs are plain/serializable; this class is the single place that
 * translates them to and from the `workbench/contrib/chat` LM types.
 */
export class AgentHostByokLmHandler extends Disposable implements IAgentHostByokLmHandler {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeModels = this._register(new Emitter<void>());
	/** Fires when the renderer's BYOK models change, so the node agent host re-enumerates. */
	readonly onDidChangeModels = this._onDidChangeModels.event;

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILogService private readonly _logService: ILogService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		// Re-emit (debounced) whenever the renderer's language models change, so the
		// agent host can refresh its BYOK model list — extension-provided BYOK models
		// often register shortly after the bridge connects.
		this._register(Event.debounce(this._languageModelsService.onDidChangeLanguageModels, () => undefined, 500)(() => {
			this._onDidChangeModels.fire();
		}));
		this._register(this._languageModelsService.onDidChangeModelVisibility(() => {
			this._onDidChangeModels.fire();
		}));
		this._register(Event.filter(contextKeyService.onDidChangeContext, event => event.affectsSome(CLIENT_BYOK_CONTEXT_KEYS))(() => {
			this._onDidChangeModels.fire();
		}));
	}

	async chat(request: IByokLmChatRequest, token: CancellationToken): Promise<IByokLmChatResult> {
		if (!this._chatEntitlementService.clientByokEnabled) {
			return { output: [], error: 'BYOK models are disabled by policy.' };
		}

		const modelIdentifier = this._resolveModelIdentifier(request.vendor, request.modelId);
		if (!modelIdentifier) {
			return { output: [], error: `No BYOK model found for ${request.vendor}/${request.modelId}` };
		}

		const messages = this._toChatMessages(request);
		const tools = request.tools?.length
			? request.tools.map(tool => ({
				name: tool.name,
				description: tool.description ?? '',
				inputSchema: tool.type === 'function'
					? tool.parametersSchema
					: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
			}))
			: undefined;
		const options: ILanguageModelChatRequestOptions = {
			modelOptions: request.modelOptions,
			includeEncryptedThinking: true,
			...(request.reasoningEffort ? { configuration: { reasoningEffort: request.reasoningEffort } } : {}),
			...(tools ? { tools } : {}),
		};

		try {
			const response = await this._languageModelsService.sendChatRequest(modelIdentifier, undefined, messages, options, token);

			const output: IByokLmOutputItem[] = [];
			const customToolNames = new Set(request.tools?.filter(tool => tool.type === 'custom').map(tool => tool.name));
			const completedReasoningSummaryParts = new Set<string | undefined>();
			let responseId: string | undefined;
			let usage: IByokLmChatResult['usage'];
			const streaming = (async () => {
				for await (const part of response.stream) {
					const parts = Array.isArray(part) ? part : [part];
					for (const p of parts) {
						if (p.type === 'text') {
							this._appendTextOutput(output, p.value);
						} else if (p.type === 'thinking') {
							if (p.metadata?.[VSCODE_REASONING_SUMMARY_PART_DONE] === true) {
								completedReasoningSummaryParts.add(p.id);
							} else {
								const startsNewSummaryPart = p.value.length > 0 && completedReasoningSummaryParts.delete(p.id);
								this._appendReasoningOutput(output, p, startsNewSummaryPart);
							}
						} else if (p.type === 'tool_use') {
							if (customToolNames.has(p.name)) {
								output.push({
									type: 'custom_tool_call',
									callId: p.toolCallId,
									name: p.name,
									input: this._customToolInput(p.parameters),
								});
							} else {
								output.push({
									type: 'function_call',
									callId: p.toolCallId,
									name: p.name,
									argumentsJson: JSON.stringify(p.parameters ?? {}),
								});
							}
						} else if (p.type === 'data' && p.mimeType === STATEFUL_MARKER_MIME_TYPE) {
							responseId = this._decodeStatefulMarker(p.data, request.modelId);
						} else if (p.type === 'data' && p.mimeType === USAGE_MIME_TYPE) {
							usage = this._decodeUsage(p.data);
						}
					}
				}
			})();

			await Promise.all([response.result, streaming]);
			return { output, responseId, usage };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logService.warn(`[AgentHostByokLmHandler] chat request failed for ${request.vendor}/${request.modelId}: ${message}`);
			return { output: [], error: message };
		}
	}

	async listModels(_token: CancellationToken): Promise<IByokLmModelInfo[]> {
		if (!this._chatEntitlementService.clientByokEnabled) {
			return [];
		}

		const models: IByokLmModelInfo[] = [];
		for (const identifier of this._languageModelsService.getLanguageModelIds()) {
			const metadata = this._languageModelsService.lookupLanguageModel(identifier);
			// Only genuine renderer BYOK models — exclude agent-host copies, which
			// carry a `targetChatSessionType` and would otherwise re-enter the bridge.
			if (metadata?.isBYOK && !metadata.targetChatSessionType) {
				const reasoningEffortSchema = metadata.configurationSchema?.properties?.reasoningEffort;
				const supportedReasoningEfforts = reasoningEffortSchema?.enum?.filter((value): value is string => typeof value === 'string');
				const defaultReasoningEffort = typeof reasoningEffortSchema?.default === 'string' ? reasoningEffortSchema.default : undefined;
				const model: IByokLmModelInfo = {
					vendor: metadata.vendor,
					id: metadata.id,
					name: metadata.name,
					modelIdentifier: identifier,
					maxContextWindowTokens: metadata.maxInputTokens + metadata.maxOutputTokens,
					supportsVision: !!metadata.capabilities?.vision,
					...(supportedReasoningEfforts?.length ? { supportedReasoningEfforts } : {}),
					...(defaultReasoningEffort !== undefined ? { defaultReasoningEffort } : {}),
				};
				const agentHostModelIdentifier = `${SessionType.AgentHostCopilot}:${getByokLmAgentModelId(model)}`;
				if (!this._languageModelsService.isModelHidden(identifier) && !this._languageModelsService.isModelHidden(agentHostModelIdentifier)) {
					models.push(model);
				}
			}
		}
		return models;
	}

	/**
	 * Find the LM API identifier for a BYOK model addressed by its vendor and
	 * provider-local id (the `provider/id` selection id the picker surfaced).
	 */
	private _resolveModelIdentifier(vendor: string, modelId: string): string | undefined {
		const exactIdentifier = `${vendor}/${modelId}`;
		const exactMetadata = this._languageModelsService.lookupLanguageModel(exactIdentifier);
		if (exactMetadata?.isBYOK && exactMetadata.vendor === vendor) {
			return exactIdentifier;
		}
		for (const identifier of this._languageModelsService.getLanguageModelIds()) {
			const metadata = this._languageModelsService.lookupLanguageModel(identifier);
			if (metadata?.isBYOK && metadata.vendor === vendor && metadata.id === modelId) {
				return identifier;
			}
		}
		return undefined;
	}

	private _toChatMessages(request: IByokLmChatRequest): IChatMessage[] {
		const messages: IChatMessage[] = [];
		if (request.previousResponseId) {
			messages.push({
				role: ChatMessageRole.Assistant,
				content: [{
					type: 'data',
					mimeType: STATEFUL_MARKER_MIME_TYPE,
					data: VSBuffer.fromString(`${request.modelId}\\${request.previousResponseId}`),
				}],
			});
		}
		if (request.instructions) {
			messages.push({
				role: ChatMessageRole.System,
				content: [{ type: 'text', value: request.instructions }],
			});
		}
		for (const item of request.input) {
			const message = this._toChatMessage(item);
			const previous = messages.at(-1);
			if (message.role === ChatMessageRole.Assistant && previous?.role === ChatMessageRole.Assistant) {
				messages[messages.length - 1] = {
					...previous,
					content: [...previous.content, ...message.content],
				};
			} else {
				messages.push(message);
			}
		}
		return messages;
	}

	private _toChatMessage(item: IByokLmInputItem): IChatMessage {
		switch (item.type) {
			case 'message':
				return {
					role: this._toChatRole(item.role),
					content: this._toChatMessageParts(item.content),
				};
			case 'reasoning': {
				return {
					role: ChatMessageRole.Assistant,
					content: [{
						type: 'thinking',
						value: item.summary,
						id: item.id,
						metadata: {
							...item.metadata,
							...(item.encryptedContent ? this._decodeReasoningMetadata(item.encryptedContent) : {}),
						},
					}],
				};
			}
			case 'function_call':
				return {
					role: ChatMessageRole.Assistant,
					content: [{
						type: 'tool_use',
						name: item.name,
						toolCallId: item.callId,
						parameters: this._safeParseJson(item.argumentsJson),
					}],
				};
			case 'custom_tool_call':
				return {
					role: ChatMessageRole.Assistant,
					content: [{
						type: 'tool_use',
						name: item.name,
						toolCallId: item.callId,
						parameters: { input: item.input },
					}],
				};
			case 'function_call_output':
			case 'custom_tool_call_output':
				return {
					role: ChatMessageRole.User,
					content: [{
						type: 'tool_result',
						toolCallId: item.callId,
						value: [{ type: 'text', value: item.output }],
					}],
				};
		}
	}

	private _toChatMessageParts(parts: IByokLmContentPart[]): IChatMessagePart[] {
		const result: IChatMessagePart[] = [];
		for (const part of parts) {
			if (part.type === 'text') {
				const previous = result.at(-1);
				if (previous?.type === 'text') {
					previous.value += part.text;
				} else {
					result.push({ type: 'text', value: part.text });
				}
			} else {
				result.push({ type: 'image_url', value: { mimeType: this._toChatImageMimeType(part.mimeType), data: decodeBase64(part.data) } });
			}
		}
		return result.length ? result : [{ type: 'text', value: '' }];
	}

	private _toChatImageMimeType(mimeType: ByokLmImageMimeType): ChatImageMimeType {
		switch (mimeType) {
			case 'image/png':
				return ChatImageMimeType.PNG;
			case 'image/jpeg':
				return ChatImageMimeType.JPEG;
			case 'image/gif':
				return ChatImageMimeType.GIF;
			case 'image/webp':
				return ChatImageMimeType.WEBP;
			case 'image/bmp':
				return ChatImageMimeType.BMP;
		}
	}

	private _appendTextOutput(output: IByokLmOutputItem[], value: string): void {
		const previous = output.at(-1);
		if (previous?.type === 'message') {
			output[output.length - 1] = {
				...previous,
				content: [{ type: 'text', text: previous.content.map(part => part.text).join('') + value }],
			};
		} else {
			output.push({ type: 'message', content: [{ type: 'text', text: value }] });
		}
	}

	private _appendReasoningOutput(output: IByokLmOutputItem[], part: Extract<IChatMessagePart, { type: 'thinking' }>, startsNewSummaryPart: boolean): void {
		if (part.metadata?.vscode_reasoning_done === true) {
			return;
		}
		const summary = Array.isArray(part.value) ? part.value : [part.value];
		const encryptedContent = this._encodeReasoningMetadata(part.metadata);
		const reasoning: IByokLmReasoningItem = {
			type: 'reasoning',
			id: part.id,
			summary,
			encryptedContent,
			metadata: part.metadata,
		};
		const previous = output.at(-1);
		if (previous?.type === 'reasoning' && previous.id === reasoning.id) {
			output[output.length - 1] = {
				...previous,
				summary: startsNewSummaryPart || Array.isArray(part.value)
					? [...previous.summary, ...reasoning.summary]
					: this._mergeReasoningSummary(previous.summary, part.value),
				encryptedContent: reasoning.encryptedContent ?? previous.encryptedContent,
				metadata: previous.metadata || reasoning.metadata ? { ...previous.metadata, ...reasoning.metadata } : undefined,
			};
		} else {
			output.push(reasoning);
		}
	}

	private _mergeReasoningSummary(summary: readonly string[], value: string): string[] {
		if (summary.length === 0) {
			return [value];
		}
		return [...summary.slice(0, -1), summary[summary.length - 1] + value];
	}

	private _encodeReasoningMetadata(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
		const encryptedContent = this._stringMetadata(metadata, 'encrypted_content') ?? this._stringMetadata(metadata, 'encrypted');
		if (encryptedContent) {
			return encryptedContent;
		}
		const continuationMetadata = {
			...(this._stringMetadata(metadata, 'signature') ? { signature: this._stringMetadata(metadata, 'signature') } : {}),
			...(this._stringMetadata(metadata, '_completeThinking') ? { _completeThinking: this._stringMetadata(metadata, '_completeThinking') } : {}),
			...(this._stringMetadata(metadata, 'redactedData') ? { redactedData: this._stringMetadata(metadata, 'redactedData') } : {}),
		};
		return Object.keys(continuationMetadata).length > 0
			? `${REASONING_METADATA_PREFIX}${JSON.stringify(continuationMetadata)}`
			: undefined;
	}

	private _decodeReasoningMetadata(value: string): Record<string, unknown> {
		if (!value.startsWith(REASONING_METADATA_PREFIX)) {
			return { encrypted_content: value };
		}
		const metadata = JSON.parse(value.slice(REASONING_METADATA_PREFIX.length));
		if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
			throw new Error('Invalid Agent Host BYOK reasoning metadata');
		}
		return metadata as Record<string, unknown>;
	}

	private _customToolInput(parameters: unknown): string {
		if (typeof parameters === 'object' && parameters !== null) {
			const input = Object.getOwnPropertyDescriptor(parameters, 'input')?.value;
			if (typeof input === 'string') {
				return input;
			}
		}
		return typeof parameters === 'string' ? parameters : JSON.stringify(parameters ?? {});
	}

	private _decodeStatefulMarker(data: VSBuffer, expectedModelId: string): string | undefined {
		const decoded = data.toString();
		const separator = decoded.indexOf('\\');
		if (separator === -1 || decoded.slice(0, separator) !== expectedModelId) {
			return undefined;
		}
		return decoded.slice(separator + 1) || undefined;
	}

	private _decodeUsage(data: VSBuffer): IByokLmChatResult['usage'] {
		try {
			const value = JSON.parse(data.toString()) as Record<string, unknown>;
			const outputDetails = typeof value.completion_tokens_details === 'object' && value.completion_tokens_details !== null
				? value.completion_tokens_details as Record<string, unknown>
				: undefined;
			return {
				inputTokens: this._numberProperty(value, 'prompt_tokens'),
				outputTokens: this._numberProperty(value, 'completion_tokens'),
				reasoningTokens: outputDetails ? this._numberProperty(outputDetails, 'reasoning_tokens') : undefined,
			};
		} catch {
			return undefined;
		}
	}

	private _numberProperty(value: Record<string, unknown>, key: string): number | undefined {
		const property = value[key];
		return typeof property === 'number' ? property : undefined;
	}

	private _stringMetadata(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
		const value = metadata?.[key];
		return typeof value === 'string' ? value : undefined;
	}

	private _toChatRole(role: Extract<IByokLmInputItem, { type: 'message' }>['role']): ChatMessageRole {
		switch (role) {
			case 'system':
			case 'developer':
				return ChatMessageRole.System;
			case 'assistant':
				return ChatMessageRole.Assistant;
			case 'user':
				return ChatMessageRole.User;
		}
	}

	private _safeParseJson(json: string): unknown {
		try {
			return JSON.parse(json);
		} catch {
			return {};
		}
	}
}
