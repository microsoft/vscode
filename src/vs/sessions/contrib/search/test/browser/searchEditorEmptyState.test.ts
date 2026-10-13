/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getActiveElement, getWindow } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { SearchEditorScheme } from '../../../../../workbench/contrib/searchEditor/browser/constants.js';
import { SearchEditorEmptyStateContribution } from '../../browser/searchEditorEmptyState.contribution.js';

suite('Sessions - Search editor empty state', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor() {
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '600px';
		container.style.height = '300px';
		container.style.setProperty('--vscode-spacing-size200', '20px');
		const instantiationService = createCodeEditorServices(store);
		const editor = store.add(instantiationService.createInstance(CodeEditorWidget, container, {
			dimension: { width: 600, height: 300 },
			minimap: { enabled: false },
		}, {
			contributions: EditorExtensionsRegistry.getEditorContributions().filter(contribution => contribution.id === SearchEditorEmptyStateContribution.ID),
		}));
		editor.getContribution(SearchEditorEmptyStateContribution.ID);
		return { editor, container };
	}

	function searchModel(text = '') {
		return store.add(createTextModel(text, null, undefined, URI.from({ scheme: SearchEditorScheme, fragment: 'test' })));
	}

	test('shows a semantic, non-interactive empty state without taking focus', () => {
		const { editor, container } = createEditor();
		const input = append(container, $('input'));
		input.focus();
		editor.setModel(searchModel());
		const emptyState = container.querySelector('.sessions-search-empty-state');
		assert.ok(emptyState);
		assert.deepStrictEqual({
			title: emptyState.querySelector('h2')?.textContent,
			description: emptyState.querySelector('.sessions-empty-state-description')?.textContent,
			tabStops: emptyState.querySelectorAll('a, button, input, [tabindex]').length,
			focusPreserved: getActiveElement() === input,
		}, {
			title: 'Search',
			description: 'Search for text in your files',
			tabStops: 0,
			focusPreserved: true,
		});
	});

	test('tracks results and restores the empty state when content is cleared', () => {
		const { editor, container } = createEditor();
		const model = searchModel();
		const states: boolean[] = [];
		editor.setModel(model);
		for (const text of ['', '1 result - 1 file\n\napp.ts:\n  1: hello', 'No Results\n', '']) {
			model.setValue(text);
			states.push(!!container.querySelector('.sessions-search-empty-state'));
		}
		assert.deepStrictEqual(states, [true, false, false, true]);
	});

	test('handles restored results, model replacement, and clearing the editor', () => {
		const { editor, container } = createEditor();
		const restored = searchModel('1 result - 1 file\n\napp.ts:\n  1: hello');
		const empty = searchModel();
		const states: boolean[] = [];
		for (const model of [restored, empty, null, empty, restored]) {
			editor.setModel(model);
			states.push(!!container.querySelector('.sessions-search-empty-state'));
		}
		empty.setValue('No Results\n');
		states.push(!!container.querySelector('.sessions-search-empty-state'));
		assert.deepStrictEqual(states, [false, true, false, true, false, false]);
	});

	test('does not show in ordinary empty text editors or without a model', () => {
		const { editor, container } = createEditor();
		const states = [!!container.querySelector('.sessions-search-empty-state')];
		editor.setModel(store.add(createTextModel('', null, undefined, URI.file('/test.txt'))));
		states.push(!!container.querySelector('.sessions-search-empty-state'));
		assert.deepStrictEqual(states, [false, false]);
	});

	test('centers the message in the results editor and follows layout changes', () => {
		const { editor, container } = createEditor();
		editor.setModel(searchModel());
		const dimensions = [];
		for (const size of [{ width: 600, height: 300 }, { width: 240, height: 400 }]) {
			editor.layout(size);
			const overlay = container.querySelector<HTMLElement>('.sessions-search-empty-state');
			const content = overlay?.querySelector<HTMLElement>('.sessions-empty-state');
			assert.ok(overlay && content);
			// Exercise subpixel flex centering independently of the platform's font metrics.
			content.style.width = `${size.width / 2 + 1 / 64}px`;
			const overlayRect = overlay.getBoundingClientRect();
			const contentRect = content.getBoundingClientRect();
			// Compare centers at CSS-pixel precision to allow fractional layout rounding.
			dimensions.push({
				width: overlayRect.width,
				height: overlayRect.height,
				horizontalOffset: Math.round(Math.abs((contentRect.left + contentRect.right - overlayRect.left - overlayRect.right) / 2)),
				verticalOffset: Math.round(Math.abs((contentRect.top + contentRect.bottom - overlayRect.top - overlayRect.bottom) / 2)),
				pointerEvents: getWindow(overlay).getComputedStyle(overlay).pointerEvents,
			});
		}
		assert.deepStrictEqual(dimensions, [
			{ width: 600, height: 300, horizontalOffset: 0, verticalOffset: 0, pointerEvents: 'none' },
			{ width: 240, height: 400, horizontalOffset: 0, verticalOffset: 0, pointerEvents: 'none' },
		]);
	});

	test('removes the overlay and listeners when the contribution is disposed', () => {
		const { editor, container } = createEditor();
		const model = searchModel();
		editor.setModel(model);
		const contribution = editor.getContribution(SearchEditorEmptyStateContribution.ID);
		assert.ok(contribution);
		contribution.dispose();
		model.setValue('result');
		model.setValue('');
		editor.layout({ width: 240, height: 400 });
		assert.strictEqual(container.querySelector('.sessions-search-empty-state'), null);
	});
});
