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

	test('focused row is kept in DOM when its element is spliced out', function () {
		const container = document.createElement('div');
		container.style.height = '200px';
		container.style.width = '200px';
		document.body.appendChild(container);

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		let templatesCount = 0;

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate(node: HTMLElement) {
				templatesCount++;
				const input = document.createElement('input');
				node.appendChild(input);
			},
			renderElement() { },
			disposeTemplate() { templatesCount--; }
		};

		const listView = new ListView<number>(container, delegate, [renderer]);
		listView.layout(200);
		listView.splice(0, 0, range(3));

		// Focus the input inside the first row
		const firstRowInput = container.querySelectorAll('.monaco-list-row input')[0] as HTMLInputElement;
		assert.ok(firstRowInput, 'input should be in DOM');
		firstRowInput.focus();
		assert.strictEqual(document.activeElement, firstRowInput, 'input should be focused');

		// Splice out the first item (which currently holds DOM focus)
		listView.splice(0, 1);

		// The row should still be in the DOM because it holds focus
		assert.ok(container.contains(firstRowInput), 'focused row should still be in DOM after splice');
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 3, 'DOM still has 3 row nodes (focused row is deferred)');

		// Blur — this should complete the deferred release
		firstRowInput.blur();

		// The row should now be removed
		assert.ok(!container.contains(firstRowInput), 'row should be removed from DOM after losing focus');
		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 2, 'DOM now has only 2 row nodes');

		listView.dispose();
		assert.strictEqual(templatesCount, 0, 'all templates should be disposed');
		document.body.removeChild(container);
	});

	test('focused row template is disposed when listView is disposed while row has focus', function () {
		const container = document.createElement('div');
		container.style.height = '200px';
		container.style.width = '200px';
		document.body.appendChild(container);

		const delegate: IListVirtualDelegate<number> = {
			getHeight() { return 20; },
			getTemplateId() { return 'template'; }
		};

		let templatesCount = 0;

		const renderer: IListRenderer<number, void> = {
			templateId: 'template',
			renderTemplate(node: HTMLElement) {
				templatesCount++;
				const input = document.createElement('input');
				node.appendChild(input);
			},
			renderElement() { },
			disposeTemplate() { templatesCount--; }
		};

		const listView = new ListView<number>(container, delegate, [renderer]);
		listView.layout(200);
		listView.splice(0, 0, range(3));

		// Focus the input inside the first row
		const firstRowInput = container.querySelectorAll('.monaco-list-row input')[0] as HTMLInputElement;
		firstRowInput.focus();

		// Splice out the focused item
		listView.splice(0, 1);
		assert.ok(container.contains(firstRowInput), 'focused row should still be in DOM after splice');

		// Dispose while the row is still focused (focus never left)
		listView.dispose();

		// All templates must still have been cleaned up
		assert.strictEqual(templatesCount, 0, 'all templates should be disposed even when listView is disposed while row has focus');
		document.body.removeChild(container);
	});
});
