/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, defineTool } from '@github/copilot-sdk';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IByokLmBridgeConnection, IByokLmChatRequest, IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Agent Host Provider Integration - Copilot BYOK Responses', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type SdkSession = Awaited<ReturnType<CopilotClient['createSession']>>;
	type SdkSessionOptions = Parameters<CopilotClient['createSession']>[0];

	/**
	 * Runs the bundled SDK against the BYOK proxy, with {@link chat} playing the
	 * renderer bridge for model `acme/test-model`.
	 */
	async function withSdkSession(sessionId: string, chat: IByokLmBridgeConnection['chat'], run: (session: SdkSession) => Promise<void>, sessionOptions: Pick<SdkSessionOptions, 'tools' | 'availableTools'> = {}): Promise<void> {
		const baseDirectory = await mkdtemp(`${tmpdir()}/byok-responses-sdk-`);
		const models = store.add(new Emitter<IByokLmModelInfo[]>());
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client', { chat, onDidChangeModels: models.event });
		models.fire([{ vendor: 'acme', id: 'test-model' }]);

		const proxy = new ByokLmProxyService(new NullLogService(), registry);
		const handle = await proxy.start();
		const client = new CopilotClient({
			mode: 'empty',
			baseDirectory,
			useLoggedInUser: false,
			logLevel: 'error',
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(baseDirectory)),
		});
		let session: SdkSession | undefined;
		let clientStarted = false;

		try {
			await client.start();
			clientStarted = true;
			session = await client.createSession({
				sessionId,
				model: 'test-model',
				reasoningEffort: 'medium',
				tools: sessionOptions.tools,
				availableTools: sessionOptions.availableTools ?? [],
				provider: {
					type: 'openai',
					wireApi: 'responses',
					baseUrl: handle.providerBaseUrl('acme'),
					bearerToken: `${handle.nonce}.${sessionId}`,
				},
			});
			await run(session);
		} finally {
			try {
				await session?.disconnect();
			} finally {
				try {
					if (clientStarted) {
						await client.stop();
					}
				} finally {
					handle.dispose();
					registration.dispose();
					proxy.dispose();
					await rm(baseDirectory, { recursive: true, force: true });
				}
			}
		}
	}

	test('bundled SDK consumes structured reasoning and text from the proxy', async function () {
		this.timeout(120_000);

		const captured: IByokLmChatRequest[] = [];
		await withSdkSession('byok-responses-integration', async request => {
			captured.push(request);
			if (captured.length > 1) {
				return {
					responseId: 'resp_provider_2',
					output: [{ type: 'message', content: [{ type: 'text', text: 'second' }] }],
				};
			}
			return {
				responseId: 'resp_provider',
				output: [
					{ type: 'reasoning', id: 'rs_provider', summary: ['considered options'], encryptedContent: 'opaque' },
					{ type: 'message', content: [{ type: 'text', text: 'hello' }] },
				],
				usage: { inputTokens: 1, outputTokens: 2, reasoningTokens: 1 },
			};
		}, async session => {
			const reasoning: string[] = [];
			const usage: Array<{ inputTokens?: number; outputTokens?: number; reasoningTokens?: number }> = [];
			session.on('assistant.reasoning', event => reasoning.push(event.data.content));
			session.on('assistant.usage', event => usage.push({
				inputTokens: event.data.inputTokens,
				outputTokens: event.data.outputTokens,
				reasoningTokens: event.data.reasoningTokens,
			}));

			const result = await session.sendAndWait({ prompt: 'Reply exactly hello.' }, 30_000);
			const secondResult = await session.sendAndWait({ prompt: 'Reply exactly second.' }, 30_000);
			const replayedReasoning = captured[1]?.input.find(item => item.type === 'reasoning');

			assert.deepStrictEqual({
				result: result?.type === 'assistant.message' ? result.data.content : undefined,
				secondResult: secondResult?.type === 'assistant.message' ? secondResult.data.content : undefined,
				reasoning,
				usage,
				firstRequest: {
					vendor: captured[0]?.vendor,
					modelId: captured[0]?.modelId,
					inputTypes: captured[0]?.input.map(item => item.type),
					reasoningEffort: captured[0]?.reasoningEffort,
				},
				replayedReasoning,
			}, {
				result: 'hello',
				secondResult: 'second',
				reasoning: ['considered options'],
				usage: [
					{ inputTokens: 1, outputTokens: 2, reasoningTokens: 1 },
					{ inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
				],
				firstRequest: {
					vendor: 'acme',
					modelId: 'test-model',
					inputTypes: ['message'],
					reasoningEffort: 'medium',
				},
				replayedReasoning: {
					type: 'reasoning',
					id: 'rs_provider',
					summary: ['considered options'],
					encryptedContent: 'opaque',
				},
			});
		});
	});

	test('bundled SDK preserves provider state through a tool continuation', async function () {
		this.timeout(120_000);

		const captured: IByokLmChatRequest[] = [];
		await withSdkSession('byok-responses-tool-continuation', async request => {
			captured.push(request);
			if (captured.length === 1) {
				return {
					responseId: 'resp_provider_1',
					output: [
						{ type: 'reasoning', id: 'rs_provider', summary: ['Calling echo'], encryptedContent: 'opaque' },
						{ type: 'function_call', callId: 'call_1', name: 'echo', argumentsJson: '{}' },
					],
				};
			}
			return {
				responseId: 'resp_provider_2',
				output: [{ type: 'message', content: [{ type: 'text', text: 'final response' }] }],
			};
		}, async session => {
			const result = await session.sendAndWait({ prompt: 'Call echo once, then reply exactly final response.' }, 30_000);

			assert.deepStrictEqual({
				result: result?.type === 'assistant.message' ? result.data.content : undefined,
				requestCount: captured.length,
				firstRequest: {
					vendor: captured[0]?.vendor,
					modelId: captured[0]?.modelId,
					inputTypes: captured[0]?.input.map(item => item.type),
					reasoningEffort: captured[0]?.reasoningEffort,
				},
				secondRequest: {
					previousResponseId: captured[1]?.previousResponseId,
					input: captured[1]?.input.map(item => item.type === 'function_call_output'
						? { type: item.type, callId: item.callId, output: item.output }
						: { type: item.type }),
				},
			}, {
				result: 'final response',
				requestCount: 2,
				firstRequest: {
					vendor: 'acme',
					modelId: 'test-model',
					inputTypes: ['message'],
					reasoningEffort: 'medium',
				},
				secondRequest: {
					previousResponseId: 'resp_provider_1',
					input: [{ type: 'function_call_output', callId: 'call_1', output: 'echo result' }],
				},
			});
		}, {
			tools: [
				defineTool('echo', {
					description: 'Returns a fixed echo result.',
					parameters: { type: 'object', properties: {}, additionalProperties: false },
					handler: async () => 'echo result',
					skipPermission: true,
					defer: 'never',
				}),
			],
			availableTools: ['custom:echo'],
		});
	});

	test('bundled SDK surfaces an empty BYOK response as a descriptive error without retrying', async function () {
		this.timeout(120_000);

		let calls = 0;
		await withSdkSession('byok-responses-empty', async () => {
			calls++;
			return { output: [{ type: 'reasoning', id: 'rs_provider', summary: [], encryptedContent: 'opaque' }] };
		}, async session => {
			const errors: string[] = [];
			session.on('session.error', event => errors.push(event.data.message));
			await assert.rejects(session.sendAndWait({ prompt: 'Reply exactly hello.' }, 30_000));
			assert.deepStrictEqual({ calls, errors }, {
				calls: 1,
				errors: ['422 The model \'test-model\' returned an empty response with no text or tool calls. This can happen when the conversation exceeds the model\'s context window or output token limit. Try again, start a new session, or choose a different model.'],
			});
		});
	});
});
