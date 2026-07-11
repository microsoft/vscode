/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IByokLmBridgeConnection, IByokLmChatResult, IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';

/**
 * Pins the behaviour of {@link ByokLmBridgeRegistry}: it surfaces the models of a
 * single *serving* connection (preferring one that actually has models), routes
 * inference there, excludes connections whose enumeration rejects, and notifies
 * listeners on model/connection changes.
 */
suite('ByokLmBridgeRegistry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** A scripted bridge connection; `chat` is unused by these tests. */
	function connectionOf(listModels: () => Promise<IByokLmModelInfo[]>, onDidChangeModels?: Emitter<void>): IByokLmBridgeConnection {
		return {
			chat: async (): Promise<IByokLmChatResult> => ({ content: '' }),
			listModels,
			...(onDidChangeModels ? { onDidChangeModels: onDidChangeModels.event } : {}),
		};
	}

	/** Resolves once every microtask-queued registry refresh has settled. */
	const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

	test('surfaces the serving window\'s models and routes inference to it; a non-serving window is excluded', async () => {
		const registry = new ByokLmBridgeRegistry();
		// A serving window (its listModels resolves) and a window that connected
		// without a BYOK handler, whose bridge rejects.
		const serving = connectionOf(async () => [{ vendor: 'acme', id: 'claude' }, { vendor: 'acme', id: 'gpt' }]);
		const nonServing: IByokLmBridgeConnection = {
			chat: async (): Promise<IByokLmChatResult> => ({ content: '' }),
			listModels: async () => { throw new Error('no BYOK handler in this window'); },
		};
		const regServing = registry.register('editor', serving);
		const regNonServing = registry.register('no-handler', nonServing);

		const models = await registry.listModels();

		assert.deepStrictEqual({
			models,
			cached: registry.getModels(),
			serving: registry.getServingConnection() === serving,
		}, {
			models: [{ vendor: 'acme', id: 'claude' }, { vendor: 'acme', id: 'gpt' }],
			cached: [{ vendor: 'acme', id: 'claude' }, { vendor: 'acme', id: 'gpt' }],
			serving: true,
		});

		regServing.dispose();
		regNonServing.dispose();
	});

	test('a window that answers with an empty list is still a valid serving target', async () => {
		const registry = new ByokLmBridgeRegistry();
		const only = connectionOf(async () => []);
		const reg = registry.register('client-only', only);
		await registry.listModels();

		assert.deepStrictEqual({
			models: registry.getModels(),
			serving: registry.getServingConnection() === only,
		}, { models: [], serving: true });

		reg.dispose();
	});

	test('a window that answered empty does not shadow a peer that has models, even when it connected first', async () => {
		const registry = new ByokLmBridgeRegistry();
		// The Agents app connects first and answers empty (its BYOK extension has
		// not registered models yet); a peer window answers with models. The peer
		// must win — an empty-but-serving window must never shadow a populated one.
		const empty = connectionOf(async () => []);
		const withModels = connectionOf(async () => [{ vendor: 'acme', id: 'claude' }]);
		const regEmpty = registry.register('agents', empty);
		const regWithModels = registry.register('editor', withModels);

		await registry.listModels();

		assert.deepStrictEqual({
			models: registry.getModels(),
			serving: registry.getServingConnection() === withModels,
		}, {
			models: [{ vendor: 'acme', id: 'claude' }],
			serving: true,
		});

		regEmpty.dispose();
		regWithModels.dispose();
	});

	test('unregistering the serving connection drops its models and notifies listeners', async () => {
		const registry = new ByokLmBridgeRegistry();
		let changes = 0;
		store.add(registry.onDidChangeModels(() => { changes++; }));

		const reg = registry.register('client-a', connectionOf(async () => [{ vendor: 'acme', id: 'claude' }]));
		await registry.listModels();
		assert.strictEqual(registry.getModels().length, 1);

		const changesBeforeDispose = changes;
		reg.dispose();

		assert.deepStrictEqual({
			models: registry.getModels(),
			serving: registry.getServingConnection(),
			firedOnDispose: changes > changesBeforeDispose,
		}, {
			models: [],
			serving: undefined,
			firedOnDispose: true,
		});
	});

	test('re-enumerates and notifies when a connection reports onDidChangeModels', async () => {
		const registry = new ByokLmBridgeRegistry();
		const onDidChange = store.add(new Emitter<void>());
		let models: IByokLmModelInfo[] = [];
		const connection: IByokLmBridgeConnection = {
			chat: async (): Promise<IByokLmChatResult> => ({ content: '' }),
			listModels: async () => models,
			onDidChangeModels: onDidChange.event,
		};
		const reg = registry.register('client-a', connection);
		await registry.listModels();
		assert.strictEqual(registry.getModels().length, 0);

		let changed = false;
		store.add(registry.onDidChangeModels(() => { changed = true; }));
		models = [{ vendor: 'acme', id: 'claude' }];
		onDidChange.fire();
		await flush();

		assert.deepStrictEqual({ changed, models: registry.getModels() }, {
			changed: true,
			models: [{ vendor: 'acme', id: 'claude' }],
		});

		reg.dispose();
	});

	test('treats a change in only the model identifier as a model change (re-publishes)', async () => {
		const registry = new ByokLmBridgeRegistry();
		const onDidChange = store.add(new Emitter<void>());
		let models: IByokLmModelInfo[] = [{ vendor: 'openrouter', id: 'aion-labs/aion-3.0', modelIdentifier: 'openrouter/OpenRouter 1/aion-labs/aion-3.0' }];
		const connection: IByokLmBridgeConnection = {
			chat: async (): Promise<IByokLmChatResult> => ({ content: '' }),
			listModels: async () => models,
			onDidChangeModels: onDidChange.event,
		};
		const reg = store.add(registry.register('client-a', connection));
		await registry.listModels();

		let changes = 0;
		store.add(registry.onDidChangeModels(() => { changes++; }));

		// Only the carried identifier changed (e.g. the user renamed the provider group) — the
		// registry must still notice and re-publish so the picker keys visibility by the new id.
		models = [{ vendor: 'openrouter', id: 'aion-labs/aion-3.0', modelIdentifier: 'openrouter/OpenRouter 2/aion-labs/aion-3.0' }];
		onDidChange.fire();
		await flush();

		assert.deepStrictEqual({ changes, models: registry.getModels() }, {
			changes: 1,
			models: [{ vendor: 'openrouter', id: 'aion-labs/aion-3.0', modelIdentifier: 'openrouter/OpenRouter 2/aion-labs/aion-3.0' }],
		});

		reg.dispose();
	});
});
