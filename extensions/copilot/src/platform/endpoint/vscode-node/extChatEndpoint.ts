/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { CancellationToken } from 'vscode';
import * as vscode from 'vscode';
import { FetchStreamRecorder } from '../../../platform/chat/common/chatMLFetcher';
import { toErrorMessage } from '../../../util/common/errorMessage';
import { ITokenizer, TokenizerType } from '../../../util/common/tokenizer';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../chat/common/commonTypes';
import { ILogService } from '../../log/common/logService';
import { ContextManagementResponse } from '../../networking/common/anthropic';
import { FinishedCallback, OpenAiFunctionTool, OptionalChatRequestParams } from '../../networking/common/fetch';
import { Response } from '../../networking/common/fetcherService';
import { IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IMakeChatRequestOptions } from '../../networking/common/networking';
import { APIUsage, ChatCompletion, isApiUsage } from '../../networking/common/openai';
import { IOTelService } from '../../otel/common/otelService';
import { retrieveCapturingTokenByCorrelation, storeCapturingTokenForCorrelation } from '../../requestLogger/node/requestLogger';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';
import { EndpointEditToolName, isEndpointEditToolName } from '../common/endpointProvider';
import { CustomDataPartMimeTypes } from '../common/endpointTypes';
import { decodeStatefulMarker, encodeStatefulMarker, rawPartAsStatefulMarker } from '../common/statefulMarkerContainer';
import { rawPartAsThinkingData } from '../common/thinkingDataContainer';
import { ExtensionContributedChatTokenizer } from './extChatTokenizer';

enum ChatImageMimeType {
	PNG = 'image/png',
	JPEG = 'image/jpeg',
	GIF = 'image/gif',
	WEBP = 'image/webp',
	BMP = 'image/bmp',
}

const ZERO_USAGE: APIUsage = {
	prompt_tokens: 0,
	completion_tokens: 0,
	total_tokens: 0,
	prompt_tokens_details: { cached_tokens: 0 },
};

/**
 * Parse a `LanguageModelDataPart` payload tagged with
 * {@link CustomDataPartMimeTypes.Usage} into an {@link APIUsage} shape.
 *
 * The wire format is UTF-8 JSON. The full shape is the host's `APIUsage`
 * interface; the parser is permissive and accepts any object whose
 * numeric fields can be coerced — missing fields default to 0 — so a
 * provider can emit a partial payload (e.g. only `prompt_tokens` and
 * `completion_tokens`) without breaking the host. Returns `undefined` on
 * `JSON.parse` failure or when the payload is not an object.
 *
 * Defensive coercion: every numeric field — top-level and inside the
 * optional `prompt_tokens_details` / `completion_tokens_details` nested
 * objects — is clamped to a non-negative finite number. Nested detail
 * objects whose value is not a plain object (string, array, `null`,
 * etc.) are dropped rather than passed through, so downstream
 * telemetry / OTel attributes only ever see well-formed shapes.
 *
 * Example: an extension `LanguageModelChatProvider` populates the
 * Context Window indicator by emitting a final Usage part on its
 * response stream:
 *
 * ```ts
 * progress.report(new vscode.LanguageModelDataPart(
 *     new TextEncoder().encode(JSON.stringify({
 *         prompt_tokens: 12345,
 *         completion_tokens: 678,
 *         total_tokens: 13023,
 *         prompt_tokens_details: { cached_tokens: 9000 }
 *     })),
 *     'usage' // CustomDataPartMimeTypes.Usage
 * ));
 * ```
 */
