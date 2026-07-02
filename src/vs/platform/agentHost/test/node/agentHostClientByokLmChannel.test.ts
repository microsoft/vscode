/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentHostByokLmHandler, IByokLmChatRequest, IByokLmChatResult, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { AgentHostClientByokLmChannel, createAgentHostClientByokLmConnection } from '../../common/agentHostClientByokLmChannel.js';

suite('agentHostClientByokLmChannel', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function handlerOf(
		chat: (request: IByokLmChatRequest) => Promise<IByokLmChatResult>,
		listModels: () => Promise<IByokLmModelInfo[]> = async () => [],
	): IAgentHostByokLmHandler {
		return { _serviceBrand: undefined, chat: (request) => chat(request), listModels: () => listModels() };
	}

	/**
	 * Wire the node-side connection straight to the renderer server channel,
	 * standing in for the MessagePort transport so the full request → handler →
	 * response round-trip can be exercised without the renderer or the SDK.
	 */
	function bridge(handler: IAgentHostByokLmHandler) {
		const server = new AgentHostClientByokLmChannel(handler);
		const channel: IChannel = {
			call<T>(command: string, arg?: unknown): Promise<T> {
				return server.call<T>(null, command, arg);
			},
			listen<T>(event: string): Event<T> {
				return server.listen<T>(null, event);
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

	test('round-trips listModels to the handler', async () => {
		const models: IByokLmModelInfo[] = [{ vendor: 'acme', id: 'claude', name: 'Acme Claude', maxContextWindowTokens: 128000 }];
		const connection = bridge(handlerOf(async () => ({ content: '' }), async () => models));
		assert.deepStrictEqual(await connection.listModels(), models);
	});

	test('rejects unknown channel commands', async () => {
		const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ content: '' })));
		await assert.rejects(() => server.call(null, 'frobnicate'), /Unknown command/);
	});

	test('exposes no events', () => {
		const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ content: '' })));
		assert.throws(() => server.listen(null, 'anything'), /No event/);
	});
});
