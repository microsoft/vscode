/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { registerMobileSheetNavigation } from '../../../workbench/contrib/sessions/browser/mobile/mobileSheetNavigation.js';
import { showMobileSortGroupSheet } from '../../../workbench/contrib/sessions/browser/mobile/mobileSortGroupSheet.js';
import { MobileNavigationStack } from '../../browser/mobileNavigationStack.js';
import { showMobileDialogSheet } from '../../browser/parts/dialogs/mobileDialogSheet.js';

class TestHistory extends Disposable implements Pick<History, 'state' | 'pushState' | 'back'> {
	private readonly entries: unknown[] = [{ route: 'agents', id: 999 }];
	private position = 0;
	pendingBacks = 0;
	private readonly changed = this._register(new Emitter<{ readonly state: unknown }>());
	readonly onPopState = this.changed.event;

	get state(): unknown { return this.entries[this.position]; }

	pushState(state: unknown): void {
		this.entries.splice(this.position + 1);
		this.entries.push(state);
		this.position++;
	}

	back(): void { this.pendingBacks++; }

	completeBack(): void {
		assert.ok(this.pendingBacks > 0 && this.position > 0);
		this.pendingBacks--;
		this.position--;
		this.changed.fire({ state: this.state });
	}

	forward(): void {
		if (this.position + 1 < this.entries.length) {
			this.position++;
			this.changed.fire({ state: this.state });
		}
	}
}

