/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getActiveElement } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { ActionRunner, toAction } from '../../../base/common/actions.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SubmenuFlyout } from '../../browser/parts/submenuFlyout.js';
import { TestContextViewService } from './testContextViewService.js';

suite('Sessions - Submenu flyout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFlyout(disposables: Pick<DisposableStore, 'add'>) {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		disposables.add(toDisposable(() => root.remove()));
		const anchor = append(root, $('a.anchor'));
		anchor.tabIndex = 0;
		const outside = append(root, $('input.outside'));

		const ran: string[] = [];
		const actions = [toAction({ id: 'test.kusto', label: 'Kusto', run: () => { ran.push('test.kusto'); } })];
		const actionRunner = disposables.add(new ActionRunner());
		const contextViewService = new TestContextViewService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IContextViewService, contextViewService);
		const flyout = disposables.add(instantiationService.createInstance(SubmenuFlyout, {
			anchor,
			getActions: () => actions,
			getActionRunner: () => actionRunner,
			lookupKeybinding: () => undefined,
			openKeys: [KeyCode.Enter],
			closeKeys: [KeyCode.LeftArrow],
		}));
		const state = () => ({ open: flyout.isOpen, expanded: anchor.getAttribute('aria-expanded'), highlighted: anchor.classList.contains('submenu-open'), shown: contextViewService.openSubmenu });
		return { anchor, outside, flyout, contextViewService, ran, state };
	}

	test('marks its anchor and closes on outside clicks, window blur, a replacing context view, and disposal', () => {
		const disposables = store.add(new DisposableStore());
		const { anchor, outside, flyout, contextViewService, state } = createFlyout(disposables);
		const anchorAttributes = { popup: anchor.getAttribute('aria-haspopup'), expanded: anchor.getAttribute('aria-expanded') };
		const mouseDown = (target: Element) => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		flyout.show(false);
		const opened = state();
		mouseDown(anchor);
		const afterClickOnAnchor = state().open;
		mouseDown(contextViewService.container!.querySelector('.action-label')!);
		const afterClickInside = state().open;
		mouseDown(outside);
		const afterClickOutside = state();

		flyout.show(false);
		mainWindow.dispatchEvent(new FocusEvent('blur'));
		const afterWindowBlur = state().open;

		flyout.show(false);
		// Another context view (e.g. a context menu) replaces the flyout.
		contextViewService.hideContextView();
		const afterReplaced = state();

		flyout.show(false);
		flyout.dispose();
		const afterDispose = { open: !!contextViewService.openSubmenu, expanded: anchor.getAttribute('aria-expanded') };

		assert.deepStrictEqual({ anchorAttributes, opened, afterClickOnAnchor, afterClickInside, afterClickOutside, afterWindowBlur, afterReplaced, afterDispose }, {
			anchorAttributes: { popup: 'menu', expanded: 'false' },
			opened: { open: true, expanded: 'true', highlighted: true, shown: { items: ['Kusto'], focused: false } },
			afterClickOnAnchor: true,
			afterClickInside: true,
			afterClickOutside: { open: false, expanded: 'false', highlighted: false, shown: undefined },
			afterWindowBlur: false,
			afterReplaced: { open: false, expanded: 'false', highlighted: false, shown: undefined },
			afterDispose: { open: false, expanded: 'false' },
		});
	});

	test('moves focus into a hover-opened flyout from the keyboard and runs its items', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const { anchor, ran, state } = createFlyout(disposables);
		const key = (target: Element, keyCode: number, key: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));

		anchor.focus();
		anchor.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(300);
		const hoverOpened = { ...state(), anchorFocused: getActiveElement() === anchor };

		key(anchor, 13, 'Enter');
		const afterEnter = state().shown;

		key(getActiveElement()!, 13, 'Enter');
		await timeout(0);

		assert.deepStrictEqual({ hoverOpened, afterEnter, afterRun: { open: state().open, ran, anchorFocused: getActiveElement() === anchor } }, {
			hoverOpened: { open: true, expanded: 'true', highlighted: true, shown: { items: ['Kusto'], focused: false }, anchorFocused: true },
			afterEnter: { items: ['Kusto'], focused: true },
			afterRun: { open: false, ran: ['test.kusto'], anchorFocused: true },
		});
	}));
});
