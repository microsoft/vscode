/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCancellationError } from '../../../../base/common/errors.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserViewStorageScope, IBrowserViewCreateOptions, IBrowserViewInfo } from '../../common/browserView.js';
import { BrowserViewReferences } from '../../common/browserViewReference.js';

suite('BrowserViewReferences', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options = (windowId = 1): IBrowserViewCreateOptions => ({
		host: { windowId }, owner: { type: 'user' }, session: { scope: BrowserViewStorageScope.Global },
	});

	function createReferences() {
		const views = new Map<string, IBrowserViewInfo>();
		const destroyed: string[] = [];
		const references = store.add(new BrowserViewReferences((id, options) => {
			let view = views.get(id);
			if (!view) {
				view = upcastPartial<IBrowserViewInfo>({ id, host: options.host });
				views.set(id, view);
			}
			return view;
		}, id => {
			if (views.delete(id)) {
				destroyed.push(id);
			}
		}));
		return { references, views, destroyed };
	}

	test('preserves a native view for a lazy replacement and destroys it on the final release', () => {
		const { references, views, destroyed } = createReferences();
		references.acquire('page', 1, 'original');
		const view = references.getOrCreate('page', options(), 'original');
		references.acquire('page', 1, 'replacement');
		references.release('page', 'original');
		const preserved = views.get('page') === view;
		const reused = references.getOrCreate('page', options(), 'replacement') === view;
		references.release('page', 'original');
		references.release('page', 'replacement');
		references.release('page', 'replacement');
		assert.deepStrictEqual({ preserved, reused, remaining: views.size, destroyed }, {
			preserved: true, reused: true, remaining: 0, destroyed: ['page'],
		});
		assert.throws(() => references.getOrCreate('page', options(), 'replacement'), isCancellationError);
	});

	test('releases lazy references without creating a native view or retaining their window', () => {
		const { references, views, destroyed } = createReferences();
		for (let index = 0; index < 3; index++) {
			references.acquire('page', index, 'lazy');
			references.release('page', 'lazy');
		}
		assert.deepStrictEqual({ remaining: views.size, destroyed }, { remaining: 0, destroyed: [] });
		assert.throws(() => references.getOrCreate('page', options(2), 'lazy'), isCancellationError);
	});

	test('rejects creation without a reference and ownership from another window', () => {
		const { references, views } = createReferences();
		references.acquire('page', 1, 'owner');
		assert.throws(() => references.getOrCreate('page', options(), 'absent'), isCancellationError);
		assert.throws(() => references.getOrCreate('page', options(2), 'owner'), isCancellationError);
		assert.throws(() => references.acquire('page', 2, 'other'), /another workbench window/);
		assert.strictEqual(views.size, 0);
	});

	test('ignores stale releases after native closure and same-ID recreation', () => {
		const { references, views, destroyed } = createReferences();
		references.acquire('page', 1, 'original');
		references.getOrCreate('page', options(), 'original');
		views.delete('page');
		references.clear('page');
		references.acquire('page', 1, 'replacement');
		const replacement = references.getOrCreate('page', options(), 'replacement');
		references.release('page', 'original');
		assert.deepStrictEqual({ preserved: views.get('page') === replacement, destroyed }, { preserved: true, destroyed: [] });
		references.release('page', 'replacement');
		assert.deepStrictEqual(destroyed, ['page']);
	});

	test('window teardown removes native and lazy references while preserving other windows', () => {
		const { references, views, destroyed } = createReferences();
		references.acquire('page', 1, 'owner');
		references.acquire('page', 1, 'pending');
		references.acquire('lazy', 1, 'lazy');
		references.acquire('other', 2, 'other');
		references.getOrCreate('page', options(), 'owner');
		references.getOrCreate('other', options(2), 'other');
		references.clearWindow(1);
		references.release('page', 'pending');
		assert.throws(() => references.getOrCreate('page', options(), 'owner'), isCancellationError);
		assert.throws(() => references.getOrCreate('lazy', options(), 'lazy'), isCancellationError);
		assert.deepStrictEqual({ remaining: [...views.keys()], destroyed }, { remaining: ['other'], destroyed: ['page'] });
		references.acquire('lazy', 2, 'new');
		references.clearWindow(2);
		assert.strictEqual(views.size, 0);
	});

	test('reload drops old references while preserving native views for the next renderer', () => {
		const { references, views, destroyed } = createReferences();
		references.acquire('page', 1, 'original');
		references.acquire('lazy', 1, 'lazy');
		const view = references.getOrCreate('page', options(), 'original');
		references.clearWindow(1, true);
		assert.throws(() => references.getOrCreate('page', options(), 'original'), isCancellationError);
		assert.throws(() => references.getOrCreate('lazy', options(), 'lazy'), isCancellationError);
		references.acquire('page', 1, 'replacement');
		const reused = references.getOrCreate('page', options(), 'replacement') === view;
		references.release('page', 'original');
		assert.deepStrictEqual({ reused, remaining: [...views.keys()], destroyed }, { reused: true, remaining: ['page'], destroyed: [] });
		references.release('page', 'replacement');
		assert.deepStrictEqual({ remaining: views.size, destroyed }, { remaining: 0, destroyed: ['page'] });
	});
});
