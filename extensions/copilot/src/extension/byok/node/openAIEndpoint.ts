/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken } from 'vscode';
import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { ChatEndpoint } from '../../../platform/endpoint/node/chatEndpoint';
import { ILogService } from '../../../platform/log/common/logService';
import { isOpenAiFunctionTool } from '../../../platform/networking/common/fetch';
import { createCapiRequestBody, IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IMakeChatRequestOptions } from '../../../platform/networking/common/networking';
import { RawMessageConversionCallback } from '../../../platform/networking/common/openai';
import { IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

function hydrateBYOKErrorMessages(response: ChatResponse): ChatResponse {
	if (response.type === ChatFetchResponseType.Failed && response.streamError) {
		return {
			type: response.type,
			requestId: response.requestId,
			serverRequestId: response.serverRequestId,
			reason: JSON.stringify(response.streamError),
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
	// Reserved headers that cannot be overridden for security and functionality reasons
	// Including forbidden request headers: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header
	private static readonly _reservedHeaders: ReadonlySet<string> = new Set([
		// Forbidden Request Headers
		'accept-charset',
		'accept-encoding',
		'access-control-request-headers',
		'access-control-request-method',
		'connection',
		'content-length',
		'cookie',
		'date',
		'dnt',
		'expect',
		'host',
		'keep-alive',
		'origin',
		'permissions-policy',
		'referer',
		'te',
		'trailer',
		'transfer-encoding',
		'upgrade',
		'user-agent',
		'via',
		// Forwarding & Routing
		'forwarded',
		'x-forwarded-for',
		'x-forwarded-host',
		'x-forwarded-proto',
		// Others
		'api-key',
		'authorization',
		'content-type',
		'openai-intent',
		'x-github-api-version',
		'x-initiator',
		'x-interaction-id',
		'x-interaction-type',
		'x-onbehalf-extension-id',
		'x-request-id',
		'x-vscode-user-agent-library-version',
		// Pattern-based forbidden headers are checked separately:
		// - 'proxy-*' headers (handled in sanitization logic)
		// - 'sec-*' headers (handled in sanitization logic)
		// - 'x-http-method*' with forbidden methods CONNECT, TRACE, TRACK (handled in sanitization logic)
	]);

	// RFC 7230 compliant header name pattern: token characters only
	private static readonly _validHeaderNamePattern = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;

	// Maximum limits to prevent abuse
	private static readonly _maxHeaderNameLength = 256;
	private static readonly _maxHeaderValueLength = 8192;
	private static readonly _maxCustomHeaderCount = 20;

	private readonly _customHeaders: Record<string, string>;
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
		this._customHeaders = this._sanitizeCustomHeaders(_modelMetadata.requestHeaders);
	}

	private _sanitizeCustomHeaders(headers: Readonly<Record<string, string>> | undefined): Record<string, string> {
		if (!headers) {
			return {};
		}

		const entries = Object.entries(headers);

		if (entries.length > OpenAIEndpoint._maxCustomHeaderCount) {
			this.logService.warn(`[OpenAIEndpoint] Model '${this.modelMetadata.id}' has ${entries.length} custom headers, exceeding limit of ${OpenAIEndpoint._maxCustomHeaderCount}. Only first ${OpenAIEndpoint._maxCustomHeaderCount} will be processed.`);
		}

		const sanitized: Record<string, string> = {};
		let processedCount = 0;

		for (const [rawKey, rawValue] of entries) {
			if (processedCount >= OpenAIEndpoint._maxCustomHeaderCount) {
				break;
			}

			const key = rawKey.trim();
			if (!key) {
				this.logService.warn(`[OpenAIEndpoint] Model '${this.modelMetadata.id}' has empty header name, skipping.`);
				continue;
			}

			if (key.length > OpenAIEndpoint._maxHeaderNameLength) {
				this.logService.warn(`[OpenAIEndpoint] Model '${this.modelMetadata.id}' has header name exceeding ${OpenAIEndpoint._maxHeaderNameLength} characters, skipping.`);
				continue;
			}

			if (!OpenAIEndpoint._validHeaderNamePattern.test(key)) {
				this.logService.warn(`[OpenAIEndpoint] Model '${this.modelMetadata.id}' has invalid header name format: '${key}', Skipping.`);
				continue;
			}

			const lowerKey = key.toLowerCase();
			if (OpenAIEndpoint._reservedHeaders.has(lowerKey)) {
				this.logService.warn(`[OpenAIEndpoint] Model '${this.modelMetadata.id}' attempted to override reserved header '${key}', skipping.`);
				continue;
			}

			// Check for pattern-based forbidden headers
			if (lowerKey.startsWith('proxy-') || lowerKey.startsWith('sec-')) {
				this.logService.warn(`[OpenAIEndpoint] Model '${this.modelMetadata.id}' attempted to set forbidden header pattern '${key}', skipping.`);
				continue;
			}

			// Check for X-HTTP-Method* headers with forbidden methods
			if ((lowerKey === 'x-http-method' || lowerKey === 'x-http-method-override' || lowerKey === 'x-method-override')) {
				const forbiddenMethods = ['connect', 'trace', 'track'];
				const methodValue = String(rawValue).toLowerCase().trim();
				if (forbiddenMethods.includes(methodValue)) {
					this.logService.warn(`[OpenAIEndpoint] Model '${this.modelMetadata.id}' attempted to set forbidden method '${methodValue}' in header '${key}', skipping.`);
					continue;
				}
			}

			const sanitizedValue = this._sanitizeHeaderValue(rawValue);
			if (sanitizedValue === undefined) {
				this.logService.warn(`[OpenAIEndpoint] Model '${this.modelMetadata.id}' has invalid value for header '${key}': '${rawValue}', skipping.`);
				continue;
			}

			sanitized[key] = sanitizedValue;
			processedCount++;
		}

		return sanitized;
	}

	private _sanitizeHeaderValue(value: unknown): string | undefined {
		if (typeof value !== 'string') {
			return undefined;
		}

		const trimmed = value.trim();

		if (trimmed.length > OpenAIEndpoint._maxHeaderValueLength) {
			return undefined;
		}

		// Disallow control characters including CR, LF, and others (0x00-0x1F, 0x7F)
		// This prevents HTTP header injection and response splitting attacks
		if (/[\x00-\x1F\x7F]/.test(trimmed)) {
			return undefined;
		}

		// Additional check for potential Unicode issues
		// Reject headers with bidirectional override characters or zero-width characters
		if (/[\u200B-\u200D\u202A-\u202E\uFEFF]/.test(trimmed)) {
			return undefined;
		}

		return trimmed;
	}

	override createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		if (this.useResponsesApi) {
			// Handle Responses API: customize the body directly
			options.ignoreStatefulMarker = false;
			const body = super.createRequestBody(options);
			body.store = true;
			body.n = undefined;
			body.stream_options = undefined;
			if (!this.modelMetadata.capabilities.supports.thinking) {
				body.reasoning = undefined;
				body.include = undefined;
			}
			if (body.previous_response_id && (!body.previous_response_id.startsWith('resp_') || this.modelMetadata.zeroDataRetentionEnabled)) {
				// Don't use a response ID from CAPI or when zero data retention is enabled
				body.previous_response_id = undefined;
			}
			this._applyReasoningEffort(body, options);
			return body;
		} else if (this.useMessagesApi) {
			// Delegate to base ChatEndpoint for Messages API dispatch
			return super.createRequestBody(options);
		} else {
			// Handle CAPI: provide callback for thinking data processing
			const callback: RawMessageConversionCallback = (out, data) => {
				if (data && data.id) {
					out.cot_id = data.id;
					out.cot_summary = Array.isArray(data.text) ? data.text.join('') : data.text;
				}
			};
			const body = createCapiRequestBody(options, this.model, callback);
			this._applyReasoningEffort(body, options);
			return body;
		}
	}

	/**
	 * Forwards the per-request reasoning effort to the model body in the shape the endpoint expects.
	 * Default shape mirrors the API path (`Responses` \u2192 nested `reasoning.effort`, `Chat Completions` \u2192 top-level `reasoning_effort`).
	 * `IChatModelInformation.reasoningEffortFormat` overrides the default so users hosting OpenAI-compatible servers
	 * with diverging conventions (e.g. nested `reasoning.effort` on `/chat/completions`) can opt in deterministically.
	 */
	private _applyReasoningEffort(body: IEndpointBody, options: ICreateEndpointBodyOptions): void {
		const supports = this.supportsReasoningEffort;
		if (!supports?.length) {
			return;
		}
		const format = this.modelMetadata.reasoningEffortFormat
			?? (this.useResponsesApi ? 'responses' : 'chat-completions');
		const override = this._configurationService.getConfig(ConfigKey.Advanced.ReasoningEffortOverride);
		const requested = override || options.modelCapabilities?.reasoningEffort || body.reasoning?.effort || body.reasoning_effort;
		const effort = requested && supports.includes(requested) ? requested : undefined;
		// Scrub any pre-populated effort first so unsupported values (e.g. the hard-coded `medium` default
		// from `createResponsesRequestBody`) cannot leak through, then write the resolved value into the
		// expected shape.
		if (body.reasoning) {
			const { effort: _drop, ...rest } = body.reasoning;
			body.reasoning = Object.keys(rest).length > 0 ? rest : undefined;
		}
		body.reasoning_effort = undefined;
		if (effort) {
			if (format === 'responses') {
				body.reasoning = { ...body.reasoning, effort };
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
				body['max_completion_tokens'] = body.max_tokens;
				delete body.max_tokens;
			}
			// Removing max tokens defaults to the maximum which is what we want for BYOK
			delete body.max_tokens;
			if (!this.useResponsesApi && body.stream) {
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
		// Apply ignoreStatefulMarker: false for initial request
		const modifiedOptions: IMakeChatRequestOptions = { ...options, ignoreStatefulMarker: false };
		const response = await super.makeChatRequest2(modifiedOptions, token);
		return hydrateBYOKErrorMessages(response);
	}
}
