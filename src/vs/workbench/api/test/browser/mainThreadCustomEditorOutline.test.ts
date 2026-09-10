/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { CustomEditorOutlineProviderService } from '../../browser/mainThreadCustomEditorOutline.js';

suite('MainThreadCustomEditorOutline', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes each view type through its registered provider', async () => {
		const service = store.add(new CustomEditorOutlineProviderService());
		const calls: string[] = [];

		store.add(service.registerProvider('first', {
			provideOutline: async (_resource, webviewHandle) => {
				calls.push(`first:${webviewHandle}`);
				return [];
			},
			revealItem: (_resource, webviewHandle) => calls.push(`reveal-first:${webviewHandle}`),
		}));
		store.add(service.registerProvider('second', {
			provideOutline: async (_resource, webviewHandle) => {
				calls.push(`second:${webviewHandle}`);
				return [];
			},
			revealItem: (_resource, webviewHandle) => calls.push(`reveal-second:${webviewHandle}`),
		}));

		const resource = URI.file('custom.editor');
		await service.provideOutline('first', resource, 'editor-1', CancellationToken.None);
		await service.provideOutline('second', resource, 'editor-2', CancellationToken.None);
		service.revealItem('first', resource, 'editor-1', 'item');

		assert.deepStrictEqual(calls, ['first:editor-1', 'second:editor-2', 'reveal-first:editor-1']);
	});

	test('rejects duplicate view type registrations', () => {
		const service = store.add(new CustomEditorOutlineProviderService());
		const provider = {
			provideOutline: async () => [],
			revealItem: () => { },
		};

		store.add(service.registerProvider('viewType', provider));
		assert.throws(() => service.registerProvider('viewType', provider), /already registered/);
	});

	test('keeps shared editor events alive until the last outline releases them', () => {
		const service = store.add(new CustomEditorOutlineProviderService());
		store.add(service.registerProvider('viewType', {
			provideOutline: async () => [],
			revealItem: () => { },
		}));

		const first = store.add(service.retainEditor('viewType', 'editor'));
		const second = store.add(service.retainEditor('viewType', 'editor'));
		let outlineChanges = 0;
		store.add(service.onDidChangeOutline('viewType', 'editor')(() => outlineChanges++));

		first.dispose();
		service.fireDidChangeOutline('viewType', 'editor');
		service.fireDidChangeActiveItem('viewType', 'editor', 'active');
		assert.deepStrictEqual({ outlineChanges, activeItemId: service.getActiveItemId('viewType', 'editor') }, { outlineChanges: 1, activeItemId: 'active' });

		second.dispose();
		service.fireDidChangeOutline('viewType', 'editor');
		assert.deepStrictEqual({ outlineChanges, activeItemId: service.getActiveItemId('viewType', 'editor') }, { outlineChanges: 1, activeItemId: undefined });
	});
});
