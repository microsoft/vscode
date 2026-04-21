/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestMetadata } from '@vscode/copilot-api';
import { Raw } from '@vscode/prompt-tsx';
import type { CancellationToken } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { ITokenizer, TokenizerType } from '../../../util/common/tokenizer';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Source } from '../../chat/common/chatMLFetcher';
import type { ChatLocation, ChatResponse } from '../../chat/common/commonTypes';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { CustomModel, EndpointEditToolName } from '../../endpoint/common/endpointProvider';
import { ILogService } from '../../log/common/logService';
import { ITelemetryService, TelemetryProperties } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';
import { AnthropicMessagesTool, ContextManagement } from './anthropic';
import { FinishedCallback, OpenAiFunctionTool, OpenAiResponsesFunctionTool, OptionalChatRequestParams, Prediction } from './fetch';
import { FetcherId, FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response } from './fetcherService';
import { ChatCompletion, OpenAIContextManagement, RawMessageConversionCallback, rawMessageToCAPI } from './openai';

/**
 * Encapsulates all the functionality related to making GET/POST requests using
 * different libraries (and in the future, different environments like web vs
 * node).
 */
export interface IFetcher {
	getUserAgentLibrary(): string;
	fetch(url: string, options: FetchOptions): Promise<Response>;
	disconnectAll(): Promise<unknown>;
	makeAbortController(): IAbortController;
	isAbortError(e: any): boolean;
	isInternetDisconnectedError(e: any): boolean;
	isFetcherError(err: any): boolean;
	isNetworkProcessCrashedError(err: any): boolean;
	getUserMessageForFetcherError(err: any): string;
	fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]>;
}

export const userAgentLibraryHeader = 'X-VSCode-User-Agent-Library-Version';

export type ReqHeaders = { [key: string]: string };
/**
 * The HeaderContributor provides the interface which allows implmentors
 * to decorate a request's `headers` object with additional key / value pairs.
 */
export interface HeaderContributor {
	contributeHeaderValues(headers: ReqHeaders): void;
}

// The maximum time to wait for a request to complete.
const requestTimeoutMs = 30 * 1000; // 30 seconds


/**
 * Rough shape of an endpoint body. A superset of the parameters of any request,
 * but provided to at least have rough typings.
 */
export interface IEndpointBody {
	/** General or completions: */
	tools?: (OpenAiFunctionTool | OpenAiResponsesFunctionTool | AnthropicMessagesTool)[];
	model?: string;
	previous_response_id?: string;
	max_tokens?: number;
	max_output_tokens?: number;
	max_completion_tokens?: number;
	temperature?: number;
	top_p?: number;
	stream?: boolean;
	context_management?: ContextManagement | OpenAIContextManagement[];
	prediction?: Prediction;
	messages?: any[];
	n?: number;
	reasoning?: { effort?: string; summary?: string };
	tool_choice?: OptionalChatRequestParams['tool_choice'] | { type: 'function'; name: string } | string;
	top_logprobs?: number;
	intent?: boolean;
	intent_threshold?: number;
	state?: 'enabled';
	snippy?: { enabled: boolean };
	stream_options?: { include_usage?: boolean };
	prompt?: string;
	/** Embeddings endpoints only: */
	dimensions?: number;
	embed?: boolean;
	/** Chunking endpoints: */
	qos?: any;
	content?: string;
	path?: string;
	local_hashes?: string[];
	language_id?: number;
	/** docs search */
	query?: string;
	scopingQuery?: string;
	limit?: number;
	similarity?: number;
	/** Code search: */
	scoping_query?: string;

	/** Responses API: */
	input?: readonly any[];
	truncation?: 'auto' | 'disabled';
	prompt_cache_key?: string;
	include?: ['reasoning.encrypted_content'];
	store?: boolean;
	text?: {
		verbosity?: 'low' | 'medium' | 'high';
	};

