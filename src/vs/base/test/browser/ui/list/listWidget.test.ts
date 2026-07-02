/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IListRenderer, IListVirtualDelegate } from '../../../../browser/ui/list/list.js';
import { List } from '../../../../browser/ui/list/listWidget.js';
import { range } from '../../../../common/arrays.js';
import { timeout } from '../../../../common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('ListWidget', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Page up and down', async function () {
		const element = document.createElement('div');
		element.style.height = '200px';
		element.style.width = '200px';

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		let templatesCount = 0;

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate() { templatesCount++; },
			renderElement() { },
			disposeTemplate() { templatesCount--; }
		};

		const listWidget = store.add(new List<number>('test', element, delegate, [renderer]));

		listWidget.layout(200);
		assert.strictEqual(templatesCount, 0, 'no templates have been allocated');
		listWidget.splice(0, 0, range(100));
		listWidget.focusFirst();

		listWidget.focusNextPage();
		assert.strictEqual(listWidget.getFocus()[0], 9, 'first page down moves focus to element at bottom');

		// scroll to next page is async
		listWidget.focusNextPage();
		await timeout(0);
		assert.strictEqual(listWidget.getFocus()[0], 19, 'page down to next page');

		listWidget.focusPreviousPage();
		assert.strictEqual(listWidget.getFocus()[0], 10, 'first page up moves focus to element at top');

		// scroll to previous page is async
		listWidget.focusPreviousPage();
		await timeout(0);
		assert.strictEqual(listWidget.getFocus()[0], 0, 'page down to previous page');
	});

	test('Page up and down with item taller than viewport #149502', async function () {
		const element = document.createElement('div');
		element.style.height = '200px';
		element.style.width = '200px';

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 200; },
			getTemplateId() { return 'template'; }
		};

		let templatesCount = 0;

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate() { templatesCount++; },
			renderElement() { },
			disposeTemplate() { templatesCount--; }
		};

		const listWidget = store.add(new List<number>('test', element, delegate, [renderer]));

		listWidget.layout(200);
		assert.strictEqual(templatesCount, 0, 'no templates have been allocated');
		listWidget.splice(0, 0, range(100));
		listWidget.focusFirst();
		assert.strictEqual(listWidget.getFocus()[0], 0, 'initial focus is first element');

		// scroll to next page is async
		listWidget.focusNextPage();
		await timeout(0);
		assert.strictEqual(listWidget.getFocus()[0], 1, 'page down to next page');

		// scroll to previous page is async
		listWidget.focusPreviousPage();
		await timeout(0);
		assert.strictEqual(listWidget.getFocus()[0], 0, 'page up to next page');
	});

	test('Page up and down scrolls within tall item that spans multiple pages', async function () {
		const element = document.createElement('div');
		const VIEWPORT_HEIGHT = 200;
		const TALL_ITEM_HEIGHT = 500; // Item is 2.5x taller than viewport
		element.style.height = `${VIEWPORT_HEIGHT}px`;
		element.style.width = '200px';

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return TALL_ITEM_HEIGHT; },
			getTemplateId() { return 'template'; }
		};

		let templatesCount = 0;

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate() { templatesCount++; },
			renderElement() { },
			disposeTemplate() { templatesCount--; }
		};

		const listWidget = store.add(new List<number>('test', element, delegate, [renderer]));

		listWidget.layout(VIEWPORT_HEIGHT);
		listWidget.splice(0, 0, range(100));
		listWidget.focusFirst();
		assert.strictEqual(listWidget.getFocus()[0], 0, 'initial focus is first element');
		assert.strictEqual(listWidget.scrollTop, 0, 'initial scroll position is 0');

		// First page down should scroll within the same tall item
		listWidget.focusNextPage();
		assert.strictEqual(listWidget.getFocus()[0], 0, 'focus should remain on first element');
		assert.strictEqual(listWidget.scrollTop, VIEWPORT_HEIGHT, 'should scroll down by viewport height');

		// Second page down should scroll within the same tall item again
		listWidget.focusNextPage();
		assert.strictEqual(listWidget.getFocus()[0], 0, 'focus should remain on first element');
		assert.strictEqual(listWidget.scrollTop, VIEWPORT_HEIGHT * 2, 'should scroll down by viewport height again');

		// Third page down should scroll to next item since we reached the end of the tall item
		listWidget.focusNextPage();
		await timeout(0);
		assert.strictEqual(listWidget.getFocus()[0], 1, 'focus should move to next element');

		// Page up should scroll within the same tall item (item 1 starts at 500px)
		listWidget.focusPreviousPage();
		assert.strictEqual(listWidget.getFocus()[0], 1, 'focus should remain on second element');
		assert.strictEqual(listWidget.scrollTop, TALL_ITEM_HEIGHT, 'should scroll up by viewport height');

		// Continue paging up to scroll back to previous item
		listWidget.focusPreviousPage();
		await timeout(0);
		assert.strictEqual(listWidget.getFocus()[0], 0, 'focus should move back to first element');
	});
});