suite('MobileNavigationStack', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Back dismisses only the top sheet before the drawer and Forward does not restore stale layers', () => {
		const history = store.add(new TestHistory());
		const navigation = store.add(new MobileNavigationStack(history, history.onPopState));
		const dismissed: string[] = [];
		store.add(navigation.onDidPop(layer => { dismissed.push(layer); navigation.popSilently(layer); }));
		navigation.push('sidebar');
		const outer = store.add(navigation.registerSheet(() => { dismissed.push('outer'); outer.dispose(); }));
		const inner = store.add(navigation.registerSheet(() => { dismissed.push('inner'); inner.dispose(); }));
		const states = [];
		for (let i = 0; i < 3; i++) {
			history.back();
			history.completeBack();
			states.push({ dismissed: [...dismissed], top: navigation.peek(), pending: history.pendingBacks });
		}
		history.forward();
		history.completeBack();

		assert.deepStrictEqual({ states, final: history.state, dismissed }, {
			states: [
				{ dismissed: ['inner'], top: 'sheet', pending: 0 },
				{ dismissed: ['inner', 'outer'], top: 'sidebar', pending: 0 },
				{ dismissed: ['inner', 'outer', 'sidebar'], top: undefined, pending: 0 },
			],
			final: { route: 'agents', id: 999 },
			dismissed: ['inner', 'outer', 'sidebar'],
		});
	});

	test('UI closes and replacement sheets do not consume pending Back navigation', () => {
		const history = store.add(new TestHistory());
		const navigation = store.add(new MobileNavigationStack(history, history.onPopState));
		const dismissed: string[] = [];
		const first = store.add(navigation.registerSheet(() => dismissed.push('first')));
		first.dispose();
		const outer = store.add(navigation.registerSheet(() => dismissed.push('outer')));
		const replacement = store.add(navigation.registerSheet(() => { dismissed.push('replacement'); replacement.dispose(); }));
		outer.dispose();
		history.completeBack();
		const beforeBack = { dismissed: [...dismissed], top: navigation.peek(), pending: history.pendingBacks };
		history.back();
		history.completeBack();

		assert.deepStrictEqual({ beforeBack, dismissed, top: navigation.peek(), state: history.state, pending: history.pendingBacks }, {
			beforeBack: { dismissed: [], top: 'sheet', pending: 0 },
			dismissed: ['replacement'], top: undefined, state: { route: 'agents', id: 999 }, pending: 0,
		});
	});

	test('clearing closes sheets once and coalesces history cleanup', () => {
		const history = store.add(new TestHistory());
		const navigation = store.add(new MobileNavigationStack(history, history.onPopState));
		const dismissed: string[] = [];
		navigation.push('sidebar');
		const outer = store.add(navigation.registerSheet(() => { dismissed.push('outer'); outer.dispose(); }));
		const inner = store.add(navigation.registerSheet(() => { dismissed.push('inner'); inner.dispose(); }));
		navigation.clear();
		navigation.clear();
		history.completeBack();

		assert.deepStrictEqual({ dismissed, top: navigation.peek(), state: history.state, pending: history.pendingBacks }, {
			dismissed: ['inner', 'outer'], top: undefined, state: { route: 'agents', id: 999 }, pending: 0,
		});
	});

	test('reloading with an open layer does not leave an extra history entry', () => {
		const history = store.add(new TestHistory());
		const first = store.add(new MobileNavigationStack(history, history.onPopState));
		first.push('sidebar');
		first.dispose();
		const reloaded = store.add(new MobileNavigationStack(history, history.onPopState));
		reloaded.push('sidebar');
		history.completeBack();
		history.back();
		history.completeBack();

		assert.deepStrictEqual({ top: reloaded.peek(), state: history.state, pending: history.pendingBacks }, {
			top: undefined, state: { route: 'agents', id: 999 }, pending: 0,
		});
	});

	test('Sort uses the shared Back lifecycle and touch-sized close control', async () => {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		container.style.cssText = 'position: fixed; inset: 0; width: 390px; contain: layout;';
		container.style.setProperty('--vscode-spacing-size40', '4px');
		container.style.setProperty('--vscode-spacing-size80', '8px');
		store.add(toDisposable(() => container.remove()));
		const trigger = dom.append(container, dom.$('button'));
		trigger.focus();
		const history = store.add(new TestHistory());
		const navigation = store.add(new MobileNavigationStack(history, history.onPopState));
		store.add(registerMobileSheetNavigation(container, dismiss => navigation.registerSheet(dismiss)));
		const dismissed: string[] = [];
		store.add(navigation.onDidPop(layer => dismissed.push(layer)));
		navigation.push('sidebar');
		const closed = showMobileSortGroupSheet(container, 'Sort', [
			{ id: 'created', label: 'Created', checked: true, group: 'sort', groupTitle: 'Sort' },
			{ id: 'updated', label: 'Updated', checked: false, group: 'sort' },
		]);
		const close = container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!;
		store.add(toDisposable(() => close.click()));
		await Promise.all(container.getAnimations({ subtree: true }).map(animation => animation.finished));
		const bounds = close.getBoundingClientRect();
		const ownsCorners = [bounds.left + 1, bounds.right - 1].every(x =>
			[bounds.top + 1, bounds.bottom - 1].every(y => close.contains(mainWindow.document.elementFromPoint(x, y))));
		history.back();
		history.completeBack();

		assert.deepStrictEqual({
			selected: await closed, dismissed, top: navigation.peek(),
			focusRestored: dom.getActiveElement() === trigger,
			touchTarget: bounds.width >= 44 && bounds.height >= 44 && ownsCorners,
		}, { selected: undefined, dismissed: [], top: 'sidebar', focusRestored: true, touchTarget: true });
		navigation.clear();
		history.completeBack();
	});

	test('a closing dialog does not steal focus from its replacement', async () => {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const trigger = dom.append(container, dom.$('button'));
		trigger.focus();
		const layout = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = container;
		}();
		const options = { title: 'Confirm', message: 'Continue?', buttons: [{ label: 'Cancel', isCancel: true }], defaultButtonIndex: 0 };
		const first = showMobileDialogSheet(layout, options);
		container.querySelector<HTMLElement>('.mobile-content-sheet-actions .monaco-button')!.click();
		const second = showMobileDialogSheet(layout, options);
		const secondButton = container.querySelector<HTMLElement>('.mobile-picker-sheet:not(.closing) .mobile-content-sheet-actions .monaco-button')!;
		store.add(toDisposable(() => secondButton.click()));
		await first;
		const replacementFocused = dom.getActiveElement() === secondButton;
		secondButton.click();
		await second;

		assert.deepStrictEqual({ replacementFocused, focusRestored: dom.getActiveElement() === trigger }, {
			replacementFocused: true, focusRestored: true,
		});
	});
});