	/** Messages API */
	thinking?: {
		type: 'enabled' | 'disabled' | 'adaptive';
		budget_tokens?: number;
	};
	output_config?: {
		effort?: 'low' | 'medium' | 'high';
	};

	/** ChatCompletions API for Anthropic models */
	thinking_budget?: number;
}

export interface IEndpointFetchOptions {
	suppressIntegrationId?: boolean;
}

export interface IEndpoint {
	readonly urlOrRequestMetadata: string | RequestMetadata;
	getExtraHeaders?(location?: ChatLocation): Record<string, string>;
	getEndpointFetchOptions?(): IEndpointFetchOptions;
	interceptBody?(body: IEndpointBody | undefined): void;
	acquireTokenizer(): ITokenizer;
	readonly modelMaxPromptTokens: number;
	readonly name: string;
	readonly version: string;
	readonly family: string;
	readonly tokenizer: TokenizerType;
}

export function stringifyUrlOrRequestMetadata(urlOrRequestMetadata: string | RequestMetadata): string {
	if (typeof urlOrRequestMetadata === 'string') {
		return urlOrRequestMetadata;
	}
	return JSON.stringify(urlOrRequestMetadata);
}

export interface IEmbeddingsEndpoint extends IEndpoint {
	readonly maxBatchSize: number;
}

/** Per-request model capability opt-ins. All off by default. */
export interface IModelCapabilityOptions {
	/** Explicitly enable thinking for this request. */
	enableThinking?: boolean;
	/** Reasoning effort level (e.g. 'low', 'medium', 'high'). Only used when enableThinking is true or when the model supports reasoning effort. */
	reasoningEffort?: string;
	/** Enable the tool search tool for this request. */
	enableToolSearch?: boolean;
	/** Enable context editing for this request. */
	enableContextEditing?: boolean;
}

export interface IMakeChatRequestOptions {
	/** The debug name for this request */
	debugName: string;
	/** The array of chat messages to send */
	messages: Raw.ChatMessage[];
	/** Enable WebSocket transport for this request when supported. */
	useWebSocket?: boolean;
	ignoreStatefulMarker?: boolean;
	/** Streaming callback for each response part. */
	finishedCb: FinishedCallback | undefined;
	/** Location where the chat message is being sent. */
	location: ChatLocation;
	/** Optional source of the chat request */
	source?: Source;
	/** Conversation identifier used for request-scoped state (for example WebSocket connection reuse). */
	conversationId?: string;
	/** Identifier for a single tool-calling turn within a conversation. */
	turnId?: string;
	/** Additional request options */
	requestOptions?: Omit<OptionalChatRequestParams, 'n'>;
	/** Indicates if the request was user-initiated */
	userInitiatedRequest?: boolean;
	/** Indicate whether this is a conversation request or a non-conversation utility request (like model list fetch or title generation) */
	isConversationRequest?: boolean;
	/** (CAPI-only) Optional telemetry properties for analytics */
	telemetryProperties?: IChatRequestTelemetryProperties;
	/** Enable retrying the request when it was filtered due to snippy. Note- if using finishedCb, requires supporting delta.retryReason, eg with clearToPreviousToolInvocation */
	enableRetryOnFilter?: boolean;
	/** Enable retrying the request when it failed. Defaults to enableRetryOnFilter. Note- if using finishedCb, requires supporting delta.retryReason, eg with clearToPreviousToolInvocation */
	enableRetryOnError?: boolean;
	/** Which fetcher to use, overrides the default. */
	useFetcher?: FetcherId;
	/** Per-request model capability opt-ins (thinking, tool search, context editing). */
	modelCapabilities?: IModelCapabilityOptions;
	/**
	 * The round ID at which the most recent client-side summarization occurred.
	 * Used to detect when the WebSocket stateful marker predates a summary.
	 */
	summarizedAtRoundId?: string;
	/** Enable retrying once on simple network errors like ECONNRESET. */
	canRetryOnceWithoutRollback?: boolean;
	/** Custom metadata to be displayed in the log document */
	customMetadata?: Record<string, string | number | boolean | undefined>;
	/**
	 * Options for the kind of request being made (e.g. subagent). Controls the X-Interaction-Type header.
	 * See notes on each interface.
	 */
	requestKindOptions?: IBackgroundRequestOptions | ISubagentRequestOptions;
}

