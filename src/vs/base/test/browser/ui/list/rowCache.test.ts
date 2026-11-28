/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IListRenderer } from '../../../../browser/ui/list/list.js';
import { RowCache } from '../../../../browser/ui/list/rowCache.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

interface ITestTemplateData {
	readonly container: HTMLElement;
}

suite('RowCache', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRowCache(): { cache: RowCache<number>; container: HTMLElement } {
		const container = document.createElement('div');
		const renderer: IListRenderer<number, ITestTemplateData> = {
			templateId: 'template',
			renderTemplate(container) {
				return { container };
			},
			renderElement() { },
			disposeTemplate() { }
		};
		const cache = store.add(new RowCache<number>(new Map([['template', renderer]])));
		return { cache, container };
	}

	test('removes a released row from the DOM immediately outside a transaction', () => {
		const { cache, container } = createRowCache();
		const { row } = cache.alloc('template');
		container.appendChild(row.domNode);

		cache.release(row);

		assert.strictEqual(row.domNode.parentElement, null);
	});

	test('defers removal of released rows until the transaction ends', () => {
		const { cache, container } = createRowCache();
		const { row } = cache.alloc('template');
		container.appendChild(row.domNode);

		cache.transact(() => {
			cache.release(row);
			assert.strictEqual(row.domNode.parentElement, container, 'removal must be deferred while the transaction runs');
		});

		assert.strictEqual(row.domNode.parentElement, null);
	});

	test('supports re-entrant transactions', () => {
		const { cache, container } = createRowCache();
		const { row } = cache.alloc('template');
		container.appendChild(row.domNode);

		// DOM changes inside a transaction can report scroll synchronously, which renders
		// the list again and re-enters the cache transaction (see #205597).
		cache.transact(() => {
			cache.release(row);
			cache.transact(() => {
				const reused = cache.alloc('template');
				assert.strictEqual(reused.row, row, 'the row released by the outer transaction must be reusable while it is pending removal');
				assert.strictEqual(reused.isReusingConnectedDomNode, true);
			});
		});

		// The inner transaction re-allocated the row, so it must not be removed.
		assert.strictEqual(row.domNode.parentElement, container);
	});

	test('keeps rows released inside a nested transaction until the outermost transaction ends', () => {
		const { cache, container } = createRowCache();
		const { row } = cache.alloc('template');
		container.appendChild(row.domNode);

		cache.transact(() => {
			cache.transact(() => {
				cache.release(row);
			});
			assert.strictEqual(row.domNode.parentElement, container, 'removal must be deferred until the outermost transaction ends');
		});

		assert.strictEqual(row.domNode.parentElement, null);
	});
});
