/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	BrowserFaviconsStore,
	BrowserHistoryEntriesStore,
	BrowserHistoryStore,
	ISerializedBrowserFaviconsSnapshot,
	ISerializedBrowserHistoryEntriesSnapshot,
} from '../../common/browserHistory.js';

suite('BrowserHistoryEntriesStore', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('add assigns monotonic ids and exposes items oldest-first', () => {
		const store = new BrowserHistoryEntriesStore();
		const a = store.add('https://a/', 'A', undefined, false);
		const b = store.add('https://b/', 'B', 'icon-b', true);
		const c = store.add('https://c/', 'C', undefined, false);

		assert.deepStrictEqual([a.id, b.id, c.id], [1, 2, 3]);
		assert.deepStrictEqual(store.items.map(e => ({ id: e.id, url: e.url, icon: e.icon, explicit: e.explicit })), [
			{ id: 1, url: 'https://a/', icon: undefined, explicit: undefined },
			{ id: 2, url: 'https://b/', icon: 'icon-b', explicit: true },
			{ id: 3, url: 'https://c/', icon: undefined, explicit: undefined },
		]);

		store.dispose();
	});

	test('explicit is omitted from the entry when false', () => {
		const store = new BrowserHistoryEntriesStore();
		const e = store.add('https://a/', 'A', undefined, false);

		assert.strictEqual(Object.prototype.hasOwnProperty.call(e, 'explicit'), false);

		store.dispose();
	});

	test('update changes title and icon, returns whether anything changed', () => {
		const store = new BrowserHistoryEntriesStore();
		store.add('https://a/', '', undefined, false);
		assert.strictEqual(store.update(1, { title: 'A' }), true);
		assert.strictEqual(store.update(1, { faviconHash: 'icon-a' }), true);
		assert.strictEqual(store.update(1, { title: 'A', faviconHash: 'icon-a' }), false);

		assert.deepStrictEqual(store.items[0].title, 'A');
		assert.deepStrictEqual(store.items[0].icon, 'icon-a');

		store.dispose();
	});

	test('update ignores empty title', () => {
		const store = new BrowserHistoryEntriesStore();
		store.add('https://a/', 'A', undefined, false);
		assert.strictEqual(store.update(1, { title: '' }), false);
		assert.strictEqual(store.items[0].title, 'A');

		store.dispose();
	});

	test('update of an unknown id is a no-op', () => {
		const store = new BrowserHistoryEntriesStore();
		store.add('https://a/', 'A', undefined, false);
		assert.strictEqual(store.update(999, { title: 'X' }), false);

		store.dispose();
	});

	test('delete removes the targeted entry and leaves ids of others intact', () => {
		const store = new BrowserHistoryEntriesStore();
		const a = store.add('https://a/', 'A', undefined, false);
		const b = store.add('https://b/', 'B', undefined, false);
		const c = store.add('https://c/', 'C', undefined, false);

		assert.strictEqual(store.delete(b.id), true);
		assert.strictEqual(store.delete(b.id), false);
		assert.deepStrictEqual(store.items.map(e => e.id), [a.id, c.id]);

		store.dispose();
	});

	test('add beyond maxEntries evicts oldest', () => {
		const store = new BrowserHistoryEntriesStore(2);
		store.add('https://a/', 'A', undefined, false);
		store.add('https://b/', 'B', undefined, false);
		store.add('https://c/', 'C', undefined, false);

		assert.deepStrictEqual(store.items.map(e => e.url), ['https://b/', 'https://c/']);

		store.dispose();
	});

	test('onDidChange fires for add, update, delete, clear', () => {
		const store = new BrowserHistoryEntriesStore();
		let count = 0;
		const sub = store.onDidChange(() => count++);

		store.add('https://a/', 'A', undefined, false);
		store.update(1, { title: 'A2' });
		store.delete(1);
		store.clear();
		// clear on already-empty store should be a no-op
		store.clear();

		assert.strictEqual(count, 4);

		sub.dispose();
		store.dispose();
	});

	test('serialize then hydrate round-trips', () => {
		const a = new BrowserHistoryEntriesStore();
		a.add('https://a/', 'A', 'icon-a', true);
		a.add('https://b/', 'B', undefined, false);
		const snapshot = a.serialize();

		const b = new BrowserHistoryEntriesStore();
		b.hydrate(snapshot);
		assert.deepStrictEqual(b.serialize(), snapshot);

		a.dispose();
		b.dispose();
	});

	test('hydrate seeds the id counter from the max restored id', () => {
		const store = new BrowserHistoryEntriesStore();
		store.hydrate({
			items: [
				{ id: 7, url: 'https://a/', time: 100, title: 'A' },
				{ id: 12, url: 'https://b/', time: 200, title: 'B' },
			],
		});
		const next = store.add('https://c/', 'C', undefined, false);
		assert.strictEqual(next.id, 13);

		store.dispose();
	});
});

