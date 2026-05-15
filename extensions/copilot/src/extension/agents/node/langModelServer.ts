/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import * as http from 'http';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { APIUsage } from '../../../platform/networking/common/openai';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { LanguageModelError } from '../../../vscodeTypes';
import { AnthropicAdapterFactory } from './adapters/anthropicAdapter';
import { IAgentStreamBlock, IProtocolAdapter, IProtocolAdapterFactory, IStreamingContext } from './adapters/types';

export interface ILanguageModelServerConfig {
	readonly port: number;
	readonly nonce: string;
}

export const ILanguageModelServer = createServiceIdentifier<ILanguageModelServer>('ILanguageModelServer');
export interface ILanguageModelServer {
	readonly _serviceBrand: undefined;
	start(): Promise<void>;
	stop(): void;
	getConfig(): ILanguageModelServerConfig;
}

export class LanguageModelServer implements ILanguageModelServer {
	declare _serviceBrand: undefined;

	private server: http.Server;
	protected config: ILanguageModelServerConfig;
	protected adapterFactories: Map<string, IProtocolAdapterFactory>;
	protected readonly requestHandlers = new Map<string, { method: string; handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> }>();
	constructor(
		@ILogService private readonly logService: ILogService,
		@IEndpointProvider protected readonly endpointProvider: IEndpointProvider
	) {
		this.config = {
			port: 0, // Will be set to random available port
			nonce: 'vscode-lm-' + generateUuid()
		};
		this.adapterFactories = new Map();
		this.adapterFactories.set('/v1/messages', new AnthropicAdapterFactory());

		this.server = this.createServer();
	}

