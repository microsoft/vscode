/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageParam } from '@anthropic-ai/sdk/resources';
import { RequestMetadata, RequestType } from '@vscode/copilot-api';
import { Raw } from '@vscode/prompt-tsx';
import * as http from 'http';
import { IChatMLFetcher, Source } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { CustomModel, EndpointEditToolName } from '../../../../platform/endpoint/common/endpointProvider';
import { AnthropicMessagesProcessor } from '../../../../platform/endpoint/node/messagesApi';
import { ILogService } from '../../../../platform/log/common/logService';
import { IOTelService } from '../../../../platform/otel/common/otelService';
import { FinishedCallback, getRequestId, OptionalChatRequestParams } from '../../../../platform/networking/common/fetch';
import { Response } from '../../../../platform/networking/common/fetcherService';
import { IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IEndpointFetchOptions, IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { ChatCompletion } from '../../../../platform/networking/common/openai';
import { IRequestLogger } from '../../../../platform/requestLogger/common/requestLogger';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { TelemetryData } from '../../../../platform/telemetry/common/telemetryData';
import { ITokenizer, TokenizerType } from '../../../../util/common/tokenizer';
import { AsyncIterableObject } from '../../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Disposable, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { SSEParser } from '../../../../util/vs/base/common/sseParser';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IClaudeCodeModels } from './claudeCodeModels';
import { IClaudeSessionStateService } from '../common/claudeSessionStateService';

/**
 * A list of known Anthropic betas supported by CAPI. Used to filter incoming `anthropic-beta` header values
 * to prevent unsupported betas from being sent to CAPI.
 */
const SUPPORTED_ANTHROPIC_BETAS = [
	'interleaved-thinking',
	'context-management',
	'advanced-tool-use',
];

export interface IClaudeLanguageModelServerConfig {
	readonly port: number;
	readonly nonce: string;
}

interface AnthropicMessagesRequest {
	model: string;
	messages: MessageParam[];
	system?: string | Array<{ type: 'text'; text: string }>;
	max_tokens?: number;
	stream?: boolean;
	tools?: unknown[];
	[key: string]: unknown;
}

interface AnthropicErrorResponse {
	type: 'error';
	error: {
		type: 'invalid_request_error' | 'authentication_error' | 'permission_error' | 'not_found_error' | 'rate_limit_error' | 'api_error';
		message: string;
	};
}

const DEFAULT_MAX_TOKENS = 200_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 64_000;

/**
 * HTTP server that provides an Anthropic Messages API compatible endpoint.
 * Acts as a pure pass-through proxy to the underlying model endpoint.
 */
export class ClaudeLanguageModelServer extends Disposable {
	private server: http.Server;
	private config: IClaudeLanguageModelServerConfig;
	private readonly _userInitiatedMessageCounts = new Map<string, number>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IClaudeCodeModels private readonly claudeCodeModels: IClaudeCodeModels,
		@IOTelService private readonly _otelService: IOTelService,
	) {
		super();
		this.config = {
			port: 0, // Will be set to random available port
			nonce: 'vscode-lm-' + generateUuid()
		};

		this.server = this.createServer();
		this._register(toDisposable(() => this.stop()));
	}

	private createServer(): http.Server {
		return http.createServer(async (req, res) => {
			this.trace(`Received request: ${req.method} ${req.url}`);

			if (req.method === 'OPTIONS') {
				res.writeHead(200);
				res.end();
				return;
			}

			// Handle /v1/messages endpoint (also //messages if base URL ends in /)
			// Use URL to properly parse and extract pathname, ignoring query string
			const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
			if (req.method === 'POST' && (pathname === '/v1/messages' || pathname === '/messages' || pathname === '//messages')) {
				await this.handleMessagesRequest(req, res);
				return;
			}

			if (req.method === 'GET' && req.url === '/') {
				res.writeHead(200);
				res.end('Hello from ClaudeLanguageModelServer');
				return;
			}

			this.sendErrorResponse(res, 404, 'not_found_error', 'Not found');
		});
	}

	private async handleMessagesRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		try {
			const body = await this.readRequestBody(req);
			const auth = extractSessionId(req.headers, this.config.nonce);
			if (!auth.valid) {
				this.error('Invalid auth key');
				this.sendErrorResponse(res, 401, 'authentication_error', 'Invalid authentication');
				return;
			}

			await this.handleAuthedMessagesRequest(body, req.headers, res, auth.sessionId);
		} catch (error) {
			this.sendErrorResponse(res, 500, 'api_error', error instanceof Error ? error.message : String(error));
		}
		return;
	}

	private async readRequestBody(req: http.IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			let body = '';
			req.on('data', chunk => {
				body += chunk.toString();
			});
			req.on('end', () => {
				resolve(body);
			});
			req.on('error', reject);
		});
	}

	private async handleAuthedMessagesRequest(bodyString: string, headers: http.IncomingHttpHeaders, res: http.ServerResponse, sessionId: string | undefined): Promise<void> {
		// Create cancellation token for the request
		const tokenSource = new CancellationTokenSource();

		try {
			const requestBody: AnthropicMessagesRequest = JSON.parse(bodyString);

			const fallbackModelId = sessionId ? this.sessionStateService.getModelIdForSession(sessionId) : undefined;
			const selectedEndpoint = await this.claudeCodeModels.resolveEndpoint(requestBody.model, fallbackModelId);
			if (!selectedEndpoint) {
				this.error('No model found matching criteria');
				this.sendErrorResponse(res, 404, 'not_found_error', 'No model found matching criteria');
				return;
			}
			this.trace(`Session ${sessionId}: model=${selectedEndpoint.model}`);
			requestBody.model = selectedEndpoint.model;
			// Determine if this is a user-initiated message using counter-based approach
			const count = this._userInitiatedMessageCounts.get(selectedEndpoint.model) ?? 0;
			const isUserInitiatedMessage = count > 0;
			if (isUserInitiatedMessage) {
				this._userInitiatedMessageCounts.set(selectedEndpoint.model, count - 1);
			}

			// Set up streaming response
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
			});

			// Handle client disconnect
			let requestComplete = false;
			res.on('close', () => {
				if (!requestComplete) {
					this.info('Client disconnected before request complete');
				}

				tokenSource.cancel();
			});

			const endpointRequestBody = requestBody as IEndpointBody;
			const streamingEndpoint = this.instantiationService.createInstance(
				ClaudeStreamingPassThroughEndpoint,
				selectedEndpoint,
				res,
				endpointRequestBody,
				headers,
				'vscode_claude_code',
				{
					modelMaxPromptTokens: DEFAULT_MAX_TOKENS - DEFAULT_MAX_OUTPUT_TOKENS,
					maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS
				},
				sessionId
			);

			let messagesForLogging: Raw.ChatMessage[] = [];
			try {
				// Don't fail based on any assumptions about the shape of the request
				messagesForLogging = Array.isArray(requestBody.messages) ?
					messagesApiInputToRawMessagesForLogging(requestBody) :
					[];
			} catch (e) {
				this.exception(e as Error, `Failed to parse messages for logging`);
			}

			const capturingToken = sessionId ? this.sessionStateService.getCapturingTokenForSession(sessionId) : undefined;
			const sessionReasoningEffort = sessionId ? this.sessionStateService.getReasoningEffortForSession(sessionId) : undefined;
			const reasoningEffort = sessionReasoningEffort && selectedEndpoint.supportsReasoningEffort?.includes(sessionReasoningEffort)
				? sessionReasoningEffort
				: undefined;

			const doRequest = () => streamingEndpoint.makeChatRequest2({
				debugName: 'Claude Copilot Proxy',
				messages: messagesForLogging,
				finishedCb: async () => undefined,
				location: ChatLocation.MessagesProxy,
				modelCapabilities: { enableThinking: true, reasoningEffort },
				userInitiatedRequest: isUserInitiatedMessage,
				turnId: sessionId ? this.sessionStateService.getTurnIdForSession(sessionId) : undefined,
			}, tokenSource.token);

			// Wrap in trace context so chat spans are parented to the invoke_agent span
			const traceContext = sessionId ? this.sessionStateService.getTraceContextForSession(sessionId) : undefined;
			const doRequestInContext = traceContext
				? () => this._otelService.runWithTraceContext(traceContext, doRequest)
				: doRequest;

			if (capturingToken) {
				await this.requestLogger.captureInvocation(capturingToken, doRequestInContext);
			} else {
				await doRequestInContext();
			}

			requestComplete = true;

			res.end();
		} catch (error) {
			this.sendErrorResponse(res, 500, 'api_error', error instanceof Error ? error.message : String(error));
		} finally {
			tokenSource.dispose();
		}
	}

	private sendErrorResponse(
		res: http.ServerResponse,
		statusCode: number,
		errorType: AnthropicErrorResponse['error']['type'],
		message: string
	): void {
		const errorResponse: AnthropicErrorResponse = {
			type: 'error',
			error: {
				type: errorType,
				message
			}
		};
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(errorResponse));
	}

	public async start(): Promise<void> {
		if (this.config.port !== 0) {
			// Already started
			return;
		}

		return new Promise((resolve, reject) => {
			this.server.listen(0, '127.0.0.1', () => {
				const address = this.server.address();
				if (address && typeof address === 'object') {
					this.config = {
						...this.config,
						port: address.port
					};
					this.info(`Claude Language Model Server started on http://localhost:${this.config.port}`);
					resolve();
					return;
				}

				reject(new Error('Failed to start server'));
			});
		});
	}

	public stop(): void {
		this.server.close();
	}

	public getConfig(): IClaudeLanguageModelServerConfig {
		return { ...this.config };
	}

	/**
	 * Increments the user-initiated message count for a given model.
	 * Called when a user sends a new message in a Claude session.
	 */
	public incrementUserInitiatedMessageCount(modelId: string): void {
		const current = this._userInitiatedMessageCounts.get(modelId) ?? 0;
		this._userInitiatedMessageCounts.set(modelId, current + 1);
	}

	private info(message: string): void {
		const messageWithClassName = `[ClaudeLanguageModelServer] ${message}`;
		this.logService.info(messageWithClassName);
	}

	private error(message: string): void {
		const messageWithClassName = `[ClaudeLanguageModelServer] ${message}`;
		this.logService.error(messageWithClassName);
	}

	private exception(err: Error, message?: string): void {
		this.logService.error(err, message);
	}

	private trace(message: string): void {
		const messageWithClassName = `[ClaudeLanguageModelServer] ${message}`;
		this.logService.trace(messageWithClassName);
	}
}

