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
import type { IByokLmChatRequest, IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Agent Host Provider Integration - Copilot BYOK Responses', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('bundled SDK preserves provider state through a tool continuation', async function () {
		this.timeout(120_000);

		const sessionId = 'byok-responses-integration';
		const baseDirectory = await mkdtemp(`${tmpdir()}/byok-responses-sdk-`);
		const models = store.add(new Emitter<IByokLmModelInfo[]>());
		const registry = new ByokLmBridgeRegistry();
		const captured: IByokLmChatRequest[] = [];
		const registration = registry.register('client', {
			chat: async request => {
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
			},
			onDidChangeModels: models.event,
		});
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
		let session: Awaited<ReturnType<CopilotClient['createSession']>> | undefined;
		let clientStarted = false;

		try {
			await client.start();
			clientStarted = true;
			session = await client.createSession({
				sessionId,
				model: 'test-model',
				reasoningEffort: 'medium',
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
				provider: {
					type: 'openai',
					wireApi: 'responses',
					baseUrl: handle.providerBaseUrl('acme'),
					bearerToken: `${handle.nonce}.${sessionId}`,
				},
			});
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
	});
});