	private createServer(): http.Server {
		return http.createServer(async (req, res) => {
			this.logService.trace(`Received request: ${req.method} ${req.url}`);

			if (req.method === 'OPTIONS') {
				res.writeHead(200);
				res.end();
				return;
			}

			const handler = this.requestHandlers.get(req.url || '');
			if (handler && handler.method === req.method) {
				await handler.handler(req, res);
				return;
			}

			if (req.method === 'POST') {
				const adapterFactory = this.getAdapterFactoryForPath(req.url || '');
				if (adapterFactory) {
					try {
						// Create new adapter instance for this request
						const adapter = adapterFactory.createAdapter();
						const body = await this.readRequestBody(req);

						// Verify nonce for authentication
						const authKey = adapter.extractAuthKey(req.headers);
						if (authKey !== this.config.nonce) {
							this.logService.trace(`[LanguageModelServer] Invalid auth key`);
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid authentication' }));
							return;
						}

						await this.handleChatRequest(adapter, body, res);
					} catch (error) {
						res.writeHead(500, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({
							error: 'Internal server error',
							details: error instanceof Error ? error.message : String(error)
						}));
					}
					return;
				}
			}

			if (req.method === 'GET' && req.url === '/') {
				res.writeHead(200);
				res.end('Hello from LanguageModelServer');
				return;
			}

			if (req.method === 'GET' && req.url === '/models') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ data: [] }));
				return;
			}

			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
		});
	}

	private parseUrlPathname(url: string): string {
		try {
			const parsedUrl = new URL(url, 'http://localhost');
			return parsedUrl.pathname;
		} catch {
			return url.split('?')[0];
		}
	}

	private getAdapterFactoryForPath(url: string): IProtocolAdapterFactory | undefined {
		const pathname = this.parseUrlPathname(url);
		return this.adapterFactories.get(pathname);
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

	private async handleChatRequest(adapter: IProtocolAdapter, body: string, res: http.ServerResponse): Promise<void> {
		try {
			const parsedRequest = adapter.parseRequest(body);

			const endpoints = await this.endpointProvider.getAllChatEndpoints();

			if (endpoints.length === 0) {
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'No language models available' }));
				return;
			}

			const selectedEndpoint = this.selectEndpoint(endpoints, parsedRequest.model);
			if (!selectedEndpoint) {
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					error: 'No model found matching criteria'
				}));
				return;
			}

			// Set up streaming response
			res.writeHead(200, {
				'Content-Type': adapter.getContentType(),
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
			});

			// Create cancellation token for the request
			const tokenSource = new CancellationTokenSource();

			// Handle client disconnect
			let requestComplete = false;
			res.on('close', () => {
				if (!requestComplete) {
					this.logService.info(`[LanguageModelServer] Client disconnected before request complete`);
				}

				tokenSource.cancel();
			});

			try {
				// Create streaming context with only essential shared data
				const context: IStreamingContext = {
					requestId: `req_${Math.random().toString(36).substr(2, 20)}`,
					endpoint: {
						modelId: selectedEndpoint.model,
						modelMaxPromptTokens: selectedEndpoint.modelMaxPromptTokens
					}
				};

				// Send initial events if adapter supports them
				if (adapter.generateInitialEvents) {
					const initialEvents = adapter.generateInitialEvents(context);
					for (const event of initialEvents) {
						res.write(`event: ${event.event}\ndata: ${event.data}\n\n`);
					}
				}

				const userInitiatedRequest = parsedRequest.messages.at(-1)?.role === Raw.ChatRole.User;
				const fetchResult = await selectedEndpoint.makeChatRequest2({
					debugName: 'agentLMServer' + (parsedRequest.type ? `-${parsedRequest.type}` : ''),
					messages: parsedRequest.messages as Raw.ChatMessage[],
					finishedCb: async (_fullText, _index, delta) => {
						if (tokenSource.token.isCancellationRequested) {
							return 0; // stop
						}
						// Emit text deltas
						if (delta.text) {
							const textData: IAgentStreamBlock = {
								type: 'text',
								content: delta.text
							};
							for (const event of adapter.formatStreamResponse(textData, context)) {
								res.write(`event: ${event.event}\ndata: ${event.data}\n\n`);
							}
						}
						// Emit tool calls if present
						if (delta.copilotToolCalls && delta.copilotToolCalls.length > 0) {
							for (const call of delta.copilotToolCalls) {
								let input: object = {};
								try { input = call.arguments ? JSON.parse(call.arguments) : {}; } catch { input = {}; }
								const toolData: IAgentStreamBlock = {
									type: 'tool_call',
									callId: call.id,
									name: call.name,
									input
								};
								for (const event of adapter.formatStreamResponse(toolData, context)) {
									res.write(`event: ${event.event}\ndata: ${event.data}\n\n`);
								}
							}
						}
						return undefined;
					},
					location: ChatLocation.Agent,
					requestOptions: { ...parsedRequest.options, stream: false },
					userInitiatedRequest,
					telemetryProperties: {
						messageSource: `lmServer-${adapter.name}`
					}
				}, tokenSource.token);

				// Capture usage information if available
				let usage: APIUsage | undefined;
				if (fetchResult.type === ChatFetchResponseType.Success && fetchResult.usage) {
					usage = fetchResult.usage;
				}

				requestComplete = true;

				// Send final events
				const finalEvents = adapter.generateFinalEvents(context, usage);
				for (const event of finalEvents) {
					res.write(`event: ${event.event}\ndata: ${event.data}\n\n`);
				}

				res.end();
			} catch (error) {
				requestComplete = true;
				if (error instanceof LanguageModelError) {
					res.write(JSON.stringify({
						error: 'Language model error',
						code: error.code,
						message: error.message,
						cause: error.cause
					}));
				} else {
					res.write(JSON.stringify({
						error: 'Request failed',
						message: error instanceof Error ? error.message : String(error)
					}));
				}
				res.end();
			} finally {
				tokenSource.dispose();
			}

		} catch (error) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				error: 'Failed to process chat request',
				details: error instanceof Error ? error.message : String(error)
			}));
		}
	}

	private selectEndpoint(endpoints: readonly IChatEndpoint[], requestedModel?: string): IChatEndpoint | undefined {
		if (requestedModel) {
			// Handle model mapping
			let mappedModel = requestedModel;
			if (requestedModel.startsWith('claude-haiku')) {
				mappedModel = 'claude-haiku-4.5';
			}
			if (requestedModel.startsWith('claude-sonnet-4')) {
				mappedModel = 'claude-sonnet-4.5';
			}
			if (requestedModel.startsWith('claude-opus-4')) {
				mappedModel = 'claude-opus-4.5';
			}

			// Try to find exact match first
			let selectedEndpoint = endpoints.find(e => e.family === mappedModel || e.model === mappedModel);

			// If not found, try to find by partial match for Anthropic models
			if (!selectedEndpoint && requestedModel.startsWith('claude-haiku-4')) {
				selectedEndpoint = endpoints.find(e => e.model.includes('claude-haiku-4-5')) ?? endpoints.find(e => e.model.includes('claude'));
			} else if (!selectedEndpoint && requestedModel.startsWith('claude-sonnet-4')) {
				selectedEndpoint = endpoints.find(e => e.model.includes('claude-sonnet-4-5')) ?? endpoints.find(e => e.model.includes('claude'));
			} else if (!selectedEndpoint && requestedModel.startsWith('claude-opus-4')) {
				selectedEndpoint = endpoints.find(e => e.model.includes('claude-opus-4-5')) ?? endpoints.find(e => e.model.includes('claude'));
			}

			return selectedEndpoint;
		}

		// Use first available model if no criteria specified
		return endpoints[0];
	}

	public async start(): Promise<void> {
		return new Promise((resolve) => {
			this.server.listen(0, '127.0.0.1', () => {
				const address = this.server.address();
				if (address && typeof address === 'object') {
					this.config = {
						...this.config,
						port: address.port
					};
					this.logService.trace(`Language Model Server started on http://localhost:${this.config.port}`);
					resolve();
				}
			});
		});
	}

	public stop(): void {
		this.server.close();
	}

	public getConfig(): ILanguageModelServerConfig {
		return { ...this.config };
	}
}
