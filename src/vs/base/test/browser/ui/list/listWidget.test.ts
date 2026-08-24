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

	test('aria-activedescendant references a rendered element', function () {
		const element = document.createElement('div');
		element.style.height = '20px';
		element.style.width = '200px';

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate() { },
			renderElement() { },
			disposeTemplate() { }
		};

		const listWidget = store.add(new List<number>('test', element, delegate, [renderer], {
			accessibilityProvider: {
				getAriaLabel: element => String(element),
				getWidgetAriaLabel: () => 'Test list',
				getActiveDescendantId: () => undefined
			}
		}));
		listWidget.layout(20);
		listWidget.splice(0, 0, range(100));

		const listElement = element.querySelector<HTMLElement>('.monaco-list')!;
		const focusedElementId = listWidget.getElementID(50);

		listWidget.setFocus([50]);
		const beforeReveal = {
			activeDescendant: listElement.getAttribute('aria-activedescendant'),
			focusedElementRendered: element.querySelector(`#${focusedElementId}`) !== null
		};

		listWidget.reveal(50);
		const afterReveal = {
			activeDescendant: listElement.getAttribute('aria-activedescendant'),
			focusedElementRendered: element.querySelector(`#${focusedElementId}`) !== null
		};

		assert.deepStrictEqual({ beforeReveal, afterReveal }, {
			beforeReveal: {
				activeDescendant: null,
				focusedElementRendered: false
			},
			afterReveal: {
				activeDescendant: focusedElementId,
				focusedElementRendered: true
			}
		});
	});
});