export interface ExtractSessionIdResult {
	/** Whether the auth nonce is valid. */
	readonly valid: boolean;
	/** The session ID, if present in the `nonce.sessionId` format. `undefined` for legacy (nonce-only) format. */
	readonly sessionId: string | undefined;
}

/**
 * Extracts and validates the session ID from HTTP request headers.
 * Reads the `Authorization: Bearer <nonce>.<sessionId>` header set via `ANTHROPIC_AUTH_TOKEN`.
 *
 * The `x-api-key` header is intentionally ignored to prevent the user's personal
 * `ANTHROPIC_API_KEY` environment variable from interfering with authentication.
 */
export function extractSessionId(headers: http.IncomingHttpHeaders, expectedNonce: string): ExtractSessionIdResult {
	let apiKey: string | undefined;

	// Check Authorization header with Bearer prefix (set via ANTHROPIC_AUTH_TOKEN)
	const authHeader = headers['authorization'];
	if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
		apiKey = authHeader.slice(7); // Remove "Bearer " prefix
	}

	if (!apiKey) {
		return { valid: false, sessionId: undefined };
	}

	// Parse `nonce.sessionId` format
	const dotIndex = apiKey.indexOf('.');
	if (dotIndex === -1) {
		// Legacy format without session ID — validate nonce only
		return { valid: apiKey === expectedNonce, sessionId: undefined };
	}

	const nonce = apiKey.slice(0, dotIndex);
	const sessionId = apiKey.slice(dotIndex + 1);
	const valid = nonce === expectedNonce;
	return { valid, sessionId: valid ? sessionId : undefined };
}

