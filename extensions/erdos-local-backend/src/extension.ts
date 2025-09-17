/*---------------------------------------------------------------------------------------------
 * Copyright (c) Lotas Inc. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import express from 'express';
import * as http from 'http';
import { IErdosLocalBackendExtensionService } from './types.js';

// Extend global interface
declare global {
    var erdosLocalBackendService: IErdosLocalBackendExtensionService | undefined;
}

// Import all the services we need
let localBackendService: IErdosLocalBackendExtensionService;
let proxyServer: http.Server | undefined;
let proxyUrl: string | undefined;
let proxyServerStarted: Promise<void> | undefined;

export function activate(context: vscode.ExtensionContext) {
    // We'll create a simple service that can be accessed globally
    localBackendService = {
        context: context,
        
        // Method to get API keys from VSCode secret storage (same as workbench)
        async getApiKey(provider: 'anthropic' | 'openai' | 'sagemaker'): Promise<string | undefined> {
            if (provider === 'sagemaker') {
                // For SageMaker, we don't store API keys, but return endpoint configuration
                return 'sagemaker-configured';
            }
            
            // Use the same secret keys as the workbench ApiKeyManager
            const secretKey = provider === 'anthropic' 
                ? 'erdosai_byok_anthropic_key'
                : 'erdosai_byok_openai_key';
            
            try {
                const key = await context.secrets.get(secretKey);
                return key;
            } catch (error) {
                console.error(`Failed to get API key for ${provider} from secret storage:`, error);
                return undefined;
            }
        },

        // Method to check if BYOK is enabled for a provider (checks the main erdosAi settings)
        async isBYOKEnabled(provider: 'anthropic' | 'openai' | 'sagemaker'): Promise<boolean> {
            const erdosAiConfig = vscode.workspace.getConfiguration('erdosAi');
            
            let settingName: string;
            if (provider === 'anthropic') {
                settingName = 'byokAnthropicEnabled';
            } else if (provider === 'openai') {
                settingName = 'byokOpenAiEnabled';
            } else if (provider === 'sagemaker') {
                settingName = 'byokSagemakerEnabled';
            } else {
                return false;
            }
            
            const enabled = erdosAiConfig.get<boolean>(settingName) ?? false;
            
            if (provider === 'sagemaker') {
                // For SageMaker, check if endpoint name is configured
                const endpointName = erdosAiConfig.get<string>('sagemakerEndpointName') ?? '';
                return enabled && !!endpointName;
            }
            
            // Also check if we have the API key for other providers
            const apiKey = await this.getApiKey(provider);
            const result = enabled && !!apiKey;
            return result;
        },

        // The main processing method that will be called by the workbench
        async processStreamingQuery(
            messages: any[],
            provider: string,
            model: string,
            temperature: number,
            request_id: string,
            contextData: any,
            onData: (data: any) => void,
            onError: (error: Error) => void,
            onComplete: () => void
        ): Promise<void> {
            try {
                // Import the actual service implementation
                const { LocalBackendService } = await import('./services/localBackendService');
                const { FunctionDefinitionService } = await import('./services/functionDefinitionService');
                
                // Create services
                const functionDefinitionService = new FunctionDefinitionService(context);
                const service = new LocalBackendService(functionDefinitionService);
                
                // Process the request
                await service.processStreamingQuery(
                    messages,
                    provider,
                    model,
                    temperature,
                    request_id,
                    contextData,
                    onData,
                    onError,
                    onComplete
                );

            } catch (error) {
                console.error('LocalBackendService.processStreamingQuery - Error:', error);
                onError(error instanceof Error ? error : new Error('Unknown error'));
            }
        }
    };

    // Register command to check if BYOK is enabled
    const isBYOKEnabledCommand = vscode.commands.registerCommand('erdos-local-backend.isBYOKEnabled', 
        async (provider: 'anthropic' | 'openai') => {
            const result = await localBackendService.isBYOKEnabled(provider);
            return result;
        }
    );

    // Register command to get proxy server URL
    const getProxyUrlCommand = vscode.commands.registerCommand('erdos-local-backend.getProxyUrl', async () => {
        if (proxyServerStarted) {
            await proxyServerStarted;
        }
        return proxyUrl;
    });

    context.subscriptions.push(isBYOKEnabledCommand, getProxyUrlCommand);

    // Start the proxy server
    startProxyServer(context).catch((error) => {
        console.error('Extension.activate - Failed to start proxy server:', error);
    });
}

async function startProxyServer(context: vscode.ExtensionContext) {
    proxyServerStarted = (async () => {
        const app = express();
        
        // Enable CORS
        app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        app.use(express.json());

        // Handle AI query streaming
        app.post('/ai/query', async (req: express.Request, res: express.Response) => {            
            // Set headers for Server-Sent Events
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });

            const { LocalBackendService } = await import('./services/localBackendService');
            const { FunctionDefinitionService } = await import('./services/functionDefinitionService');
            
            const functionDefinitionService = new FunctionDefinitionService(context);
            const service = new LocalBackendService(functionDefinitionService);
            
            const { conversation, provider, model, temperature, request_id, request_type, byok_keys, ...contextData } = req.body;
            
            // Check if this is a conversation name generation request
            if (request_type === 'generate_conversation_name') {                
                const result = await service.generateConversationName(req.body);
                
                // Send result as SSE event
                if (result && result.conversationName) {
                    const sseData = JSON.stringify({
                        conversation_name: result.conversationName,
                        isComplete: true,
                        complete: true
                    });
                    res.write(`data: ${sseData}\n\n`);
                } else if (result && result.error) {
                    const sseData = JSON.stringify({
                        error: result.error,
                        isComplete: true,
                        complete: true
                    });
                    res.write(`data: ${sseData}\n\n`);
                } else {
                    const sseData = JSON.stringify({
                        conversation_name: "Untitled Conversation",
                        isComplete: true,
                        complete: true
                    });
                    res.write(`data: ${sseData}\n\n`);
                }
                res.end();
            }
            // Check if this is a summarization request
            else if (request_type === 'summarize_conversation') {
                const outputStream = {
                    write: (data: string) => {
                        res.write(data);
                    }
                };
                
                await service.processSummarizationRequest(req.body, request_id, outputStream);
                res.end();
            } else {                    
                // Add BYOK keys to contextData so it gets passed through
                const contextWithByok = {
                    ...contextData,
                    byok_keys
                };
                
                await service.processStreamingQuery(
                    conversation || [],
                    provider,
                    model,
                    temperature || 0.7,
                    request_id || `req_${Date.now()}`,
                    contextWithByok,
                    (data) => {
                        // Send SSE data
                        res.write(`data: ${JSON.stringify(data)}\n\n`);
                    },
                    (error) => {
                        console.error('Proxy server streaming error:', error);
                        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                        res.end();
                    },
                    () => {
                        res.end();
                    }
                );
            }
        });

        // Start server on random port
        return new Promise<void>((resolve, reject) => {
            proxyServer = app.listen(0, 'localhost', () => {
                const address = proxyServer?.address();
                if (address && typeof address === 'object') {
                    proxyUrl = `http://localhost:${address.port}`;
                    resolve();
                } else {
                    reject(new Error('Failed to get proxy server address'));
                }
            });
            
            proxyServer.on('error', (error) => {
                console.error('Proxy server error:', error);
                reject(error);
            });
        });
    })();
}

export function deactivate() {
    // Clean up proxy server
    if (proxyServer) {
        proxyServer.close();
        proxyServer = undefined;
        proxyUrl = undefined;
    }
}