suite('BrowserHistoryEntriesStore.hydrate backwards-compat', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts data matching prior snapshot shapes', () => {
		// Pretend this came off disk: typed as `unknown`, deliberately untrusted
		// so the test guards against accidental future changes to required fields.
		// IMPORTANT: Don't change the shape of this. It ensures compatibility with the earliest versions of the history interface.
		//            When updating the interface, simply extend or add a test for the new shape.
		const raw: unknown = {
			items: [
				{ id: 1, url: 'https://a/', time: 100, title: 'A' },
				{ id: 2, url: 'https://b/', time: 200, title: 'B', icon: 'h1' },
				{ id: 4, url: 'https://c/', time: 300, title: 'C', explicit: true },
			],
		};

		const store = new BrowserHistoryEntriesStore();
		store.hydrate(raw as ISerializedBrowserHistoryEntriesSnapshot);
		assert.deepStrictEqual(store.items, [
			{ id: 1, url: 'https://a/', time: 100, title: 'A' },
			{ id: 2, url: 'https://b/', time: 200, title: 'B', icon: 'h1' },
			{ id: 4, url: 'https://c/', time: 300, title: 'C', explicit: true },
		]);
		// Next add must not collide with restored ids.
		assert.strictEqual(store.add('https://d/', 'D', undefined, false).id, 5);

		store.dispose();
	});

	test('drops malformed entries and accepts the rest', () => {
		const raw: unknown = {
			items: [
				{ id: 1, url: 'https://a/', time: 100, title: 'A' },
				{ id: 'bad', url: 'https://b/', time: 200, title: 'B' },
				null,
				{ id: 2 }, // missing required fields
				{ id: 3, url: 'https://c/', time: 300, title: 'C', explicit: 'yes' }, // bad explicit
			],
		};

		const store = new BrowserHistoryEntriesStore();
		store.hydrate(raw as ISerializedBrowserHistoryEntriesSnapshot);
		assert.deepStrictEqual(store.items.map(e => e.id), [1]);

		store.dispose();
	});

	test('undefined snapshot resets to an empty store', () => {
		const store = new BrowserHistoryEntriesStore();
		store.add('https://a/', 'A', undefined, false);

		store.hydrate(undefined);
		assert.deepStrictEqual(store.items, []);
		assert.strictEqual(store.add('https://b/', 'B', undefined, false).id, 1);

		store.dispose();
	});
});

suite('BrowserFaviconsStore', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('register dedups by content and returns the same hash', () => {
		const store = new BrowserFaviconsStore();
		const h1 = store.register('data:image/png;base64,AAA');
		const h2 = store.register('data:image/png;base64,AAA');
		const h3 = store.register('data:image/png;base64,BBB');

		assert.strictEqual(h1, h2);
		assert.notStrictEqual(h1, h3);
		assert.strictEqual(store.get(h1), 'data:image/png;base64,AAA');
		assert.strictEqual(store.get(h3), 'data:image/png;base64,BBB');

		store.dispose();
	});

	test('onDidChange fires only when a new favicon is added', () => {
		const store = new BrowserFaviconsStore();
		let count = 0;
		const sub = store.onDidChange(() => count++);

		store.register('a');
		store.register('a'); // duplicate — no event
		store.register('b');

		assert.strictEqual(count, 2);

		sub.dispose();
		store.dispose();
	});

	test('gc drops orphans and fires onDidChange only when something changes', () => {
		const store = new BrowserFaviconsStore();
		const h1 = store.register('a');
		const h2 = store.register('b');
		let count = 0;
		const sub = store.onDidChange(() => count++);

		store.gc(new Set([h1]));
		assert.strictEqual(store.get(h2), undefined);
		assert.strictEqual(store.get(h1), 'a');
		assert.strictEqual(count, 1);

		// Nothing to remove → no event.
		store.gc(new Set([h1]));
		assert.strictEqual(count, 1);

		sub.dispose();
		store.dispose();
	});

	test('serialize then hydrate round-trips', () => {
		const a = new BrowserFaviconsStore();
		a.register('one');
		a.register('two');
		const snapshot = a.serialize();

		const b = new BrowserFaviconsStore();
		b.hydrate(snapshot);
		assert.deepStrictEqual(b.serialize(), snapshot);

		a.dispose();
		b.dispose();
	});

	test('hydrate accepts unknown-typed data matching the current snapshot shape', () => {
		const raw: unknown = {
			map: {
				abc: 'data:image/png;base64,AAA',
				def: 'data:image/png;base64,BBB',
				// non-string values dropped silently
				bad: 123,
			},
		};

		const store = new BrowserFaviconsStore();
		store.hydrate(raw as ISerializedBrowserFaviconsSnapshot);
		assert.strictEqual(store.get('abc'), 'data:image/png;base64,AAA');
		assert.strictEqual(store.get('def'), 'data:image/png;base64,BBB');
		assert.strictEqual(store.get('bad'), undefined);

		store.dispose();
	});
});