/**
 * Filters a comma-separated `anthropic-beta` header value to only include
 * betas that match {@link SUPPORTED_ANTHROPIC_BETAS}. Entries are matched by
 * prefix so that e.g. `'context-management'` allows `'context-management-2025-06-27'`.
 *
 * Returns the filtered comma-separated string, or `undefined` if no betas matched.
 */
export function filterSupportedBetas(headerValue: string): string | undefined {
	const filtered = headerValue
		.split(',')
		.map(b => b.trim())
		.filter(b => b && SUPPORTED_ANTHROPIC_BETAS.some(supported => b.startsWith(supported + '-')));

	return filtered.length > 0 ? filtered.join(',') : undefined;
}

/**
 * Converts Anthropic Messages API input to Raw.ChatMessage[] for logging purposes.
 */
function messagesApiInputToRawMessagesForLogging(request: AnthropicMessagesRequest): Raw.ChatMessage[] {
	const messages: Raw.ChatMessage[] = [];

	// Add system message if present
	if (request.system) {
		const systemText = typeof request.system === 'string'
			? request.system
			: request.system.map(block => block.text).join('\n');
		messages.push({
			role: Raw.ChatRole.System,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: systemText }]
		});
	}

	// Convert each message
	for (const msg of request.messages ?? []) {
		const role = msg.role === 'user' ? Raw.ChatRole.User : Raw.ChatRole.Assistant;
		const content: Raw.ChatCompletionContentPart[] = [];

		if (typeof msg.content === 'string') {
			content.push({ type: Raw.ChatCompletionContentPartKind.Text, text: msg.content });
		} else if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === 'text') {
					content.push({ type: Raw.ChatCompletionContentPartKind.Text, text: block.text });
				} else if (block.type === 'image') {
					// Handle image blocks if needed for logging
					content.push({ type: Raw.ChatCompletionContentPartKind.Text, text: '[image]' });
				} else if (block.type === 'tool_use') {
					content.push({ type: Raw.ChatCompletionContentPartKind.Text, text: `[tool_use: ${block.name}]` });
				} else if (block.type === 'tool_result') {
					content.push({ type: Raw.ChatCompletionContentPartKind.Text, text: `[tool_result: ${block.tool_use_id}]` });
				}
			}
		}

		messages.push({ role, content });
	}

	return messages;
}

