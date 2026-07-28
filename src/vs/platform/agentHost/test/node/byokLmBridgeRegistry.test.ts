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
 * Pins the behaviour of {@link ByokLmBridgeRegistry}: it caches the model
 * snapshots pushed by each connection, surfaces the models of a single *serving*
 * connection (preferring one that actually has models), routes inference there,
 * excludes connections that never push, and notifies listeners on
 * model/connection changes.
 */
suite('ByokLmBridgeRegistry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * A scripted bridge connection whose model snapshots are pushed on demand via
	 * the returned `push`. A connection that never pushes stays non-serving.
	 * `chat` is unused by these tests.
	 */
	function pushable(): { connection: IByokLmBridgeConnection; push: (models: IByokLmModelInfo[]) => void } {
		const emitter = store.add(new Emitter<IByokLmModelInfo[]>());
		return {
			connection: {
				chat: async (): Promise<IByokLmChatResult> => ({ content: '' }),
				onDidChangeModels: emitter.event,
			},
			push: models => emitter.fire(models),
		};
	}

	test('surfaces the serving window\'s models and routes inference to it; a non-serving window is excluded', () => {
		const registry = new ByokLmBridgeRegistry();
		// A serving window (it pushes a snapshot) and a window that connected
		// without a BYOK handler, which never pushes.
		const serving = pushable();
		const nonServing = pushable();
		const regServing = registry.register('editor', serving.connection);
		const regNonServing = registry.register('no-handler', nonServing.connection);

		serving.push([{ vendor: 'acme', id: 'claude' }, { vendor: 'acme', id: 'gpt' }]);

		assert.deepStrictEqual({
			models: registry.getModels(),
			serving: registry.getServingConnection() === serving.connection,
		}, {
			models: [{ vendor: 'acme', id: 'claude' }, { vendor: 'acme', id: 'gpt' }],
			serving: true,
		});

		regServing.dispose();
		regNonServing.dispose();
	});

	test('a window that pushes an empty list is still a valid serving target', () => {
		const registry = new ByokLmBridgeRegistry();
		const only = pushable();
		const reg = registry.register('client-only', only.connection);
		only.push([]);

		assert.deepStrictEqual({
			models: registry.getModels(),
			serving: registry.getServingConnection() === only.connection,
		}, { models: [], serving: true });

		reg.dispose();
	});

	test('a window that pushed empty does not shadow a peer that has models, even when it connected first', () => {
		const registry = new ByokLmBridgeRegistry();
		// The Agents app connects first and pushes empty (its BYOK extension has
		// not registered models yet); a peer window pushes models. The peer must
		// win — an empty-but-serving window must never shadow a populated one.
		const empty = pushable();
		const withModels = pushable();
		const regEmpty = registry.register('agents', empty.connection);
		const regWithModels = registry.register('editor', withModels.connection);

		empty.push([]);
		withModels.push([{ vendor: 'acme', id: 'claude' }]);

		assert.deepStrictEqual({
			models: registry.getModels(),
			serving: registry.getServingConnection() === withModels.connection,
		}, {
			models: [{ vendor: 'acme', id: 'claude' }],
			serving: true,
		});

		regEmpty.dispose();
		regWithModels.dispose();
	});

	test('unregistering the serving connection drops its models and notifies listeners', () => {
		const registry = new ByokLmBridgeRegistry();
		let changes = 0;
		store.add(registry.onDidChangeModels(() => { changes++; }));

		const conn = pushable();
		const reg = registry.register('client-a', conn.connection);
		conn.push([{ vendor: 'acme', id: 'claude' }]);
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

	test('caches and notifies when a connection pushes a new snapshot', () => {
		const registry = new ByokLmBridgeRegistry();
		const conn = pushable();
		const reg = registry.register('client-a', conn.connection);
		conn.push([]);
		assert.strictEqual(registry.getModels().length, 0);

		let changed = false;
		store.add(registry.onDidChangeModels(() => { changed = true; }));
		conn.push([{ vendor: 'acme', id: 'claude' }]);

		assert.deepStrictEqual({ changed, models: registry.getModels() }, {
			changed: true,
			models: [{ vendor: 'acme', id: 'claude' }],
		});

		reg.dispose();
	});

	test('treats a change in only the model identifier as a model change (re-publishes)', () => {
		const registry = new ByokLmBridgeRegistry();
		const conn = pushable();
		const reg = store.add(registry.register('client-a', conn.connection));
		conn.push([{ vendor: 'openrouter', id: 'aion-labs/aion-3.0', modelIdentifier: 'openrouter/OpenRouter 1/aion-labs/aion-3.0' }]);

		let changes = 0;
		store.add(registry.onDidChangeModels(() => { changes++; }));

		// Only the carried identifier changed (e.g. the user renamed the provider group) — the
		// registry must still notice and re-publish so the picker keys visibility by the new id.
		conn.push([{ vendor: 'openrouter', id: 'aion-labs/aion-3.0', modelIdentifier: 'openrouter/OpenRouter 2/aion-labs/aion-3.0' }]);

		assert.deepStrictEqual({ changes, models: registry.getModels() }, {
			changes: 1,
			models: [{ vendor: 'openrouter', id: 'aion-labs/aion-3.0', modelIdentifier: 'openrouter/OpenRouter 2/aion-labs/aion-3.0' }],
		});

		reg.dispose();
	});
});
