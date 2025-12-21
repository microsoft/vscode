/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IListRenderer, IListVirtualDelegate } from '../../../../browser/ui/list/list.js';
import { ListView } from '../../../../browser/ui/list/listView.js';
import { range } from '../../../../common/arrays.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('ListView', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('all rows get disposed', function () {
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

		const listView = new ListView<number>(element, delegate, [renderer]);
		listView.layout(200);

		assert.strictEqual(templatesCount, 0, 'no templates have been allocated');
		listView.splice(0, 0, range(100));
		assert.strictEqual(templatesCount, 10, 'some templates have been allocated');
		listView.dispose();
		assert.strictEqual(templatesCount, 0, 'all templates have been disposed');
	});

	test('autoscroll keeps list scrolled to bottom on element height change', function () {
		const element = document.createElement('div');
		element.style.height = '200px';
		element.style.width = '200px';

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate() { return document.createElement('div'); },
			renderElement() { },
			disposeTemplate() { }
		};

		const listView = store.add(new ListView<number>(element, delegate, [renderer], {
			autoscroll: true,
			supportDynamicHeights: true
		}));
		listView.layout(200);
		listView.splice(0, 0, range(20));

		// Scroll to the bottom
		listView.setScrollTop(listView.scrollHeight - listView.renderHeight);
		const scrollTopBeforeUpdate = listView.scrollTop;

		// Update the height of the last element
		listView.updateElementHeight(19, 40, null);

		// The list should stay scrolled to the bottom
		assert.strictEqual(listView.scrollTop, listView.scrollHeight - listView.renderHeight, 'list should remain scrolled to bottom after height update');
		assert.ok(listView.scrollTop > scrollTopBeforeUpdate, 'scroll position should have increased');
	});

	test('autoscroll keeps list scrolled to bottom on splice', function () {
		const element = document.createElement('div');
		element.style.height = '200px';
		element.style.width = '200px';

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate() { return document.createElement('div'); },
			renderElement() { },
			disposeTemplate() { }
		};

		const listView = store.add(new ListView<number>(element, delegate, [renderer], { autoscroll: true }));
		listView.layout(200);
		listView.splice(0, 0, range(10));

		// Scroll to the bottom
		listView.setScrollTop(listView.scrollHeight - listView.renderHeight);

		// Add more items
		listView.splice(10, 0, range(10, 20));

		// The list should stay scrolled to the bottom
		assert.strictEqual(listView.scrollTop, listView.scrollHeight - listView.renderHeight, 'list should remain scrolled to bottom after splice');
	});

	test('autoscroll does not interfere when not scrolled to bottom', function () {
		const element = document.createElement('div');
		element.style.height = '200px';
		element.style.width = '200px';

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate() { return document.createElement('div'); },
			renderElement() { },
			disposeTemplate() { }
		};

		const listView = store.add(new ListView<number>(element, delegate, [renderer], {
			autoscroll: true,
			supportDynamicHeights: true
		}));
		listView.layout(200);
		listView.splice(0, 0, range(20));

		// Scroll to the middle
		listView.setScrollTop(50);
		const scrollTopBeforeSplice = listView.scrollTop;

		// Add more items
		listView.splice(20, 0, range(20, 30));

		// The scroll position should not change significantly (within scheduling tolerance)
		assert.ok(Math.abs(listView.scrollTop - scrollTopBeforeSplice) < 5, 'scroll position should remain stable when not at bottom');
	});
});
