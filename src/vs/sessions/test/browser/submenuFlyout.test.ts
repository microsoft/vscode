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
import { AnchorAlignment, layout2d } from '../../../base/common/layout.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SubmenuFlyout } from '../../browser/parts/submenuFlyout.js';
import { TestContextViewService } from './testContextViewService.js';

suite('Sessions - Submenu flyout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFlyout(disposables: Pick<DisposableStore, 'add'>, anchorAlignment?: AnchorAlignment, openOnHover?: boolean, actionsContext?: unknown) {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		disposables.add(toDisposable(() => root.remove()));
		const anchor = append(root, $('a.anchor'));
		anchor.tabIndex = 0;
		const outside = append(root, $('input.outside'));

		const ran: string[] = [];
		const contexts: unknown[] = [];
		const actions = [toAction({ id: 'test.kusto', label: 'Kusto', run: (context?: unknown) => { ran.push('test.kusto'); contexts.push(context); } })];
		const actionRunner = disposables.add(new ActionRunner());
		const contextViewService = new TestContextViewService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IContextViewService, contextViewService);
		const flyout = disposables.add(instantiationService.createInstance(SubmenuFlyout, {
			anchor,
			getActions: () => actions,
			getActionRunner: () => actionRunner,
			getActionsContext: () => actionsContext,
			lookupKeybinding: () => undefined,
			openKeys: [KeyCode.Enter],
			closeKeys: [KeyCode.LeftArrow],
			anchorAlignment,
			openOnHover,
		}));
		const state = () => ({ open: flyout.isOpen, expanded: anchor.getAttribute('aria-expanded'), highlighted: anchor.classList.contains('submenu-open'), shown: contextViewService.openSubmenu });
		return { anchor, outside, flyout, contextViewService, ran, contexts, state };
	}

	test('opens on its preferred side when there is room on both sides, and flips only when there is not', () => {
		const disposables = store.add(new DisposableStore());
		const viewport = { top: 0, left: 0, width: 1000, height: 600 };
		const view = { width: 200, height: 100 };
		const placement = (anchorAlignment: AnchorAlignment | undefined, anchorLeft: number) => {
			const { flyout, contextViewService } = createFlyout(disposables, anchorAlignment);
			flyout.show(false);
			const delegate = contextViewService.delegate!;
			const anchor = { top: 100, left: anchorLeft, width: 28, height: 28 };
			const { left } = layout2d(viewport, view, anchor, { anchorAlignment: delegate.anchorAlignment, anchorAxisAlignment: delegate.anchorAxisAlignment });
			flyout.dispose();
			return left + view.width <= anchor.left ? 'left' : left >= anchor.left + anchor.width ? 'right' : 'overlap';
		};

		assert.deepStrictEqual({
			defaultWithRoomOnBothSides: placement(undefined, 400),
			preferLeftWithRoomOnBothSides: placement(AnchorAlignment.RIGHT, 400),
			preferLeftAtLeftEdge: placement(AnchorAlignment.RIGHT, 20),
			defaultAtRightEdge: placement(undefined, 960),
		}, {
			defaultWithRoomOnBothSides: 'right',
			preferLeftWithRoomOnBothSides: 'left',
			preferLeftAtLeftEdge: 'right',
			defaultAtRightEdge: 'left',
		});
	});

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

	test('runs its items with the context of its entry, so they act on the window the entry belongs to', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const { anchor, contexts, flyout } = createFlyout(disposables, undefined, undefined, { chatWindowId: 7 });

		anchor.focus();
		flyout.show(true);
		getActiveElement()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		await timeout(0);

		assert.deepStrictEqual(contexts, [{ chatWindowId: 7 }]);
	}));

	test('opens on hover and closes as the pointer leaves by default, and only when asked otherwise, staying open as a dropdown', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const hover = async (anchor: HTMLElement, type: 'mouseenter' | 'mouseleave') => {
			anchor.dispatchEvent(new MouseEvent(type));
			await timeout(400);
		};
		const byDefault = createFlyout(disposables);
		await hover(byDefault.anchor, 'mouseenter');
		const defaultHovered = byDefault.state().open;
		await hover(byDefault.anchor, 'mouseleave');
		const defaultLeft = byDefault.state().open;
		byDefault.flyout.dispose();

		const dropdown = createFlyout(disposables, undefined, false);
		await hover(dropdown.anchor, 'mouseenter');
		const dropdownHovered = dropdown.state().open;
		dropdown.flyout.show(true);
		await hover(dropdown.anchor, 'mouseleave');
		const dropdownLeft = { ...dropdown.state(), shown: undefined };
		dropdown.flyout.hide();

		assert.deepStrictEqual({ defaultHovered, defaultLeft, dropdownHovered, dropdownLeft, dropdownHidden: dropdown.state().open, popup: dropdown.anchor.getAttribute('aria-haspopup'), expandedAfterHide: dropdown.anchor.getAttribute('aria-expanded') }, {
			defaultHovered: true,
			defaultLeft: false,
			dropdownHovered: false,
			dropdownLeft: { open: true, expanded: 'true', highlighted: true, shown: undefined },
			dropdownHidden: false,
			popup: 'menu',
			expandedAfterHide: 'false',
		});
	}));
});