export type IChatRequestTelemetryProperties = {
	requestId?: string;
	messageId?: string;
	conversationId?: string;
	messageSource?: string;
	associatedRequestId?: string;
	retryAfterError?: string;
	retryAfterErrorGitHubRequestId?: string;
	connectivityTestError?: string;
	connectivityTestErrorGitHubRequestId?: string;
	retryAfterFilterCategory?: string;
	/** A subtype for categorizing the request with a messageSource- eg subagent */
	subType?: string;
	/** For a subagent: The request ID of the parent request that invoked this subagent. */
	parentRequestId?: string;
	/** For a subagent: The tool_call_id from the parent agent's LLM response that triggered this subagent invocation. */
	parentToolCallId?: string;
};

export interface ICreateEndpointBodyOptions extends IMakeChatRequestOptions {
	requestId: string;
	postOptions: OptionalChatRequestParams;
}

export interface IChatEndpoint extends IEndpoint {
	readonly maxOutputTokens: number;
	/** The model ID- this may change and will be `copilot-base` for the base model. Use `family` to switch behavior based on model type. */
	readonly model: string;
	readonly modelProvider: string;
	readonly apiType?: string;
	readonly supportsThinkingContentInHistory?: boolean;
	readonly supportsAdaptiveThinking?: boolean;
	readonly minThinkingBudget?: number;
	readonly maxThinkingBudget?: number;
	readonly supportsReasoningEffort?: string[];
	readonly supportsToolSearch?: boolean;
	readonly supportsContextEditing?: boolean;
	readonly supportsToolCalls: boolean;
	readonly supportsVision: boolean;
	readonly supportsPrediction: boolean;
	readonly supportedEditTools?: readonly EndpointEditToolName[];
	readonly showInModelPicker: boolean;
	readonly isPremium?: boolean;
	readonly degradationReason?: string;
	readonly multiplier?: number;
	readonly restrictedToSkus?: string[];
	readonly isFallback: boolean;
	readonly customModel?: CustomModel;
	readonly isExtensionContributed?: boolean;
	readonly maxPromptImages?: number;
	/**
	 * Handles processing of responses from a chat endpoint. Each endpoint can have different response formats.
	 * @param telemetryService The telemetry service
	 * @param logService The log service
	 * @param response The response from the chat endpoint
	 * @param expectedNumChoices The expected number of choices in the response
	 * @param finishCallback A finish callback to indicate when the response should be complete
	 * @param telemetryData GH telemetry data from the originating request, will be extended with request information
	 * @param cancellationToken A cancellation tokenf for cancelling the request
	 * @returns An async iterable object of chat completions
	 */
	processResponseFromChatEndpoint(
		telemetryService: ITelemetryService,
		logService: ILogService,
		response: Response,
		expectedNumChoices: number,
		finishCallback: FinishedCallback,
		telemetryData: TelemetryData,
		cancellationToken?: CancellationToken,
		location?: ChatLocation,
	): Promise<AsyncIterableObject<ChatCompletion>>;

	/**
	 * Flights a request from the chat endpoint returning a chat response.
	 * Most of the time this is ChatMLFetcher#fetchOne, but it can be overridden for special cases.
	 * TODO @lramos15 - Support multiple completions in the future, we don't use this at the moment.
	 *
	 * @param userInitiatedRequest Is only applicable to CAPI requests
	 * @param telemetryProperties An object containing various properties for telemetry, e.g., can contain a field `requestId` that sets the header request ID
	 */
	makeChatRequest(
		debugName: string,
		messages: Raw.ChatMessage[],
		finishedCb: FinishedCallback | undefined,
		token: CancellationToken,
		location: ChatLocation,
		source?: Source,
		requestOptions?: Omit<OptionalChatRequestParams, 'n'>,
		userInitiatedRequest?: boolean,
		telemetryProperties?: TelemetryProperties,
	): Promise<ChatResponse>;

