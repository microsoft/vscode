/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IconLabel } from '../../browser/ui/iconLabel/iconLabel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('IconLabel - bgColorClassName', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies bgColorClassName to labelContainer when no decoration container', () => {
		const container = document.createElement('div');
		const label = store.add(new IconLabel(container));
		label.setLabel('test', undefined, { bgColorClassName: 'my-bg' });
		const labelContainer = container.querySelector('.monaco-icon-label-container');
		assert.ok(labelContainer?.classList.contains('my-bg'));
	});

	test('applies bgColorClassName to decoration container when present', () => {
		const row = document.createElement('div');
		row.classList.add('monaco-list-row');
		const decorationContainer = document.createElement('div');
		decorationContainer.classList.add('monaco-tl-decoration-container');
		row.appendChild(decorationContainer);
		const container = document.createElement('div');
		row.appendChild(container);
		const label = store.add(new IconLabel(container));
		label.setLabel('test', undefined, { bgColorClassName: 'my-bg' });
		assert.ok(decorationContainer.classList.contains('my-bg'));
		assert.ok(!container.querySelector('.monaco-icon-label-container')?.classList.contains('my-bg'));
	});

	test('bgColorClassName persists after re-render', () => {
		const container = document.createElement('div');
		const label = store.add(new IconLabel(container));
		label.setLabel('test', undefined, { bgColorClassName: 'my-bg' });
		label.setLabel('test2', undefined, { bgColorClassName: 'my-bg' });
		const labelContainer = container.querySelector('.monaco-icon-label-container');
		assert.ok(labelContainer?.classList.contains('my-bg'));
	});

	test('bgColorClassName removed on re-render without it', () => {
		const container = document.createElement('div');
		const label = store.add(new IconLabel(container));
		label.setLabel('test', undefined, { bgColorClassName: 'my-bg' });
		label.setLabel('test2');
		const labelContainer = container.querySelector('.monaco-icon-label-container');
		assert.ok(!labelContainer?.classList.contains('my-bg'));
	});

	test('creates decoration container in flat list row', () => {
		const row = document.createElement('div');
		row.classList.add('monaco-list-row');
		const container = document.createElement('div');
		row.appendChild(container);
		const label = store.add(new IconLabel(container));
		label.setLabel('test', undefined, { bgColorClassName: 'my-bg' });
		const decoEl = row.querySelector('.monaco-icon-label-decoration-container');
		assert.ok(decoEl?.classList.contains('my-bg'));
		assert.ok(!container.querySelector('.monaco-icon-label-container')?.classList.contains('my-bg'));
	});

	test('creates decoration container inside tab', () => {
		const tab = document.createElement('div');
		tab.classList.add('tab');
		const container = document.createElement('div');
		tab.appendChild(container);
		const label = store.add(new IconLabel(container));
		label.setLabel('test', undefined, { bgColorClassName: 'my-bg' });
		const decoEl = tab.querySelector('.monaco-icon-label-decoration-container');
		assert.ok(decoEl?.classList.contains('my-bg'));
		assert.ok(!container.querySelector('.monaco-icon-label-container')?.classList.contains('my-bg'));
	});
});
