/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ChannelClient, ChannelServer } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostByokLmHandler, IByokLmChatRequest, IByokLmChatResult, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
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
	 * Wire the node-side connection to the renderer server channel through the
	 * real IPC serializer and cancellation protocol without the renderer or SDK.
	 */
	function bridge(handler: IAgentHostByokLmHandler) {
		const toRenderer = store.add(new Emitter<VSBuffer>());
		const toHost = store.add(new Emitter<VSBuffer>());
		const client = store.add(new ChannelClient({ onMessage: toHost.event, send: buffer => toRenderer.fire(buffer) }));
		const server = store.add(new ChannelServer({ onMessage: toRenderer.event, send: buffer => toHost.fire(buffer) }, undefined));
		server.registerChannel('byok', new AgentHostClientByokLmChannel(handler, new NullLogService()));
		return { ...createAgentHostClientByokLmConnection(client.getChannel('byok')), client, server };
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

	test('forwards request cancellation to the renderer handler', async () => {
		const source = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<CancellationToken>();
		const late = new DeferredPromise<IByokLmChatResult>();
		const connection = bridge({
			_serviceBrand: undefined,
			listModels: async () => [],
			chat: async (_request, token) => {
				started.complete(token);
				return raceCancellationError(late.p, token);
			},
		});
		const pending = connection.chat({ vendor: 'v', modelId: 'm', input: [] }, source.token);
		const rejected = assert.rejects(pending, isCancellationError);
		const token = await started.p;
		source.cancel();
		await rejected;
		late.complete({ output: [] });
		assert.strictEqual(token.isCancellationRequested, true);
	});

	test('cancels only the selected concurrent request and ignores its late response', async () => {
		const source = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		const keptStarted = new DeferredPromise<CancellationToken>();
		const kept = new DeferredPromise<IByokLmChatResult>();
		const late = new DeferredPromise<IByokLmChatResult>();
		const connection = bridge({
			_serviceBrand: undefined,
			listModels: async () => [],
			chat: async (request, token) => {
				if (request.modelId === 'cancel') {
					started.complete();
					return late.p;
				}
				keptStarted.complete(token);
				return kept.p;
			},
		});
		const pending = connection.chat({ vendor: 'v', modelId: 'cancel', input: [] }, source.token);
		const rejected = assert.rejects(pending, isCancellationError);
		const surviving = connection.chat({ vendor: 'v', modelId: 'keep', input: [] });
		await started.p;
		const keptToken = await keptStarted.p;
		source.cancel();
		await rejected;
		assert.strictEqual(keptToken.isCancellationRequested, false);
		kept.complete({ output: [], responseId: 'kept' });
		late.complete({ output: [], responseId: 'late' });
		assert.strictEqual((await surviving).responseId, 'kept');
		await flush();
		assert.deepStrictEqual({
			handlers: Reflect.get(connection.client, 'handlers').size,
			activeRequests: Reflect.get(connection.server, 'activeRequests').size,
			pendingRequests: Reflect.get(connection.server, 'pendingRequests').size,
		}, { handlers: 0, activeRequests: 0, pendingRequests: 0 });
	});

	for (const side of ['client', 'server'] as const) {
		test(`cancels a pending renderer invocation when the ${side} is disposed`, async () => {
			const started = new DeferredPromise<CancellationToken>();
			const connection = bridge({
				_serviceBrand: undefined,
				listModels: async () => [],
				chat: async (_request, token) => {
					started.complete(token);
					return raceCancellationError(new Promise<IByokLmChatResult>(() => {}), token);
				},
			});
			const rejected = assert.rejects(connection.chat({ vendor: 'v', modelId: 'm', input: [] }), isCancellationError);
			const token = await started.p;
			connection[side].dispose();
			await rejected;
			assert.strictEqual(token.isCancellationRequested, true);
		});
	}

	test('does not invoke the renderer for an already cancelled request', async () => {
		let invoked = false;
		const connection = bridge(handlerOf(async () => {
			invoked = true;
			return { output: [] };
		}));
		await assert.rejects(connection.chat({ vendor: 'v', modelId: 'm', input: [] }, CancellationToken.Cancelled), isCancellationError);
		assert.strictEqual(invoked, false);
	});

	test('cancels while the reverse IPC client is still initializing', async () => {
		const source = store.add(new CancellationTokenSource());
		const toRenderer = store.add(new Emitter<VSBuffer>());
		const toHost = store.add(new Emitter<VSBuffer>());
		const client = store.add(new ChannelClient({ onMessage: toHost.event, send: buffer => toRenderer.fire(buffer) }));
		const connection = createAgentHostClientByokLmConnection(client.getChannel('byok'));
		const rejected = assert.rejects(connection.chat({ vendor: 'v', modelId: 'm', input: [] }, source.token), isCancellationError);
		source.cancel();
		await rejected;
		let invoked = false;
		const server = store.add(new ChannelServer({ onMessage: toRenderer.event, send: buffer => toHost.fire(buffer) }, undefined));
		server.registerChannel('byok', new AgentHostClientByokLmChannel(handlerOf(async () => {
			invoked = true;
			return { output: [] };
		}), new NullLogService()));
		await flush();
		assert.strictEqual(invoked, false);
	});

	test('cancellation after completion does not affect a subsequent request', async () => {
		const source = store.add(new CancellationTokenSource());
		const connection = bridge(handlerOf(async () => ({ output: [], responseId: 'complete' })));
		const first = await connection.chat({ vendor: 'v', modelId: 'm', input: [] }, source.token);
		source.cancel();
		const second = await connection.chat({ vendor: 'v', modelId: 'm', input: [] });
		assert.deepStrictEqual([first.responseId, second.responseId], ['complete', 'complete']);
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

	test('pushes the first snapshot, even an empty one, and later only snapshots that differ', async () => {
		const onDidChange = store.add(new Emitter<void>());
		let models: IByokLmModelInfo[] = [];
		const connection = bridge(handlerOf(async () => ({ output: [] }), async () => models, onDidChange.event));

		const pushed: IByokLmModelInfo[][] = [];
		const sub = connection.onDidChangeModels(snapshot => pushed.push(snapshot));
		await flush();
		for (const next of [[], [{ vendor: 'acme', id: 'v1' }], [{ vendor: 'acme', id: 'v1' }]]) {
			models = next;
			onDidChange.fire();
			await flush();
		}

		sub.dispose();
		assert.deepStrictEqual(pushed, [[], [{ vendor: 'acme', id: 'v1' }]]);
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