class ClaudeStreamingPassThroughEndpoint implements IChatEndpoint {
	constructor(
		private readonly base: IChatEndpoint,
		private readonly responseStream: http.ServerResponse,
		private readonly requestBody: IEndpointBody,
		private readonly requestHeaders: http.IncomingHttpHeaders,
		private readonly userAgentPrefix: string,
		private readonly contextWindowOverride: { modelMaxPromptTokens?: number; maxOutputTokens?: number },
		private readonly sessionId: string | undefined,
		@IChatMLFetcher private readonly chatMLFetcher: IChatMLFetcher,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService
	) { }

	public get urlOrRequestMetadata(): string | RequestMetadata {
		// Force Messages API endpoint - we need this regardless of the useMessagesApi setting
		// since we're proxying Messages API format requests from Claude Code
		const baseUrl = this.base.urlOrRequestMetadata;
		if (typeof baseUrl === 'string') {
			return baseUrl;
		}
		return { type: RequestType.ChatMessages };
	}

	public getExtraHeaders(): Record<string, string> {
		const headers = this.base.getExtraHeaders?.(ChatLocation.MessagesProxy) ?? {};
		if (this.requestHeaders['user-agent']) {
			headers['User-Agent'] = this.getUserAgent(this.requestHeaders['user-agent']);
		}
		if (typeof this.requestHeaders['anthropic-beta'] === 'string') {
			const filtered = filterSupportedBetas(this.requestHeaders['anthropic-beta']);
			if (filtered) {
				headers['anthropic-beta'] = filtered;
			}
		}
		return headers;
	}

	getEndpointFetchOptions(): IEndpointFetchOptions {
		return {
			suppressIntegrationId: true
		};
	}

	private getUserAgent(incomingUserAgent: string): string {
		const slashIndex = incomingUserAgent.indexOf('/');
		if (slashIndex === -1) {
			return `${this.userAgentPrefix}/${incomingUserAgent}`;
		}

		return `${this.userAgentPrefix}${incomingUserAgent.substring(slashIndex)}`;
	}

	public interceptBody(body: IEndpointBody | undefined): void {
		this.base.interceptBody?.(body);
	}

	public acquireTokenizer(): ITokenizer {
		return this.base.acquireTokenizer();
	}

	public get modelMaxPromptTokens(): number {
		return this.contextWindowOverride.modelMaxPromptTokens ?? this.base.modelMaxPromptTokens;
	}

	public get maxOutputTokens(): number {
		return this.contextWindowOverride.maxOutputTokens ?? this.base.maxOutputTokens;
	}

	public get model(): string {
		return this.base.model;
	}

	public get modelProvider(): string {
		return this.base.modelProvider;
	}

	public get name(): string {
		return this.base.name;
	}

	public get version(): string {
		return this.base.version;
	}

	public get family(): string {
		return this.base.family;
	}

	public get tokenizer(): TokenizerType {
		return this.base.tokenizer;
	}

	public get showInModelPicker(): boolean {
		return this.base.showInModelPicker;
	}

	public get isPremium(): boolean | undefined {
		return this.base.isPremium;
	}

	public get degradationReason(): string | undefined {
		return this.base.degradationReason;
	}

	public get multiplier(): number | undefined {
		return this.base.multiplier;
	}

	public get tokenPricing() {
		return this.base.tokenPricing;
	}

	public get restrictedToSkus(): string[] | undefined {
		return this.base.restrictedToSkus;
	}

	public get isFallback(): boolean {
		return this.base.isFallback;
	}

	public get customModel(): CustomModel | undefined {
		return this.base.customModel;
	}

