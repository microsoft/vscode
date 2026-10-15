/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ChannelClient, ChannelServer } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostByokLmHandler, IByokLmChatRequest, IByokLmChatResult, IByokLmChatProgress, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { AgentHostClientByokLmChannel, createAgentHostClientByokLmConnection } from '../../common/agentHostClientByokLmChannel.js';

suite('agentHostClientByokLmChannel', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function handlerOf(
		chat: (request: IByokLmChatRequest) => Promise<IByokLmChatResult>,
		listModels: () => Promise<IByokLmModelInfo[]> = async () => [],
		onDidChangeModels?: Event<void>,
	): IAgentHostByokLmHandler {
		return { _serviceBrand: undefined, chat: (request) => chat(request), listModels: () => listModels(), onDidChangeModels };
	}

	/** Resolves once the channel's async snapshot publish has settled. */
	const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

	/**
	 * Use the real IPC serializer and cancellation protocol over an in-memory
	 * transport, including event-subscription ordering before the chat RPC.
	 */
	function bridge(handler: IAgentHostByokLmHandler) {
		const toClient = store.add(new Emitter<VSBuffer>());
		const toServer = store.add(new Emitter<VSBuffer>());
		const client = store.add(new ChannelClient({ onMessage: toClient.event, send: buffer => toServer.fire(buffer) }));
		const server = store.add(new ChannelServer({ onMessage: toServer.event, send: buffer => toClient.fire(buffer) }, null));
		server.registerChannel('byok', new AgentHostClientByokLmChannel(handler, new NullLogService()));
		return createAgentHostClientByokLmConnection(client.getChannel('byok'));
	}

	test('round-trips a Responses request to the handler and back', async () => {
		let seen: IByokLmChatRequest | undefined;
		const connection = bridge(handlerOf(async (request) => {
			seen = request;
			return {
				responseId: 'resp_1',
				output: [
					{ type: 'reasoning', id: 'rs_1', summary: ['thinking'], encryptedContent: 'opaque' },
					{ type: 'message', content: [{ type: 'text', text: 'pong' }] },
					{ type: 'function_call', callId: 'c1', name: 'noop', argumentsJson: '{}' },
				],
			};
		}));

		const request: IByokLmChatRequest = {
			vendor: 'acme',
			modelId: 'm',
			previousResponseId: 'resp_0',
			input: [
				{ type: 'reasoning', id: 'rs_0', summary: ['previous'], encryptedContent: 'previous-opaque' },
				{ type: 'message', role: 'user', content: [{ type: 'text', text: 'ping' }] },
			],
		};
		const result = await connection.chat(request);

		assert.deepStrictEqual(seen, request);
		assert.deepStrictEqual(result, {
			responseId: 'resp_1',
			output: [
				{ type: 'reasoning', id: 'rs_1', summary: ['thinking'], encryptedContent: 'opaque' },
				{ type: 'message', content: [{ type: 'text', text: 'pong' }] },
				{ type: 'function_call', callId: 'c1', name: 'noop', argumentsJson: '{}' },
			],
		});
	});

	test('delivers isolated live output before either concurrent request completes', async () => {
		const finish = new DeferredPromise<void>();
		const first = new DeferredPromise<void>();
		const received: IByokLmChatProgress[][] = [[], []];
		const handler: IAgentHostByokLmHandler = {
			_serviceBrand: undefined,
			listModels: async () => [],
			chat: async (request, _token, report) => {
				report?.({ outputIndex: 0, item: { type: 'message', content: [{ type: 'text', text: request.modelId }] } });
				await finish.p;
				return { output: [] };
			},
		};
		const connection = bridge(handler);
		const pending = ['one', 'two'].map((modelId, index) => connection.chat({ vendor: 'v', modelId, input: [] }, CancellationToken.None, progress => {
			received[index].push(progress);
			if (received.every(parts => parts.length)) {
				void first.complete();
			}
		}));
		try {
			await first.p;
			assert.deepStrictEqual(received.map(parts => parts[0].item), [
				{ type: 'message', content: [{ type: 'text', text: 'one' }] },
				{ type: 'message', content: [{ type: 'text', text: 'two' }] },
			]);
		} finally {
			await finish.complete();
			await Promise.all(pending);
		}
	});

	test('cancels the renderer request when the streaming subscription is cancelled', async () => {
		const cts = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		const cancelled = new DeferredPromise<void>();
		const connection = bridge({
			_serviceBrand: undefined,
			listModels: async () => [],
			chat: async (_request, token) => {
				const listener = token.onCancellationRequested(() => void cancelled.complete());
				try {
					await started.complete();
					await cancelled.p;
					return { output: [] };
				} finally {
					listener.dispose();
				}
			},
		});
		const pending = connection.chat({ vendor: 'v', modelId: 'm', input: [] }, cts.token, () => { });
		const rejection = assert.rejects(pending, /Canceled/);
		await started.p;
		cts.cancel();
		await Promise.all([rejection, cancelled.p]);
	});

	test('forwards cancellation for buffered requests too', async () => {
		const cts = store.add(new CancellationTokenSource());
		let received: CancellationToken | undefined;
		const connection = bridge({
			_serviceBrand: undefined,
			listModels: async () => [],
			chat: async (_request, token) => { received = token; return { output: [] }; },
		});
		await connection.chat({ vendor: 'v', modelId: 'm', input: [] }, cts.token);
		cts.cancel();
		assert.strictEqual(received?.isCancellationRequested, true);
	});

	test('forwards a bridge error result unchanged', async () => {
		const connection = bridge(handlerOf(async () => ({ output: [], error: 'no model' })));
		const result = await connection.chat({ vendor: 'v', modelId: 'm', input: [] });
		assert.strictEqual(result.error, 'no model');
	});

	test('pushes the current model snapshot on subscribe and re-pushes on change', async () => {
		const onDidChange = store.add(new Emitter<void>());
		let models: IByokLmModelInfo[] = [{ vendor: 'acme', id: 'claude', name: 'Acme Claude', maxContextWindowTokens: 128000 }];
		const connection = bridge(handlerOf(async () => ({ output: [] }), async () => models, onDidChange.event));

		const pushed: IByokLmModelInfo[][] = [];
		const sub = connection.onDidChangeModels(snapshot => pushed.push(snapshot));
		await flush();

		// A change on the handler triggers a fresh snapshot push.
		models = [{ vendor: 'acme', id: 'gpt' }];
		onDidChange.fire();
		await flush();

		sub.dispose();
		assert.deepStrictEqual(pushed, [
			[{ vendor: 'acme', id: 'claude', name: 'Acme Claude', maxContextWindowTokens: 128000 }],
			[{ vendor: 'acme', id: 'gpt' }],
		]);
	});

	test('coalesces a burst of changes so the final snapshot reflects the latest models', async () => {
		const onDidChange = store.add(new Emitter<void>());
		let models: IByokLmModelInfo[] = [{ vendor: 'acme', id: 'v1' }];
		const connection = bridge(handlerOf(async () => ({ output: [] }), async () => models, onDidChange.event));

		const pushed: IByokLmModelInfo[][] = [];
		const sub = connection.onDidChangeModels(snapshot => pushed.push(snapshot));
		await flush();

		// A rapid burst: several changes fire before any enumeration settles. The
		// throttler serializes them, so the last snapshot must reflect the latest
		// models rather than a stale enumeration finishing out of order.
		models = [{ vendor: 'acme', id: 'v2' }];
		onDidChange.fire();
		models = [{ vendor: 'acme', id: 'v3' }];
		onDidChange.fire();
		await flush();

		sub.dispose();
		assert.deepStrictEqual(pushed.at(-1), [{ vendor: 'acme', id: 'v3' }]);
	});

	test('rejects unknown channel commands', async () => {
		const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ output: [] })), new NullLogService());
		await assert.rejects(() => server.call(null, 'frobnicate'), /Unknown command/);
	});

	test('exposes only the models event', () => {
		const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ output: [] })), new NullLogService());
		assert.throws(() => server.listen(null, 'anything'), /No event/);
	});
});