	/**
	 * Flights a request from the chat endpoint returning a chat response.
	 * Most of the time this is ChatMLFetcher#fetchOne, but it can be overridden for special cases.
	 */
	makeChatRequest2(options: IMakeChatRequestOptions, token: CancellationToken): Promise<ChatResponse>;

	/**
	 * Creates the request body to be sent to the endpoint based on the request.
	 */
	createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody;

	cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint;
}

/** Function to create a standard request body for CAPI completions */
export function createCapiRequestBody(options: ICreateEndpointBodyOptions, model: string, callback?: RawMessageConversionCallback) {
	// FIXME@ulugbekna: need to investigate why language configs have such stop words, eg
	// python has `\ndef` and `\nclass` which must be stop words for ghost text
	// const stops = getLanguageConfig<string[]>(accessor, ConfigKey.Stops);

	const request: IEndpointBody = {
		messages: rawMessageToCAPI(options.messages, callback),
		model,
		// stop: stops,
	};

	if (options.postOptions) {
		Object.assign(request, options.postOptions);
	}

	return request;
}

export interface INetworkRequestOptions {
	readonly requestType: 'GET' | 'POST';
	readonly endpointOrUrl: IEndpoint | string | RequestMetadata;
	readonly secretKey: string;
	readonly intent: string;
	readonly requestId: string;
	readonly body?: IEndpointBody;
	readonly additionalHeaders?: Record<string, string>;
	readonly cancelToken?: CancellationToken;
	readonly useFetcher?: FetcherId;
	readonly canRetryOnce?: boolean;
	readonly location?: ChatLocation;
	readonly requestKindOptions?: IBackgroundRequestOptions | ISubagentRequestOptions;
}

/**
 * A background request is one that is not associated with a user request.
 */
export interface IBackgroundRequestOptions {
	readonly kind: 'background';
}

/**
 * A subagent request is a request made by a subagent, indicated with a subAgentInvocationId included in the request from VS Code.
 */
export interface ISubagentRequestOptions {
	readonly kind: 'subagent';
}

