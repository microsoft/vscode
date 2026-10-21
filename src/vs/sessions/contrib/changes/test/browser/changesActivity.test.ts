/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { hasNewChanges, MAX_SEEN_CHANGES_CHATS, SeenChangesStore } from '../../browser/changesActivity.js';

suite('Sessions - Changes Activity', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const stats = (files: number, insertions = files, deletions = 0) => ({ files, insertions, deletions });

	test('reports changes as new only when they differ from seen changes', () => {
		assert.deepStrictEqual({
			neverSeen: hasNewChanges(stats(2), undefined),
			unchanged: hasNewChanges(stats(2, 5, 1), stats(2, 5, 1)),
			moreLines: hasNewChanges(stats(2, 6, 1), stats(2, 5, 1)),
			fromNoChanges: hasNewChanges(stats(1), stats(0)),
			noChanges: hasNewChanges(stats(0), stats(2)),
		}, {
			neverSeen: false,
			unchanged: false,
			moreLines: true,
			fromNoChanges: true,
			noChanges: false,
		});
	});

	test('persists seen changes and evicts the least recently seen chat', () => {
		const storageService = store.add(new TestStorageService());
		const seen = store.add(new SeenChangesStore(storageService));
		for (let i = 0; i <= MAX_SEEN_CHANGES_CHATS; i++) {
			seen.set(`chat${i}`, stats(i));
		}
		// Seeing chat1 again keeps it over chat2.
		seen.set('chat1', stats(7));
		seen.set('overflow', stats(3));

		const restored = store.add(new SeenChangesStore(storageService));
		assert.deepStrictEqual(['chat0', 'chat1', 'chat2', 'overflow'].map(chat => restored.get(chat, undefined)), [
			undefined,
			stats(7),
			undefined,
			stats(3),
		]);
	});
});