export function parseExtensionContributedUsage(data: Uint8Array): APIUsage | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(data));
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	// Coerce to non-negative finite numbers. `isApiUsage` only checks
	// that the three top-level fields are `typeof === 'number'`, so a
	// provider could still emit negatives or non-finite values; the
	// host's cumulative completion-token counter (`ChatResponseModel.setUsage`)
	// treats these as monotonic, so a negative would silently corrupt
	// it, and `Infinity`/`NaN` would poison telemetry.
	const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0);
	const obj = parsed as Record<string, unknown>;

	// Treat arrays and `null` as malformed for the nested-detail
	// builders below, since `typeof [] === 'object'` and `typeof null
	// === 'object'` are both true in JS.
	const isPlainObject = (v: unknown): v is Record<string, unknown> =>
		!!v && typeof v === 'object' && !Array.isArray(v);

	// Build a clamped `prompt_tokens_details`. Drop the nested object
	// entirely if the provider sent a non-object (string, array, etc.)
	// so downstream consumers never see malformed shapes.
	const buildPromptDetails = (raw: unknown): APIUsage['prompt_tokens_details'] => {
		if (!isPlainObject(raw)) {
			return undefined;
		}
		const d = raw;
		const out: NonNullable<APIUsage['prompt_tokens_details']> = {
			cached_tokens: num(d.cached_tokens),
		};
		if ('cache_creation_input_tokens' in d) {
			out.cache_creation_input_tokens = num(d.cache_creation_input_tokens);
		}
		return out;
	};

	// Build a clamped `completion_tokens_details`. Same drop-on-malformed
	// policy. All three numeric fields are required by the type, so we
	// zero-fill anything the provider omitted.
	const buildCompletionDetails = (raw: unknown): APIUsage['completion_tokens_details'] => {
		if (!isPlainObject(raw)) {
			return undefined;
		}
		const d = raw;
		return {
			reasoning_tokens: num(d.reasoning_tokens),
			accepted_prediction_tokens: num(d.accepted_prediction_tokens),
			rejected_prediction_tokens: num(d.rejected_prediction_tokens),
		};
	};

	const result: APIUsage = {
		prompt_tokens: num(obj.prompt_tokens),
		completion_tokens: num(obj.completion_tokens),
		total_tokens: num(obj.total_tokens),
	};
	const promptDetails = buildPromptDetails(obj.prompt_tokens_details);
	if (promptDetails) {
		result.prompt_tokens_details = promptDetails;
	} else if (isApiUsage(parsed)) {
		// `APIUsage` doesn't require `prompt_tokens_details`, but the
		// historical `ZERO_USAGE` fallback always sets it. Preserve that
		// invariant on the strict path so downstream consumers that read
		// `usage.prompt_tokens_details?.cached_tokens` see a stable shape.
		result.prompt_tokens_details = { cached_tokens: 0 };
	}
	const completionDetails = buildCompletionDetails(obj.completion_tokens_details);
	if (completionDetails) {
		result.completion_tokens_details = completionDetails;
	}
	return result;
}

export class ExtensionContributedChatEndpoint implements IChatEndpoint {
	private readonly _maxTokens: number;
	public readonly isDefault: boolean = false;
	public readonly isFallback: boolean = false;
	public readonly isPremium: boolean = false;
	public readonly multiplier: number = 0;
	public readonly isExtensionContributed = true;
	public readonly supportedEditTools?: readonly EndpointEditToolName[] | undefined;

	constructor(
		private readonly languageModel: vscode.LanguageModelChat,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IOTelService private readonly _otelService: IOTelService,
	) {
		// Initialize with the model's max tokens
		this._maxTokens = languageModel.maxInputTokens;
		this.supportedEditTools = languageModel.capabilities.editToolsHint?.filter(isEndpointEditToolName);
	}

	get modelProvider(): string {
		return this.languageModel.vendor;
	}

	get modelMaxPromptTokens(): number {
		return this._maxTokens;
	}

	get maxOutputTokens(): number {
		// The VS Code API doesn't expose max output tokens, use a reasonable default
		return 8192;
	}

	get urlOrRequestMetadata(): string {
		// Not used for extension contributed endpoints
		return '';
	}

	get model(): string {
		return this.languageModel.id;
	}

	get name(): string {
		return this.languageModel.name;
	}

	get version(): string {
		return this.languageModel.version;
	}

	get family(): string {
		return this.languageModel.family;
	}

	get tokenizer(): TokenizerType {
		// Most language models use the O200K tokenizer, if they don't they should specify in their metadata
		return TokenizerType.O200K;
	}

	get showInModelPicker(): boolean {
		// TODO @lramos15 - Need some API exposed for this, registration seems to have it
		return true;
	}

	get supportsToolCalls(): boolean {
		return this.languageModel.capabilities?.supportsToolCalling ?? false;
	}

	get supportsVision(): boolean {
		return this.languageModel?.capabilities?.supportsImageToText ?? false;
	}

	get supportsPrediction(): boolean {
		return false;
	}

	get policy(): 'enabled' | { terms: string } {
		return 'enabled';
	}

	async processResponseFromChatEndpoint(
		telemetryService: ITelemetryService,
		logService: ILogService,
		response: Response,
		expectedNumChoices: number,
		finishCallback: FinishedCallback,
		telemetryData: TelemetryData,
		cancellationToken?: CancellationToken
	): Promise<AsyncIterableObject<ChatCompletion>> {
		throw new Error('processResponseFromChatEndpoint not supported for extension contributed endpoints');
	}

	async acceptChatPolicy(): Promise<boolean> {
		return true;
	}

	public acquireTokenizer(): ITokenizer {
		// Use the extension-contributed tokenizer that leverages the VS Code language model API
		return new ExtensionContributedChatTokenizer(this.languageModel);
	}

