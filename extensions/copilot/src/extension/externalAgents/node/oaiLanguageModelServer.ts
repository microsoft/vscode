/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestMetadata } from '@vscode/copilot-api';
import { Raw } from '@vscode/prompt-tsx';
import * as http from 'http';
import type OpenAI from 'openai';
import { IChatMLFetcher, Source } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { CustomModel, EndpointEditToolName, IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { OpenAIResponsesProcessor, responseApiInputToRawMessagesForLogging } from '../../../platform/endpoint/node/responsesApi';
import { ILogService } from '../../../platform/log/common/logService';
import { FinishedCallback, OptionalChatRequestParams } from '../../../platform/networking/common/fetch';
import { Response } from '../../../platform/networking/common/fetcherService';
import { IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IEndpointFetchOptions, IMakeChatRequestOptions } from '../../../platform/networking/common/networking';
import { ChatCompletion } from '../../../platform/networking/common/openai';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { TelemetryData } from '../../../platform/telemetry/common/telemetryData';
import { ITokenizer, TokenizerType } from '../../../util/common/tokenizer';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { SSEParser } from '../../../util/vs/base/common/sseParser';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

export interface ILanguageModelServerConfig {
	readonly port: number;
	readonly nonce: string;
}

/**
 * HTTP server that provides an OpenAI Responses API compatible endpoint.
 * Acts as a pure pass-through proxy to the underlying model endpoint.
 */
export class OpenAILanguageModelServer extends Disposable {
	private server: http.Server;
	private config: ILanguageModelServerConfig;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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

			// It sends //responses if OPENAI_BASE_URL ends in /
			if (req.method === 'POST' && (req.url === '/v1/responses' || req.url === '/responses' || req.url === '//responses')) {
				await this.handleResponsesRequest(req, res);
				return;
			}

			if (req.method === 'GET' && req.url === '/') {
				res.writeHead(200);
				res.end('Hello from LanguageModelServer');
				return;
			}

			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
		});
	}

	private async handleResponsesRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		try {
			const body = await this.readRequestBody(req);
			if (!(await this.isAuthTokenValid(req))) {
				this.error('Invalid auth key');
				res.writeHead(401, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Invalid authentication' }));
				return;
			}

			await this.handleAuthedResponsesRequest(body, req.headers, res);
		} catch (error) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				error: 'Internal server error',
				details: error instanceof Error ? error.message : String(error)
			}));
		}
		return;
	}

	/**
	 * Verify nonce
	 */
	private async isAuthTokenValid(req: http.IncomingMessage): Promise<boolean> {
		const authHeader = req.headers.authorization;
		const bearerSpace = 'Bearer ';
		const authKey = authHeader?.startsWith(bearerSpace) ? authHeader.substring(bearerSpace.length) : undefined;
		return authKey === this.config.nonce;
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

	private async handleAuthedResponsesRequest(bodyString: string, headers: http.IncomingHttpHeaders, res: http.ServerResponse): Promise<void> {
		// Create cancellation token for the request
		const tokenSource = new CancellationTokenSource();

		try {
			const requestBody: OpenAI.Responses.ResponseCreateParams = JSON.parse(bodyString);
			if (Array.isArray(requestBody.tools)) {
				requestBody.tools = requestBody.tools.filter(tool => {
					if (typeof tool?.type === 'string' && tool.type.startsWith('web_search')) {
						this.warn(`Filtering out unsupported tool type: ${JSON.stringify(tool)}`);
						return false;
					}

					return true;
				});
			}
			const lastMessage = requestBody.input?.at(-1);
			const isUserInitiatedMessage = typeof lastMessage === 'string' ||
				lastMessage?.type === 'message' && lastMessage.role === 'user';

			const endpoints = await this.endpointProvider.getAllChatEndpoints();
			if (endpoints.length === 0) {
				this.error('No language models available');
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'No language models available' }));
				return;
			}

			const selectedEndpoint = this.selectEndpoint(endpoints, requestBody.model);
			if (!selectedEndpoint) {
				this.error('No model found matching criteria');
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					error: 'No model found matching criteria'
				}));
				return;
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
				StreamingPassThroughEndpoint,
				selectedEndpoint,
				res,
				endpointRequestBody,
				headers,
				'vscode_codex'
			);

			let messagesForLogging: Raw.ChatMessage[] = [];
			try {
				// Don't fail based on any assumptions about the shape of the request
				messagesForLogging = Array.isArray(requestBody.input) ?
					responseApiInputToRawMessagesForLogging(requestBody) :
					[];
			} catch (e) {
				this.exception(e, `Failed to parse messages for logging`);
			}

			await streamingEndpoint.makeChatRequest2({
				debugName: 'oaiLMServer',
				messages: messagesForLogging,
				finishedCb: async () => undefined,
				location: ChatLocation.ResponsesProxy,
				enableThinking: true,
				userInitiatedRequest: isUserInitiatedMessage
			}, tokenSource.token);

			requestComplete = true;

			res.end();
		} catch (error) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				error: 'Failed to process chat request',
				details: error instanceof Error ? error.message : String(error)
			}));
		} finally {
			tokenSource.dispose();
		}
	}

	private selectEndpoint(endpoints: readonly IChatEndpoint[], requestedModel?: string): IChatEndpoint | undefined {
		if (requestedModel) {
			// Try to find exact match first
			const selectedEndpoint = endpoints.find(e => e.family === requestedModel);
			return selectedEndpoint;
		}

		// Use first available model if no criteria specified
		return endpoints[0];
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
					this.info(`Language Model Server started on http://localhost:${this.config.port}`);
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

	public getConfig(): ILanguageModelServerConfig {
		return { ...this.config };
	}

	private info(message: string): void {
		const messageWithClassName = `[OpenAILanguageModelServer] ${message}`;
		this.logService.info(messageWithClassName);
	}

	private error(message: string): void {
		const messageWithClassName = `[OpenAILanguageModelServer] ${message}`;
		this.logService.error(messageWithClassName);
	}

	private exception(err: Error, message?: string): void {
		this.logService.error(err, message);
	}

	private trace(message: string): void {
		const messageWithClassName = `[OpenAILanguageModelServer] ${message}`;
		this.logService.trace(messageWithClassName);
	}

	private warn(message: string): void {
		const messageWithClassName = `[OpenAILanguageModelServer] ${message}`;
		this.logService.warn(messageWithClassName);
	}
}

