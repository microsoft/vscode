/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken } from 'vscode';
import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { isKimiFamily } from '../../../platform/endpoint/common/chatModelCapabilities';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { ChatEndpoint, normalizeKimiToolCallIds } from '../../../platform/endpoint/node/chatEndpoint';
import { ILogService } from '../../../platform/log/common/logService';
import { isOpenAiFunctionTool } from '../../../platform/networking/common/fetch';
import { createCapiRequestBody, IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IMakeChatRequestOptions } from '../../../platform/networking/common/networking';
import { RawMessageConversionCallback } from '../../../platform/networking/common/openai';
import { IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { DEFAULT_FORBIDDEN_CUSTOM_HEADERS, sanitizeCustomRequestHeaders } from '../common/sanitizeCustomHeaders';

function hydrateBYOKErrorMessages(response: ChatResponse): ChatResponse {
	if (response.type === ChatFetchResponseType.Failed && response.streamError) {
		return {
			type: response.type,
			requestId: response.requestId,
			serverRequestId: response.serverRequestId,
			// A stream error carrying no message has no diagnostic value, so keep the
			// original reason rather than replacing it with a hollow serialized struct.
			reason: response.streamError.message ? JSON.stringify(response.streamError) : response.reason,
		};
	} else if (response.type === ChatFetchResponseType.RateLimited) {
		return {
			type: response.type,
			requestId: response.requestId,
			serverRequestId: response.serverRequestId,
			reason: response.capiError ? 'Rate limit exceeded\n\n' + JSON.stringify(response.capiError) : 'Rate limit exceeded',
			rateLimitKey: '',
			retryAfter: undefined,
			isAuto: false,
			capiError: response.capiError
		};
	}
	return response;
}

/**
 * Checks to see if a given endpoint is a BYOK model.
 * @param endpoint The endpoint to check if it's a BYOK model
 * @returns 1 if client side byok, 2 if server side byok, -1 if not a byok model
 */
export function isBYOKModel(endpoint: IChatEndpoint | undefined): number {
	if (!endpoint) {
		return -1;
	}
	return (endpoint instanceof OpenAIEndpoint || endpoint.isExtensionContributed) ? 1 : (endpoint.customModel ? 2 : -1);
}

export class OpenAIEndpoint extends ChatEndpoint {
	protected readonly _customHeaders: Record<string, string>;
	constructor(
		_modelMetadata: IChatModelInformation,
		protected readonly _apiKey: string,
		protected readonly _modelUrl: string,
		@IDomainService domainService: IDomainService,
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@IChatWebSocketManager chatWebSocketService: IChatWebSocketManager,
		@ILogService protected logService: ILogService
	) {
		super(
			_modelMetadata,
			domainService,
			chatMLFetcher,
			tokenizerProvider,
			instantiationService,
			configurationService,
			expService,
			chatWebSocketService,
			logService
		);
		this._customHeaders = sanitizeCustomRequestHeaders(_modelMetadata.requestHeaders, {
			modelId: this.modelMetadata.id,
			logPrefix: '[OpenAIEndpoint] ',
			isReservedHeader: lowerKey => this._isReservedHeader(lowerKey),
			onWarning: message => this.logService.warn(message),
		});
	}

	/**
	 * BYOK endpoints supply their own credential (`api-key` / `Authorization`)
	 * via {@link getExtraHeaders}, so the chat fetcher must not fall back to the
	 * CAPI Copilot bearer token nor raise a missing-key error for these requests.
	 */
	public readonly ownsAuthorization = true;

	protected override getCompletionsCallback(): RawMessageConversionCallback {
		const supportsThinking = !!this.modelMetadata.capabilities.supports.thinking;
		return (out, data) => {
			if (data?.id) {
				out.cot_id = data.id;
				const text = Array.isArray(data.text) ? data.text.join('') : data.text;
				out.cot_summary = text;
				if (supportsThinking) {
					out.reasoning_content = text;
					out.reasoning = text;
				}
			}
		};
	}

	protected _isReservedHeader(lowerKey: string): boolean {
		return DEFAULT_FORBIDDEN_CUSTOM_HEADERS.has(lowerKey);
	}

	override createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		if (this.useResponsesApi) {
			// Handle Responses API: customize the body directly
			const zdr = !!this.modelMetadata.zeroDataRetentionEnabled;
			// When ZDR is on the server refuses to retain responses, so we must
			// not chain via `previous_response_id` and must not ask it to `store`.
			options.ignoreStatefulMarker = options.ignoreStatefulMarker || zdr;
			const body = super.createRequestBody(options);
			body.store = !zdr;
			body.n = undefined;
			body.stream_options = undefined;
			if (!this.modelMetadata.capabilities.supports.thinking) {
				body.reasoning = undefined;
				body.include = undefined;
			}
			if (body.previous_response_id && (!body.previous_response_id.startsWith('resp_') || zdr)) {
				// Don't use a response ID from CAPI or when zero data retention is enabled
				body.previous_response_id = undefined;
			}
			this._applyReasoningEffort(body, options);
			return this._applyConfiguredModelOptions(body, options);
		} else if (this.useMessagesApi) {
			// Delegate to base ChatEndpoint for Messages API dispatch
			const body = super.createRequestBody(options);
			this._applyReasoningEffort(body, options);
			return this._applyConfiguredModelOptions(body, options);
		} else {
			const body = createCapiRequestBody(options, this.model, this.getCompletionsCallback());
			if (body.messages && isKimiFamily(this)) {
				body.messages = normalizeKimiToolCallIds(body.messages);
			}
			this._applyReasoningEffort(body, options);
			return this._applyConfiguredModelOptions(body, options);
		}
	}

	private _applyConfiguredModelOptions(body: IEndpointBody, options: ICreateEndpointBodyOptions): IEndpointBody {
		const modelOptions = this.modelMetadata.modelOptions;
		if (!modelOptions) {
			return body;
		}

		for (const key of ['temperature', 'top_p'] as const) {
			const requestValue = options.requestOptions?.[key];
			if (requestValue !== undefined) {
				body[key] = requestValue;
				continue;
			}

			const configuredValue = modelOptions[key];
			if (configuredValue === null) {
				delete body[key];
			} else if (configuredValue !== undefined) {
				body[key] = configuredValue;
			}
		}

		return body;
	}

	/**
	 * Forwards the per-request reasoning effort to the model body in the shape the endpoint expects.
	 * Default shape mirrors the API path (`Responses` \u2192 nested `reasoning.effort`, `Messages` \u2192 `output_config.effort`,
	 * `Chat Completions` \u2192 top-level `reasoning_effort`).
	 * `IChatModelInformation.reasoningEffortFormat` overrides the default so users hosting OpenAI-compatible servers
	 * with diverging conventions (e.g. nested `reasoning.effort` on `/chat/completions`) can opt in deterministically.
	 */
	private _applyReasoningEffort(body: IEndpointBody, options: ICreateEndpointBodyOptions): void {
		const supports = this.supportsReasoningEffort;
		if (!supports?.length) {
			return;
		}
		const format = this.modelMetadata.reasoningEffortFormat
			?? (this.useResponsesApi ? 'responses' : this.useMessagesApi ? 'messages' : 'chat-completions');
		const override = this._configurationService.getConfig(ConfigKey.Advanced.ReasoningEffortOverride);
		const requested = override || options.modelCapabilities?.reasoningEffort || body.reasoning?.effort || body.reasoning_effort || body.output_config?.effort;
		const effort = requested && supports.includes(requested) ? requested : undefined;
		// Scrub any pre-populated effort first so unsupported values (e.g. the hard-coded `medium` default
		// from `createResponsesRequestBody`) cannot leak through, then write the resolved value into the
		// expected shape.
		if (body.reasoning) {
			const { effort: _drop, ...rest } = body.reasoning;
			body.reasoning = Object.keys(rest).length > 0 ? rest : undefined;
		}
		body.reasoning_effort = undefined;
		if (body.output_config) {
			// Drop only the effort so other output_config fields (e.g. structured output format) survive
			const { effort: _drop, ...rest } = body.output_config;
			body.output_config = Object.keys(rest).length > 0 ? rest : undefined;
		}
		if (effort) {
			if (format === 'responses') {
				body.reasoning = { ...body.reasoning, effort };
			} else if (format === 'messages') {
				body.output_config = { ...body.output_config, effort };
			} else {
				body.reasoning_effort = effort;
			}
		}
	}

	override interceptBody(body: IEndpointBody | undefined): void {
		super.interceptBody(body);
		// TODO @lramos15 - We should do this for all models and not just here
		if (body?.tools?.length === 0) {
			delete body.tools;
		}

		if (body?.tools) {
			body.tools = body.tools.map(tool => {
				if (isOpenAiFunctionTool(tool) && tool.function.parameters === undefined) {
					tool.function.parameters = { type: 'object', properties: {} };
				}
				return tool;
			});
		}

		if (body) {
			if (this.modelMetadata.capabilities.supports.thinking) {
				delete body.temperature;
				if (!this.useMessagesApi && !this.useResponsesApi) {
					// OpenAI Chat Completions thinking models (e.g. o1/o3) require `max_completion_tokens` instead of `max_tokens`.
					// Responses bodies use `max_output_tokens` natively, and Messages requires `max_tokens` — neither needs this rename.
					body['max_completion_tokens'] = body.max_tokens;
					delete body.max_tokens;
				}
			}
			// Chat Completions: drop `max_tokens` so the server defaults to its maximum (preferred for BYOK).
			// Responses uses `max_output_tokens`, so this delete is a no-op there. Messages requires `max_tokens`, so leave it alone.
			if (!this.useMessagesApi) {
				delete body.max_tokens;
			}
			if (!this.useResponsesApi && !this.useMessagesApi && body.stream) {
				body['stream_options'] = { 'include_usage': true };
			}
		}
	}

	override get urlOrRequestMetadata(): string {
		return this._modelUrl;
	}

	public override getExtraHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};
		if (this._modelUrl.includes('openai.azure')) {
			headers['api-key'] = this._apiKey;
		} else {
			headers['Authorization'] = `Bearer ${this._apiKey}`;
		}
		for (const [key, value] of Object.entries(this._customHeaders)) {
			headers[key] = value;
		}
		return headers;
	}

	override cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		const newModelInfo = { ...this.modelMetadata, maxInputTokens: modelMaxPromptTokens };
		return this.instantiationService.createInstance(OpenAIEndpoint, newModelInfo, this._apiKey, this._modelUrl);
	}

	public override async makeChatRequest2(options: IMakeChatRequestOptions, token: CancellationToken): Promise<ChatResponse> {
		// Use ignoreStatefulMarker: false as the initial request default; the parent retry flow can override it on InvalidStatefulMarker retries.
		const modifiedOptions: IMakeChatRequestOptions = { ...options, ignoreStatefulMarker: options.ignoreStatefulMarker ?? false };
		const response = await super.makeChatRequest2(modifiedOptions, token);
		return hydrateBYOKErrorMessages(response);
	}
}
