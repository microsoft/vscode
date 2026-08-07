/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient } from '@github/copilot-sdk';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IByokLmChatRequest, IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';

suite('Agent Host Provider Integration - Copilot BYOK Responses', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('bundled SDK consumes structured reasoning and text from the proxy', async function () {
		this.timeout(120_000);

		const sessionId = 'byok-responses-integration';
		const baseDirectory = await mkdtemp(`${tmpdir()}/byok-responses-sdk-`);
		const models = store.add(new Emitter<IByokLmModelInfo[]>());
		const registry = new ByokLmBridgeRegistry();
		const captured: IByokLmChatRequest[] = [];
		const registration = registry.register('client', {
			chat: async request => {
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
			env: createCopilotCliEnvironment(),
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
				availableTools: [],
				provider: {
					type: 'openai',
					wireApi: 'responses',
					baseUrl: handle.providerBaseUrl('acme'),
					bearerToken: `${handle.nonce}.${sessionId}`,
				},
			});
			const reasoning: string[] = [];
			session.on('assistant.reasoning', event => reasoning.push(event.data.content));

			const result = await session.sendAndWait({ prompt: 'Reply exactly hello.' }, 30_000);
			const secondResult = await session.sendAndWait({ prompt: 'Reply exactly second.' }, 30_000);
			const replayedReasoning = captured[1]?.input.find(item => item.type === 'reasoning');

			assert.deepStrictEqual({
				result: result?.type === 'assistant.message' ? result.data.content : undefined,
				secondResult: secondResult?.type === 'assistant.message' ? secondResult.data.content : undefined,
				reasoning,
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