function networkRequest(
	accessor: ServicesAccessor,
	options: INetworkRequestOptions,
): Promise<Response> {
	const fetcher = accessor.get(IFetcherService);
	const telemetryService = accessor.get(ITelemetryService);
	const capiClientService = accessor.get(ICAPIClientService);
	const { requestType, endpointOrUrl, secretKey, intent, requestId, body, additionalHeaders, cancelToken, useFetcher, canRetryOnce = true, location } = options;

	// TODO @lramos15 Eventually don't even construct this fake endpoint object.
	const endpoint = typeof endpointOrUrl === 'string' || 'type' in endpointOrUrl ? {
		modelMaxPromptTokens: 0,
		urlOrRequestMetadata: endpointOrUrl,
		family: '',
		tokenizer: TokenizerType.O200K,
		acquireTokenizer: () => {
			throw new Error('Method not implemented.');
		},
		name: '',
		version: '',
	} satisfies IEndpoint : endpointOrUrl;
	const agentInteractionType = options.requestKindOptions?.kind === 'subagent' ?
		'conversation-subagent' :
		options.requestKindOptions?.kind === 'background' ?
			'conversation-background' :
			intent === 'conversation-agent' ? intent :
				intent;

	const headers: ReqHeaders = {
		Authorization: `Bearer ${secretKey}`,
		'X-Request-Id': requestId,
		'OpenAI-Intent': intent, // Tells CAPI who flighted this request. Helps find buggy features
		'X-GitHub-Api-Version': '2025-05-01',
		...additionalHeaders,
		...(endpoint.getExtraHeaders ? endpoint.getExtraHeaders(location) : {}),
	};
	headers['X-Interaction-Type'] = agentInteractionType;
	headers['X-Agent-Task-Id'] = requestId;

	if (endpoint.interceptBody) {
		endpoint.interceptBody(body);
	}

	const endpointFetchOptions = endpoint.getEndpointFetchOptions?.();
	const request: FetchOptions = {
		callSite: `network-request-${intent}`,
		method: requestType,
		headers: headers,
		json: body,
		timeout: requestTimeoutMs,
		useFetcher,
		suppressIntegrationId: endpointFetchOptions?.suppressIntegrationId
	};

	if (cancelToken) {
		const abort = fetcher.makeAbortController();
		cancelToken.onCancellationRequested(() => {
			// abort the request when the token is canceled
			telemetryService.sendGHTelemetryEvent('networking.cancelRequest', {
				headerRequestId: requestId,
			});
			abort.abort();
		});
		// pass the controller abort signal to the request
		request.signal = abort.signal;
	}
	if (typeof endpoint.urlOrRequestMetadata === 'string') {
		const requestPromise = fetcher.fetch(endpoint.urlOrRequestMetadata, request).catch(reason => {
			if (canRetryOnce && canRetryOnceNetworkError(reason)) {
				// disconnect and retry the request once if the connection was reset
				telemetryService.sendGHTelemetryEvent('networking.disconnectAll');
				return fetcher.disconnectAll().then(() => {
					return fetcher.fetch(endpoint.urlOrRequestMetadata as string, request);
				});
			} else if (fetcher.isAbortError(reason)) {
				throw new CancellationError();
			} else {
				throw reason;
			}
		});
		return requestPromise;
	} else {
		return capiClientService.makeRequest(request, endpoint.urlOrRequestMetadata as RequestMetadata);
	}
}

export function canRetryOnceNetworkError(reason: any) {
	return [
		'ECONNRESET',
		'ETIMEDOUT',
		'ERR_CONNECTION_RESET',
		'ERR_NETWORK_CHANGED',
		'ERR_HTTP2_INVALID_SESSION',
		'ERR_HTTP2_STREAM_CANCEL',
		'ERR_HTTP2_GOAWAY_SESSION',
		'ERR_HTTP2_PROTOCOL_ERROR',
		'ERR_FAILED',
	].includes(reason?.code);
}

export function postRequest(
	accessor: ServicesAccessor,
	options: Omit<INetworkRequestOptions, 'requestType'>,
): Promise<Response> {
	return networkRequest(accessor, { ...options, requestType: 'POST' });
}

export function getRequest(
	accessor: ServicesAccessor,
	options: Omit<INetworkRequestOptions, 'requestType'>,
): Promise<Response> {
	return networkRequest(accessor, { ...options, requestType: 'GET' });
}

export const IHeaderContributors = createServiceIdentifier<HeaderContributors>('headerContributors');

export interface IHeaderContributors {
	readonly _serviceBrand: undefined;
	add(contributor: HeaderContributor): void;
	remove(contributor: HeaderContributor): void;
	contributeHeaders(headers: ReqHeaders): void;
	size(): number;
}

export class HeaderContributors implements IHeaderContributors {
	declare readonly _serviceBrand: undefined;
	private readonly contributors: HeaderContributor[] = [];

	add(contributor: HeaderContributor) {
		this.contributors.push(contributor);
	}

	remove(contributor: HeaderContributor) {
		const index = this.contributors.indexOf(contributor);

		if (index === -1) {
			return;
		}

		this.contributors.splice(index, 1);
	}

	contributeHeaders(headers: ReqHeaders) {
		for (const contributor of this.contributors) {
			contributor.contributeHeaderValues(headers);
		}
	}

	size() {
		return this.contributors.length;
	}
}