class StreamingPassThroughEndpoint implements IChatEndpoint {
	constructor(
		private readonly base: IChatEndpoint,
		private readonly responseStream: http.ServerResponse,
		private readonly requestBody: IEndpointBody,
		private readonly requestHeaders: http.IncomingHttpHeaders,
		private readonly userAgentPrefix: string,
		@IChatMLFetcher private readonly chatMLFetcher: IChatMLFetcher,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	public get urlOrRequestMetadata(): string | RequestMetadata {
		return this.base.urlOrRequestMetadata;
	}

	public getExtraHeaders(): Record<string, string> {
		const headers = this.base.getExtraHeaders?.() ?? {};
		if (this.requestHeaders['user-agent']) {
			headers['User-Agent'] = this.getUserAgent(this.requestHeaders['user-agent']);
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

	public get modelProvider(): string {
		return this.base.modelProvider;
	}

	public get modelMaxPromptTokens(): number {
		return this.base.modelMaxPromptTokens;
	}

	public get maxOutputTokens(): number {
		return this.base.maxOutputTokens;
	}

	public get model(): string {
		return this.base.model;
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
		return this.base.apiType;
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
			const processor = this.instantiationService.createInstance(OpenAIResponsesProcessor, telemetryData, requestId, ghRequestId);
			const parser = new SSEParser((ev) => {
				try {
					logService.trace(`[StreamingPassThroughEndpoint] SSE: ${ev.data}`);
					const completion = processor.push({ type: ev.type, ...JSON.parse(ev.data) }, finishCallback);
					if (completion) {
						feed.emitOne(completion);
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
		return this.requestBody;
	}

	public cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		throw new Error('not implemented');
	}
}