	async makeChatRequest(
		debugName: string,
		messages: Raw.ChatMessage[],
		finishedCb: FinishedCallback | undefined,
		token: CancellationToken,
		location: ChatLocation,
		source?: { extensionId?: string | undefined },
		requestOptions?: Omit<OptionalChatRequestParams, 'n'>,
		userInitiatedRequest?: boolean,
		telemetryProperties?: Record<string, string>,
	): Promise<ChatResponse> {
		return this.makeChatRequest2({
			debugName,
			messages,
			finishedCb,
			location,
			source,
			requestOptions,
			userInitiatedRequest,
			telemetryProperties,
		}, token);
	}

	async makeChatRequest2({
		debugName,
		messages,
		requestOptions,
		finishedCb,
		location,
		source,
	}: IMakeChatRequestOptions, token: CancellationToken): Promise<ChatResponse> {
		const vscodeMessages = convertToApiChatMessage(messages);
		const ourRequestId = generateUuid();

		// Capture active OTel trace context to propagate through IPC to the BYOK provider.
		// Each provider creates its own chat span with full usage data:
		// - OpenAI-compatible (Azure, OpenAI, etc.): via CopilotLanguageModelWrapper → chatMLFetcher
		// - Anthropic: inside AnthropicLMProvider
		// - Gemini: inside GeminiNativeBYOKLMProvider
		const activeTraceCtx = this._otelService.getActiveTraceContext();

		const vscodeOptions: vscode.LanguageModelChatRequestOptions = {
			tools: ((requestOptions?.tools ?? []) as OpenAiFunctionTool[]).map(tool => ({
				name: tool.function.name,
				description: tool.function.description,
				inputSchema: tool.function.parameters,
			})),
			// Pass correlation ID and OTel trace context through modelOptions for cross-IPC restoration.
			modelOptions: {
				_capturingTokenCorrelationId: ourRequestId,
				_otelTraceContext: activeTraceCtx ?? null,
			}
		};

		// Store current CapturingToken for retrieval by BYOK providers after IPC crossing
		//
		// Note: We intentionally don't create an OTel chat span here for extension-contributed models.
		// The BYOK provider (CopilotLanguageModelWrapper) creates the real chat span via chatMLFetcher
		// with full token usage, response model, and cache data. Creating a span here would duplicate it.
		storeCapturingTokenForCorrelation(ourRequestId);

		const streamRecorder = new FetchStreamRecorder(finishedCb);

		try {
			const response = await this.languageModel.sendRequest(vscodeMessages, vscodeOptions, token);
			let text = '';
			let numToolsCalled = 0;
			let extensionUsage: APIUsage | undefined;
			const requestId = ourRequestId;

			// consume stream
			for await (const chunk of response.stream) {
				if (chunk instanceof vscode.LanguageModelTextPart) {
					text += chunk.value;
					if (streamRecorder.callback) {
						await streamRecorder.callback(text, 0, { text: chunk.value });
					}
				} else if (chunk instanceof vscode.LanguageModelToolCallPart) {
					if (streamRecorder.callback) {
						const functionCalls = [chunk].map(tool => ({
							name: tool.name ?? '',
							arguments: JSON.stringify(tool.input) ?? '',
							id: tool.callId
						}));
						numToolsCalled++;
						await streamRecorder.callback(text, 0, { text: '', copilotToolCalls: functionCalls });
					}
				} else if (chunk instanceof vscode.LanguageModelDataPart) {
					if (chunk.mimeType === CustomDataPartMimeTypes.StatefulMarker) {
						const decoded = decodeStatefulMarker(chunk.data);
						await streamRecorder.callback?.(text, 0, { text: '', statefulMarker: decoded.marker });
					} else if (chunk.mimeType === CustomDataPartMimeTypes.ContextManagement) {
						const contextManagement = JSON.parse(new TextDecoder().decode(chunk.data)) as ContextManagementResponse;
						await streamRecorder.callback?.(text, 0, { text: '', contextManagement });
					} else if (chunk.mimeType === CustomDataPartMimeTypes.Usage) {
						// Last-valid-wins: if a provider emits multiple Usage parts
						// the final *parseable* one is reported. This matches the
						// OpenAI streaming convention where the terminating chunk
						// carries the tally, while ensuring a malformed trailing
						// part can't blow away an earlier valid reading.
						const parsed = parseExtensionContributedUsage(chunk.data);
						if (parsed) {
							extensionUsage = parsed;
						}
					}
				} else if (chunk instanceof vscode.LanguageModelThinkingPart) {
					if (streamRecorder.callback) {
						await streamRecorder.callback(text, 0, {
							text: '',
							thinking: {
								text: chunk.value,
								id: chunk.id || '',
								metadata: chunk.metadata
							}
						});
					}
				}
			}

			if (text || numToolsCalled > 0) {
				return {
					type: ChatFetchResponseType.Success,
					requestId,
					serverRequestId: requestId,
					// Prefer the provider-supplied counts so the Context Window
					// indicator and any token-usage telemetry reflect reality.
					// When the provider doesn't emit a Usage data part we keep
					// the historical zero-fallback behaviour.
					usage: extensionUsage ?? ZERO_USAGE,
					value: text,
					resolvedModel: this.languageModel.id
				};
			} else {
				return {
					type: ChatFetchResponseType.Unknown,
					reason: 'No response from language model',
					requestId: requestId,
					serverRequestId: undefined
				};
			}
		} catch (e) {
			return {
				type: ChatFetchResponseType.Failed,
				reason: toErrorMessage(e, true),
				requestId: generateUuid(),
				serverRequestId: undefined
			};
		} finally {
			retrieveCapturingTokenByCorrelation(ourRequestId);
		}
	}

	createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		throw new Error('unreachable'); // this endpoint does not call into fetchers
	}

	cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		return this._instantiationService.createInstance(ExtensionContributedChatEndpoint, {
			...this.languageModel,
			maxInputTokens: modelMaxPromptTokens
		});
	}
}

export function convertToApiChatMessage(messages: Raw.ChatMessage[]): Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2> {
	const apiMessages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2> = [];
	for (const message of messages) {
		const apiContent: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolResultPart2 | vscode.LanguageModelToolCallPart | vscode.LanguageModelDataPart | vscode.LanguageModelThinkingPart> = [];
		// Easier to work with arrays everywhere, rather than string in some cases. So convert to a single text content part
		for (const contentPart of message.content) {
			if (contentPart.type === Raw.ChatCompletionContentPartKind.Text) {
				apiContent.push(new vscode.LanguageModelTextPart(contentPart.text));
			} else if (contentPart.type === Raw.ChatCompletionContentPartKind.Image) {
				// Handle base64 encoded images
				if (contentPart.imageUrl.url.startsWith('data:')) {
					const dataUrlRegex = /^data:([^;]+);base64,(.*)$/;
					const match = contentPart.imageUrl.url.match(dataUrlRegex);

					if (match) {
						const [, mimeType, base64Data] = match;
						apiContent.push(new vscode.LanguageModelDataPart(Buffer.from(base64Data, 'base64'), mimeType as ChatImageMimeType));
					}
				} else {
					// Not a base64 image
					continue;
				}
			} else if (contentPart.type === Raw.ChatCompletionContentPartKind.CacheBreakpoint) {
				apiContent.push(new vscode.LanguageModelDataPart(new TextEncoder().encode('ephemeral'), CustomDataPartMimeTypes.CacheControl));
			} else if (contentPart.type === Raw.ChatCompletionContentPartKind.Opaque) {
				const statefulMarker = rawPartAsStatefulMarker(contentPart);
				if (statefulMarker) {
					apiContent.push(new vscode.LanguageModelDataPart(encodeStatefulMarker(statefulMarker.modelId, statefulMarker.marker), CustomDataPartMimeTypes.StatefulMarker));
				}
				const thinkingData = rawPartAsThinkingData(contentPart);
				if (thinkingData) {
					apiContent.push(new vscode.LanguageModelThinkingPart(thinkingData.text, thinkingData.id, thinkingData.metadata));
				}
			}
		}

		if (message.role === Raw.ChatRole.System || message.role === Raw.ChatRole.User) {
			apiMessages.push({
				role: message.role === Raw.ChatRole.System ? vscode.LanguageModelChatMessageRole.System : vscode.LanguageModelChatMessageRole.User,
				name: message.name,
				content: apiContent
			});
		} else if (message.role === Raw.ChatRole.Assistant) {
			if (message.toolCalls) {
				for (const toolCall of message.toolCalls) {
					apiContent.push(new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.function.name, JSON.parse(toolCall.function.arguments)));
				}
			}
			apiMessages.push({
				role: vscode.LanguageModelChatMessageRole.Assistant,
				name: message.name,
				content: apiContent
			});
		} else if (message.role === Raw.ChatRole.Tool) {
			const toolResultPart: vscode.LanguageModelToolResultPart2 = new vscode.LanguageModelToolResultPart2(
				message.toolCallId ?? '',
				apiContent
			);
			apiMessages.push({
				role: vscode.LanguageModelChatMessageRole.User,
				name: '',
				content: [toolResultPart]
			});
		}
	}
	return apiMessages;
}
