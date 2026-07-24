/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
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
	 * Wire the node-side connection straight to the renderer server channel,
	 * standing in for the MessagePort transport so the full request → handler →
	 * response round-trip can be exercised without the renderer or the SDK.
	 */
	function bridge(handler: IAgentHostByokLmHandler) {
		const server = new AgentHostClientByokLmChannel(handler, new NullLogService());
		const channel: IChannel = {
			call<T>(command: string, arg?: unknown): Promise<T> {
				return server.call<T>(null, command, arg);
			},
			listen<T>(event: string): Event<T> {
				// Mirror ChannelClient.listen: defer to the server channel only when
				// the returned event is actually subscribed (lazy), so a connection
				// that never listens allocates nothing.
				return (listener, thisArgs?, disposables?) => server.listen<T>(null, event)(listener, thisArgs, disposables);
			},
		};
		return createAgentHostClientByokLmConnection(channel);
	}

	test('round-trips a chat request to the handler and back', async () => {
		let seen: IByokLmChatRequest | undefined;
		const connection = bridge(handlerOf(async (request) => {
			seen = request;
			return { content: 'pong', toolCalls: [{ id: 'c1', name: 'noop', argumentsJson: '{}' }] };
		}));

		const request: IByokLmChatRequest = { vendor: 'acme', modelId: 'm', messages: [{ role: 'user', content: 'ping' }] };
		const result = await connection.chat(request);

		assert.deepStrictEqual(seen, request);
		assert.deepStrictEqual(result, { content: 'pong', toolCalls: [{ id: 'c1', name: 'noop', argumentsJson: '{}' }] });
	});

	test('forwards a bridge error result unchanged', async () => {
		const connection = bridge(handlerOf(async () => ({ content: '', error: 'no model' })));
		const result = await connection.chat({ vendor: 'v', modelId: 'm', messages: [] });
		assert.strictEqual(result.error, 'no model');
	});

	test('pushes the current model snapshot on subscribe and re-pushes on change', async () => {
		const onDidChange = store.add(new Emitter<void>());
		let models: IByokLmModelInfo[] = [{ vendor: 'acme', id: 'claude', name: 'Acme Claude', maxContextWindowTokens: 128000 }];
		const connection = bridge(handlerOf(async () => ({ content: '' }), async () => models, onDidChange.event));

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
		const connection = bridge(handlerOf(async () => ({ content: '' }), async () => models, onDidChange.event));

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
		const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ content: '' })), new NullLogService());
		await assert.rejects(() => server.call(null, 'frobnicate'), /Unknown command/);
	});

	test('exposes only the models event', () => {
		const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ content: '' })), new NullLogService());
		assert.throws(() => server.listen(null, 'anything'), /No event/);
	});
});
