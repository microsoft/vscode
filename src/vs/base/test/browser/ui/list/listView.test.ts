/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CachedListVirtualDelegate, IListRenderer, IListVirtualDelegate } from '../../../../browser/ui/list/list.js';
import { ListView } from '../../../../browser/ui/list/listView.js';
import { range } from '../../../../common/arrays.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('ListView', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('publishes freshly measured dynamic heights', function () {
		const element = document.createElement('div');
		element.style.height = '200px';
		element.style.width = '200px';
		document.body.appendChild(element);

		type TestElement = { height: number };
		const delegate = new class extends CachedListVirtualDelegate<TestElement> {
			protected estimateHeight() { return 100; }
			getTemplateId() { return 'template'; }
			hasDynamicHeight() { return true; }
			getMeasuredHeight(element: TestElement) { return this.getCachedHeight(element); }
		};
		const renderer: IListRenderer<TestElement, HTMLElement> = {
			templateId: 'template',
			renderTemplate(container) {
				const content = document.createElement('div');
				container.appendChild(content);
				return content;
			},
			renderElement(element, _index, templateData) { templateData.style.height = `${element.height}px`; },
			disposeTemplate() { }
		};

		const elements: TestElement[] = [{ height: 40 }, { height: 100 }, { height: 160 }];
		const listView = new ListView<TestElement>(element, delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(200, 200);
			listView.splice(0, 0, elements);
			assert.deepStrictEqual(elements.map(element => delegate.getMeasuredHeight(element)), [40, 100, 160]);
		} finally {
			listView.dispose();
			element.remove();
		}
	});

	test('publishes positive delegate-provided dynamic heights', function () {
		type TestElement = { height: number };
		const publishedHeights = new Map<TestElement, number>();
		const delegate: IListVirtualDelegate<TestElement> = {
			getHeight() { return 100; },
			getTemplateId() { return 'template'; },
			getDynamicHeight(element) { return element.height; },
			setDynamicHeight(element, height) { publishedHeights.set(element, height); }
		};
		const renderer: IListRenderer<TestElement, void> = {
			templateId: 'template',
			renderTemplate() { },
			renderElement() { },
			disposeTemplate() { }
		};

		const elements: TestElement[] = [{ height: 0 }, { height: 40 }, { height: 100 }, { height: 160 }];
		const listView = new ListView<TestElement>(document.createElement('div'), delegate, [renderer], { supportDynamicHeights: true });
		try {
			listView.layout(400, 200);
			listView.splice(0, 0, elements);
			assert.deepStrictEqual(elements.map(element => publishedHeights.get(element)), [undefined, 40, 100, 160]);
		} finally {
			listView.dispose();
		}
	});
});