suite('BrowserHistoryStore', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('add returns a handle whose id matches the underlying entry', () => {
		const store = new BrowserHistoryStore();
		const handle = store.add('https://a/', 'A');

		assert.strictEqual(handle.id, store.entries.items[0].id);

		store.dispose();
	});

	test('add is a no-op when max entries is 0', () => {
		const store = new BrowserHistoryStore(0);
		const handle = store.add('https://a/', 'A', 'data:image/png;base64,XXX');

		assert.deepStrictEqual(store.entries.items, []);
		assert.deepStrictEqual(store.favicons.serialize().map, {});
		// Handle should be safely callable.
		handle.update({ title: 'B' });
		handle.delete();

		store.dispose();
	});

	test('handle.update propagates to entry and registers the favicon', () => {
		const store = new BrowserHistoryStore();
		const handle = store.add('https://a/', '');
		handle.update({ title: 'A', favicon: 'data:image/png;base64,XXX' });

		const entry = store.entries.items[0];
		assert.strictEqual(entry.title, 'A');
		assert.notStrictEqual(entry.icon, undefined);
		assert.strictEqual(store.favicons.get(entry.icon!), 'data:image/png;base64,XXX');

		store.dispose();
	});

	test('handle.update with explicit `favicon: null` clears the entry icon', () => {
		const store = new BrowserHistoryStore();
		const handle = store.add('https://a/', 'A', 'data:image/png;base64,XXX');
		assert.notStrictEqual(store.entries.items[0].icon, undefined);

		handle.update({ favicon: null });
		assert.strictEqual(store.entries.items[0].icon, undefined);

		store.dispose();
	});

	test('handle.delete removes the entry and GCs the orphaned favicon', () => {
		const store = new BrowserHistoryStore();
		const handle = store.add('https://a/', 'A', 'data:image/png;base64,XXX');
		const iconHash = store.entries.items[0].icon!;
		assert.strictEqual(store.favicons.get(iconHash), 'data:image/png;base64,XXX');

		handle.delete();
		assert.deepStrictEqual(store.entries.items, []);
		assert.strictEqual(store.favicons.get(iconHash), undefined);

		store.dispose();
	});

	test('favicons referenced by other entries are kept on delete', () => {
		const store = new BrowserHistoryStore();
		const a = store.add('https://a/', 'A', 'data:image/png;base64,XXX');
		store.add('https://b/', 'B', 'data:image/png;base64,XXX');
		const iconHash = store.entries.items[0].icon!;

		a.delete();
		assert.strictEqual(store.favicons.get(iconHash), 'data:image/png;base64,XXX');

		store.dispose();
	});

	test('clear wipes entries and favicons together', () => {
		const store = new BrowserHistoryStore();
		store.add('https://a/', 'A', 'data:image/png;base64,XXX');
		store.add('https://b/', 'B', 'data:image/png;base64,YYY');

		store.clear();
		assert.deepStrictEqual(store.entries.items, []);
		assert.deepStrictEqual(store.favicons.serialize().map, {});

		store.dispose();
	});

	test('onDidChange fires for changes in either sub-store', () => {
		const store = new BrowserHistoryStore();
		let count = 0;
		const sub = store.onDidChange(() => count++);

		const handle = store.add('https://a/', 'A', 'data:image/png;base64,XXX');
		// add fired: register favicon (+1), add entry (+1), favicon GC may also fire
		const after1 = count;
		assert.ok(after1 >= 2);

		handle.update({ title: 'A2' }); // entry change → at least one more
		assert.ok(count > after1);

		sub.dispose();
		store.dispose();
	});
});
