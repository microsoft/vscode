/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { canMoveModalEditorToEditorArea, IModalEditorOptions, IModalEditorOptionsProvider, isModalEditorOptionsProvider } from '../../../../../platform/editor/common/editor.js';
import '../../../../browser/parts/editor/media/modalEditorPart.css';

const MODAL_HEADER_HEIGHT = 33; // matches fallback in modalEditorPart.ts

/**
 * Mirrors the compact-header reconciliation in `ModalEditorPart.create`:
 *
 *   const editorModalOptions = isModalEditorOptionsProvider(activeEditor)
 *       ? activeEditor.getModalEditorOptions()
 *       : undefined;
 *   modalElement.classList.toggle('compact-header', !!editorModalOptions?.compactHeader);
 *   modalElement.classList.toggle('compact-header-active-editor-tab', ...);
 *
 * and the sash height resolution which prefers the measured header height
 * over the fallback constant.
 */
function applyCompactHeaderClasses(modalElement: { classList: DOMTokenList }, activeEditor: unknown): void {
	const editorModalOptions = isModalEditorOptionsProvider(activeEditor) ? activeEditor.getModalEditorOptions() : undefined;
	modalElement.classList.toggle('compact-header', !!editorModalOptions?.compactHeader);
	modalElement.classList.toggle('compact-header-active-editor-tab', !!editorModalOptions?.compactHeader && editorModalOptions.compactHeaderBackground === 'activeEditorTab');
}

function resolveHeaderHeight(headerElement: { offsetHeight: number }): number {
	return headerElement.offsetHeight || MODAL_HEADER_HEIGHT;
}

class TestEditor implements IModalEditorOptionsProvider {
	constructor(private readonly options: IModalEditorOptions | undefined) { }
	getModalEditorOptions(): IModalEditorOptions | undefined { return this.options; }
}

suite('Modal Editor Compact Header', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('isModalEditorOptionsProvider type guard', () => {
		assert.strictEqual(isModalEditorOptionsProvider(undefined), false);
		assert.strictEqual(isModalEditorOptionsProvider(null), false);
		assert.strictEqual(isModalEditorOptionsProvider({}), false);
		assert.strictEqual(isModalEditorOptionsProvider({ getModalEditorOptions: 'nope' }), false);
		assert.strictEqual(isModalEditorOptionsProvider(new TestEditor({ compactHeader: true })), true);
	});

	test('compact-header class toggles based on active editor options', () => {
		const modalElement = document.createElement('div');

		// No active editor → class not set
		applyCompactHeaderClasses(modalElement, undefined);
		assert.strictEqual(modalElement.classList.contains('compact-header'), false);

		// Editor that doesn't implement the provider → class not set
		applyCompactHeaderClasses(modalElement, { /* not a provider */ });
		assert.strictEqual(modalElement.classList.contains('compact-header'), false);

		// Provider returning undefined → class not set
		applyCompactHeaderClasses(modalElement, new TestEditor(undefined));
		assert.strictEqual(modalElement.classList.contains('compact-header'), false);

		// Provider opting out → class not set
		applyCompactHeaderClasses(modalElement, new TestEditor({ compactHeader: false }));
		assert.strictEqual(modalElement.classList.contains('compact-header'), false);

		// Provider opting in → class set
		applyCompactHeaderClasses(modalElement, new TestEditor({ compactHeader: true }));
		assert.strictEqual(modalElement.classList.contains('compact-header'), true);

		// Switching back to a non-compact editor clears the class
		applyCompactHeaderClasses(modalElement, new TestEditor({ compactHeader: false }));
		assert.strictEqual(modalElement.classList.contains('compact-header'), false);
	});

	test('compact header can match the active editor tab surface', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench modern-ui-tabs modern-ui-connected-editor-tabs';
		workbench.style.cssText = '--vscode-editor-background: #112233; --modern-ui-connected-tab-surface: #223344; --modern-ui-editor-tab-active-background: #445566; --modern-ui-editor-tab-custom-active-background: #665544; --modern-ui-editor-tab-active-foreground: #fefefe;';
		const modal = document.createElement('div');
		modal.className = 'monaco-modal-editor-block';
		const header = document.createElement('div');
		header.className = 'modal-editor-header';
		const title = document.createElement('div');
		title.className = 'modal-editor-title';
		header.appendChild(title);
		modal.appendChild(header);
		workbench.appendChild(modal);
		document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		applyCompactHeaderClasses(modal, new TestEditor({ compactHeader: true }));
		const editorSurface = {
			background: mainWindow.getComputedStyle(header).backgroundColor,
			activeTabClass: modal.classList.contains('compact-header-active-editor-tab'),
		};
		applyCompactHeaderClasses(modal, new TestEditor({ compactHeader: true, compactHeaderBackground: 'activeEditorTab' }));
		const connectedTabSurface = {
			background: mainWindow.getComputedStyle(header).backgroundColor,
			foreground: mainWindow.getComputedStyle(header).color,
			titleForeground: mainWindow.getComputedStyle(title).color,
			activeTabClass: modal.classList.contains('compact-header-active-editor-tab'),
		};
		workbench.classList.remove('modern-ui-connected-editor-tabs');
		const pillTabSurface = mainWindow.getComputedStyle(header).backgroundColor;

		assert.deepStrictEqual({ editorSurface, connectedTabSurface, pillTabSurface }, {
			editorSurface: {
				background: 'rgb(17, 34, 51)',
				activeTabClass: false,
			},
			connectedTabSurface: {
				background: 'rgb(102, 85, 68)',
				foreground: 'rgb(254, 254, 254)',
				titleForeground: 'rgb(254, 254, 254)',
				activeTabClass: true,
			},
			pillTabSurface: 'rgb(68, 85, 102)',
		});
	});

	test('moving to an editor area defaults to enabled and supports opt out', () => {
		assert.deepStrictEqual([
			canMoveModalEditorToEditorArea(undefined),
			canMoveModalEditorToEditorArea({}),
			canMoveModalEditorToEditorArea(new TestEditor(undefined)),
			canMoveModalEditorToEditorArea(new TestEditor({})),
			canMoveModalEditorToEditorArea(new TestEditor({ canMoveToEditorArea: true })),
			canMoveModalEditorToEditorArea(new TestEditor({ canMoveToEditorArea: false })),
		], [true, true, true, true, true, false]);
	});

	test('header height prefers measured offsetHeight over fallback constant', () => {
		// Before layout: offsetHeight === 0 → fallback constant is used
		assert.strictEqual(resolveHeaderHeight({ offsetHeight: 0 }), MODAL_HEADER_HEIGHT);

		// Default header measured at 33px
		assert.strictEqual(resolveHeaderHeight({ offsetHeight: 33 }), 33);

		// Compact-header variant measured at 40px → measured value wins
		assert.strictEqual(resolveHeaderHeight({ offsetHeight: 40 }), 40);
	});
});
