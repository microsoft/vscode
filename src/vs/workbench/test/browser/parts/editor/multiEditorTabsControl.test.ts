/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ModifierKeyEmitter } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorsOrder } from '../../../../common/editor.js';
import { createTabBarTestContext, ITabBarTestEditorSpec } from './editorTabBarTestUtils.js';

suite('MultiEditorTabsControl - Alt-hold Close Other Editors action', () => {

	const disposables = new DisposableStore();
	let container: HTMLElement;

	const editors: ITabBarTestEditorSpec[] = [
		{ resource: URI.file('/project/main.ts'), sticky: true },
		{ resource: URI.file('/project/index.ts') },
		{ resource: URI.file('/project/readme.md') },
		{ resource: URI.file('/project/package.json'), active: true },
	];

	suiteSetup(() => {
		// Warm up the singleton before the leak tracker starts, so its long-lived DisposableStore isn't flagged as a leak.
		ModifierKeyEmitter.getInstance();
	});

	setup(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	teardown(() => {
		disposables.clear();
		container.remove();
		// ModifierKeyEmitter is a process-wide singleton; don't let Alt state leak into other tests.
		ModifierKeyEmitter.getInstance().resetKeyStatus();
	});

	function pressAlt(): void {
		mainWindow.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, bubbles: true }));
	}

	function releaseAlt(): void {
		mainWindow.dispatchEvent(new KeyboardEvent('keyup', { altKey: false, bubbles: true }));
	}

	function getActionItem(titleContainer: HTMLElement, tabIndex: number): HTMLElement {
		const actionItems = titleContainer.querySelectorAll<HTMLElement>('.tabs-container > .tab .tab-actions .action-item');
		const target = actionItems[tabIndex];
		assert.ok(target, `expected an action-item element at tab index ${tabIndex}`);
		return target;
	}

	function getActionIcon(titleContainer: HTMLElement, tabIndex: number): HTMLElement {
		const icon = getActionItem(titleContainer, tabIndex).querySelector<HTMLElement>('.action-label');
		assert.ok(icon, `expected an action-label element at tab index ${tabIndex}`);
		return icon;
	}

	function clickCloseButton(titleContainer: HTMLElement, tabIndex: number): void {
		getActionItem(titleContainer, tabIndex).dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true, cancelable: true }));
	}

	test('shows Close by default and swaps to Close Other Editors while Alt is held', () => {
		const { titleContainer } = createTabBarTestContext(container, { editors }, disposables);

		// Re-queried fresh each time: swapping the pushed action rebuilds the DOM, so a cached reference would go stale.
		assert.ok(getActionIcon(titleContainer, 1).classList.contains('codicon-close'), 'expected the plain Close icon by default');

		pressAlt();
		assert.ok(getActionIcon(titleContainer, 1).classList.contains('codicon-close-all'), 'expected the Close Other Editors icon while Alt is held');

		releaseAlt();
		assert.ok(getActionIcon(titleContainer, 1).classList.contains('codicon-close'), 'expected to revert to the plain Close icon once Alt is released');
	});

	test('sticky tabs keep showing Unpin regardless of Alt', () => {
		const { titleContainer } = createTabBarTestContext(container, { editors }, disposables);

		assert.ok(getActionIcon(titleContainer, 0).classList.contains('codicon-pinned'), 'expected the Unpin icon on the sticky tab');

		pressAlt();
		assert.ok(getActionIcon(titleContainer, 0).classList.contains('codicon-pinned'), 'Alt should not affect the sticky tab\'s Unpin icon');
	});

	test('clicking while Alt is held closes every other non-sticky tab', () => {
		const { model, titleContainer } = createTabBarTestContext(container, { editors }, disposables);

		// Don't assume which resource ends up at index 1 (openPositioning can reorder tabs) — read it back instead.
		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		const stickyEditor = beforeOrder[0];
		const clickedEditor = beforeOrder[1];
		assert.ok(model.isSticky(stickyEditor));
		assert.ok(!model.isSticky(clickedEditor));

		pressAlt();
		clickCloseButton(titleContainer, 1);

		const remaining = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(remaining.length, 2);
		assert.ok(remaining.includes(stickyEditor));
		assert.ok(remaining.includes(clickedEditor));
	});

	test('closes a tab even if its matches() loosely matches the clicked tab (e.g. Welcome/walkthrough tabs)', () => {
		// e.g. GettingStartedInput.matches() returns true for any same-type instance; the filter must key off identity, not matches(), or such a tab wrongly survives.
		const { model, titleContainer } = createTabBarTestContext(container, { editors }, disposables);

		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		const stickyEditor = beforeOrder[0];
		const looselyMatchingEditor = beforeOrder[1];
		const clickedEditor = beforeOrder[2];

		// Override matches() to simulate loose matching; opening two genuinely colliding inputs would just make the model dedupe them into one tab.
		const originalMatches = looselyMatchingEditor.matches.bind(looselyMatchingEditor);
		looselyMatchingEditor.matches = other => other === clickedEditor || originalMatches(other);

		pressAlt();
		clickCloseButton(titleContainer, 2);

		const remaining = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(remaining.length, 2);
		assert.ok(remaining.includes(stickyEditor));
		assert.ok(remaining.includes(clickedEditor));
		assert.ok(!remaining.includes(looselyMatchingEditor), 'the loosely-matching tab should still be closed');
	});

	test('clicking a sticky tab\'s Unpin button while Alt is held does not close other tabs', () => {
		// Unpin's model effect isn't exercised here (it runs through ICommandService, unregistered in this harness) — this only checks Alt doesn't also trigger close-others.
		const { model, titleContainer } = createTabBarTestContext(container, { editors }, disposables);

		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.ok(model.isSticky(beforeOrder[0]), 'expected tab 0 to be sticky in this fixture');

		pressAlt();
		clickCloseButton(titleContainer, 0);

		assert.strictEqual(model.getEditors(EditorsOrder.SEQUENTIAL).length, beforeOrder.length, 'nothing should have closed');
	});

	test('without Alt, clicking closes only that one tab', () => {
		const { model, titleContainer } = createTabBarTestContext(container, { editors }, disposables);

		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		const clickedEditor = beforeOrder[1];

		clickCloseButton(titleContainer, 1);

		const remaining = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(remaining.length, beforeOrder.length - 1);
		assert.ok(!remaining.includes(clickedEditor));
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
