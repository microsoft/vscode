/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ImportedConversationStore } from '../../browser/importedConversationStore.js';
import { IImportedConversationTurn } from '../../common/importedConversation.js';

suite('ImportedConversationStore', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Stands in for the agent host's per-session database: `set`/`get` keyed by
	 * session URI, shared across store instances to model persistence surviving a
	 * window reload.
	 */
	class FakeSessionDatabase {
		private readonly _data = new Map<string, string>();
		readonly service: IAgentHostService = {
			getSessionImportedConversation: async (session: URI): Promise<string | undefined> => this._data.get(session.toString()),
			setSessionImportedConversation: async (session: URI, data: string): Promise<void> => { this._data.set(session.toString(), data); },
		} as unknown as IAgentHostService;
	}

	function createStore(db: FakeSessionDatabase = new FakeSessionDatabase()): ImportedConversationStore {
		return disposables.add(new ImportedConversationStore(db.service, new NullLogService()));
	}

	const turns: IImportedConversationTurn[] = [
		{ prompt: 'first question', response: 'first answer' },
		{ prompt: 'second question', response: '' },
	];

	test('round-trips a stored snapshot and clears it on empty', async () => {
		const store = createStore();
		const a = URI.from({ scheme: 'agent-host-copilot', path: '/a' });
		const b = URI.from({ scheme: 'agent-host-copilot', path: '/b' });

		await store.store(a, turns);
		await store.store(b, turns);
		// Renames one snapshot onto a different real resource.
		const c = URI.from({ scheme: 'agent-host-copilot', path: '/c' });
		await store.rename(b, c);
		// Clearing with an empty array removes the snapshot.
		await store.store(a, []);

		assert.deepStrictEqual({
			a: await store.read(a),
			b: await store.read(b),
			c: await store.read(c),
			missing: await store.read(URI.from({ scheme: 'agent-host-copilot', path: '/missing' })),
		}, {
			a: undefined,
			b: undefined,
			c: turns,
			missing: undefined,
		});
	});

	test('reads back the exact turns that were stored', async () => {
		const store = createStore();
		const resource = URI.from({ scheme: 'agent-host-copilot', path: '/session' });

		await store.store(resource, turns);

		assert.deepStrictEqual(await store.read(resource), turns);
	});

	test('bridges a provisional snapshot and flushes it onto the real resource on rename', async () => {
		const db = new FakeSessionDatabase();
		const store = createStore(db);
		const untitled = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-123' });
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real' });

		// Provisional session: bridged in memory (no database yet).
		await store.store(untitled, turns);
		// Graduation to the real backend resource flushes into the database.
		await store.rename(untitled, real);

		// A fresh store (window reload) sees only the database, not the bridge,
		// and must still read the flushed snapshot back.
		assert.deepStrictEqual(await createStore(db).read(real), turns);
	});
});