	public get isExtensionContributed(): boolean | undefined {
		return this.base.isExtensionContributed;
	}

	public get apiType(): string | undefined {
		return 'messages';
	}

	public get supportsThinkingContentInHistory(): boolean | undefined {
		return this.base.supportsThinkingContentInHistory;
	}

	public get supportsAdaptiveThinking(): boolean | undefined {
		return this.base.supportsAdaptiveThinking;
	}

	public get minThinkingBudget(): number | undefined {
		return this.base.minThinkingBudget;
	}

	public get maxThinkingBudget(): number | undefined {
		return this.base.maxThinkingBudget;
	}

	public get supportsReasoningEffort(): string[] | undefined {
		return this.base.supportsReasoningEffort;
	}

	public get supportsToolCalls(): boolean {
		return this.base.supportsToolCalls;
	}

	public get supportsVision(): boolean {
		return this.base.supportsVision;
	}

	public get supportsPrediction(): boolean {
		return this.base.supportsPrediction;
	}

	public get supportedEditTools(): readonly EndpointEditToolName[] | undefined {
		return this.base.supportedEditTools;
	}

	public async processResponseFromChatEndpoint(
		telemetryService: ITelemetryService,
		logService: ILogService,
		response: Response,
		expectedNumChoices: number,
		finishCallback: FinishedCallback,
		telemetryData: TelemetryData,
		cancellationToken?: CancellationToken
	): Promise<AsyncIterableObject<ChatCompletion>> {
		const body = response.body;
		return new AsyncIterableObject<ChatCompletion>(async feed => {
			// We parse the stream just to return a correct ChatCompletion for logging the response and token usage details.
			const requestId = response.headers.get('X-Request-ID') ?? generateUuid();
			const ghRequestId = response.headers.get('x-github-request-id') ?? '';
			const { serverExperiments } = getRequestId(response.headers);
			const processor = this.instantiationService.createInstance(AnthropicMessagesProcessor, telemetryData, requestId, ghRequestId, serverExperiments);
			const parser = new SSEParser((ev) => {
				try {
					const trimmed = ev.data?.trim();
					if (!trimmed || trimmed === '[DONE]') {
						return;
					}

					logService.trace(`[ClaudeStreamingPassThroughEndpoint] SSE: ${ev.data}`);
					const parsed = JSON.parse(trimmed);
					const type = parsed.type ?? ev.type;
					if (!type) {
						return;
					}
					const completion = processor.push({ ...parsed, type }, finishCallback);
					if (completion) {
						feed.emitOne(completion);

						// Report usage to the usage handler if available
						if (completion.usage && this.sessionId) {
							const usageHandler = this.sessionStateService.getUsageHandlerForSession(this.sessionId);
							if (usageHandler) {
								usageHandler({
									// Could we bucketize these token counts somehow for the details?
									promptTokens: completion.usage.prompt_tokens,
									completionTokens: completion.usage.completion_tokens
								});
							}
						}
					}
				} catch (e) {
					feed.reject(e);
				}
			});

			try {
				for await (const chunk of body) {
					if (cancellationToken?.isCancellationRequested) {
						break;
					}

					this.responseStream.write(chunk);
					parser.feed(chunk);
				}
			} finally {
				await body.destroy();
			}
		});
	}

	public makeChatRequest(
		debugName: string,
		messages: Raw.ChatMessage[],
		finishedCb: FinishedCallback | undefined,
		token: CancellationToken,
		location: ChatLocation,
		source?: Source,
		requestOptions?: Omit<OptionalChatRequestParams, 'n'>,
		userInitiatedRequest?: boolean
	): Promise<ChatResponse> {
		throw new Error('not implemented');
	}

	public makeChatRequest2(
		options: IMakeChatRequestOptions,
		token: CancellationToken
	): Promise<ChatResponse> {
		return this.chatMLFetcher.fetchOne({
			requestOptions: {},
			...options,
			endpoint: this,
		}, token);
	}

	public createRequestBody(
		options: ICreateEndpointBodyOptions
	): IEndpointBody {
		const base = this.base.createRequestBody(options);

		// Claude models don't support both temperature and top_p simultaneously.
		// If the SDK request specifies either, clear both from base to avoid conflicts.
		if (this.requestBody.temperature !== undefined || this.requestBody.top_p !== undefined) {
			delete base.temperature;
			delete base.top_p;
		}

		// Merge with original request body to preserve any additional properties
		// i.e. default thinking budget.
		return {
			...base,
			...this.requestBody
		};
	}

	public cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		throw new Error('not implemented');
	}
}
