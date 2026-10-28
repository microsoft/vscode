/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, EventType, getActiveElement, ModifierKeyEmitter } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Action, IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { timeout } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ContextMenuHandler } from '../../browser/contextMenuHandler.js';
import { IContextViewService } from '../../browser/contextView.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';

suite('ContextMenuHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [selection, expected] of [
		[undefined, undefined],
		[false, undefined],
		[true, 'First'],
		[0, 'First'],
		[2, 'Second'],
		[-1, undefined],
		[NaN, undefined],
		[Infinity, undefined],
		[-Infinity, undefined],
		[0.5, undefined],
		[3, undefined],
	] as const) {
		test(`normalizes HTML menu selection ${selection} to ${expected}`, () => {
			const container = mainWindow.document.body.appendChild($('div'));
			store.add(toDisposable(() => container.remove()));
			const contextViewService = upcastPartial<IContextViewService>({
				showContextView: delegate => {
					store.add(delegate.render(container));
					delegate.focus?.();
					return { close: () => delegate.onHide?.() };
				},
			});
			const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
			const actions = [store.add(new Action('first', 'First')), new Separator(), store.add(new Action('second', 'Second'))];
			handler.showContextMenu({
				getAnchor: () => container,
				getActions: () => actions,
				autoSelectItem: selection,
			});

			assert.strictEqual(getActiveElement()?.closest('.action-item')?.textContent, expected);
		});
	}

	suite('unhandled keys (#99121)', () => {
		const ctrlCmd = isMacintosh ? { metaKey: true } : { ctrlKey: true };

		interface IKey {
			readonly key: string;
			readonly keyCode: number;
			readonly modifiers?: KeyboardEventInit;
		}

		const keys = {
			f1: { key: 'F1', keyCode: 112 },
			f5: { key: 'F5', keyCode: 116 },
			f10: { key: 'F10', keyCode: 121 },
			f24: { key: 'F24', keyCode: 135 },
			shiftF10: { key: 'F10', keyCode: 121, modifiers: { shiftKey: true } },
			ctrlCmdF5: { key: 'F5', keyCode: 116, modifiers: ctrlCmd },
			a: { key: 'a', keyCode: 65 },
			ctrlCmdB: { key: 'b', keyCode: 66, modifiers: ctrlCmd },
			shift: { key: 'Shift', keyCode: 16, modifiers: { shiftKey: true } },
			alt: { key: 'Alt', keyCode: 18, modifiers: { altKey: true } },
			tab: { key: 'Tab', keyCode: 9 },
			shiftTab: { key: 'Tab', keyCode: 9, modifiers: { shiftKey: true } },
			arrowDown: { key: 'ArrowDown', keyCode: 40 },
			arrowRight: { key: 'ArrowRight', keyCode: 39 },
			arrowLeft: { key: 'ArrowLeft', keyCode: 37 },
			enter: { key: 'Enter', keyCode: 13 },
			escape: { key: 'Escape', keyCode: 27 },
		} satisfies Record<string, IKey>;

		teardown(() => ModifierKeyEmitter.getInstance().resetKeyStatus());

		function showMenu(actions: IAction[]) {
			const container = mainWindow.document.body.appendChild($('div'));
			store.add(toDisposable(() => container.remove()));
			const hides: boolean[] = [];
			const reachedWindow: string[] = [];
			store.add(addDisposableListener(mainWindow, EventType.KEY_DOWN, e => reachedWindow.push(e.key)));
			const contextViewService = upcastPartial<IContextViewService>({
				showContextView: delegate => {
					store.add(delegate.render(container));
					delegate.focus?.();
					return { close: () => delegate.onHide?.() };
				},
				hideContextView: (data?: unknown) => { hides.push(!!data); },
			});
			const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
			handler.showContextMenu({ getAnchor: () => container, getActions: () => actions, autoSelectItem: true });

			const press = (key: IKey, type: 'keydown' | 'keyup' | 'both' = 'both') => {
				const init = { key: key.key, keyCode: key.keyCode, bubbles: true, cancelable: true, ...key.modifiers };
				if (type !== 'keyup') {
					getActiveElement()?.dispatchEvent(new KeyboardEvent(EventType.KEY_DOWN, init));
				}
				if (type !== 'keydown') {
					getActiveElement()?.dispatchEvent(new KeyboardEvent(EventType.KEY_UP, init));
				}
			};
			const focusedLabel = () => getActiveElement()?.closest('.action-item')?.querySelector('.action-label')?.textContent;
			return { hides, reachedWindow, press, focusedLabel, container };
		}

		function createActions(runs: string[]): IAction[] {
			return [
				store.add(new Action('first', 'First', undefined, true, async () => { runs.push('first'); })),
				store.add(new Action('second', 'Second', undefined, true, async () => { runs.push('second'); })),
			];
		}

		for (const [name, key] of Object.entries({ F1: keys.f1, F5: keys.f5, F10: keys.f10, F24: keys.f24, 'Shift+F10': keys.shiftF10, 'CtrlCmd+F5': keys.ctrlCmdF5 })) {
			test(`${name} is absorbed and dismisses the menu`, () => {
				const runs: string[] = [];
				const menu = showMenu(createActions(runs));
				menu.press(key, 'keydown');
				assert.deepStrictEqual({ reachedWindow: menu.reachedWindow, hides: menu.hides, runs, focused: menu.focusedLabel() }, { reachedWindow: [], hides: [true], runs: [], focused: 'First' });
			});
		}

		for (const [name, key] of Object.entries({ letter: keys.a, chord: keys.ctrlCmdB, Tab: keys.tab, 'Shift+Tab': keys.shiftTab })) {
			test(`${name} is absorbed and keeps the menu open`, () => {
				const runs: string[] = [];
				const menu = showMenu(createActions(runs));
				menu.press(key);
				assert.deepStrictEqual({ reachedWindow: menu.reachedWindow, hides: menu.hides, runs, focused: menu.focusedLabel() }, { reachedWindow: [], hides: [], runs: [], focused: 'First' });
			});
		}

		for (const [name, key] of Object.entries({ Shift: keys.shift, Alt: keys.alt })) {
			test(`${name} alone still propagates`, () => {
				const runs: string[] = [];
				const menu = showMenu(createActions(runs));
				menu.press(key);
				assert.deepStrictEqual({ reachedWindow: menu.reachedWindow, hides: menu.hides, runs, focused: menu.focusedLabel() }, { reachedWindow: [key.key], hides: [], runs: [], focused: 'First' });
			});
		}

		test('ArrowDown moves focus without propagating', () => {
			const runs: string[] = [];
			const menu = showMenu(createActions(runs));
			menu.press(keys.arrowDown);
			assert.deepStrictEqual({ reachedWindow: menu.reachedWindow, hides: menu.hides, runs, focused: menu.focusedLabel() }, { reachedWindow: [], hides: [], runs: [], focused: 'Second' });
		});

		test('Enter runs the focused action exactly once', async () => {
			const runs: string[] = [];
			const menu = showMenu(createActions(runs));
			menu.press(keys.enter);
			await timeout(0);
			assert.deepStrictEqual({ reachedWindow: menu.reachedWindow, hides: menu.hides, runs }, { reachedWindow: [], hides: [false], runs: ['first'] });
		});

		test('Escape cancels the menu', () => {
			const runs: string[] = [];
			const menu = showMenu(createActions(runs));
			menu.press(keys.escape);
			assert.deepStrictEqual({ reachedWindow: menu.reachedWindow, hides: menu.hides, runs }, { reachedWindow: [], hides: [true], runs: [] });
		});

		test('F10 from a submenu is absorbed and dismisses the menu', () => {
			const runs: string[] = [];
			const menu = showMenu([new SubmenuAction('submenu', 'Submenu', createActions(runs))]);
			menu.press(keys.arrowRight);
			const focusedInSubmenu = menu.focusedLabel();
			menu.press(keys.f10, 'keydown');
			assert.deepStrictEqual({ focusedInSubmenu, reachedWindow: menu.reachedWindow, hides: menu.hides, runs }, { focusedInSubmenu: 'First', reachedWindow: [], hides: [true], runs: [] });
		});

		test('submenu navigation with ArrowRight, ArrowLeft and Escape is unchanged', () => {
			const runs: string[] = [];
			const menu = showMenu([new SubmenuAction('submenu', 'Submenu', createActions(runs))]);
			const focused: (string | null | undefined)[] = [];
			menu.press(keys.arrowRight);
			focused.push(menu.focusedLabel());
			menu.press(keys.arrowLeft);
			focused.push(menu.focusedLabel());
			menu.press(keys.arrowRight);
			focused.push(menu.focusedLabel());
			menu.press(keys.escape);
			focused.push(menu.focusedLabel());
			assert.deepStrictEqual({ focused, reachedWindow: menu.reachedWindow, hides: menu.hides, runs }, { focused: ['First', 'Submenu', 'First', 'Submenu'], reachedWindow: [], hides: [], runs: [] });
		});

		test('Alt switches to the alternative action, which runs exactly once', async () => {
			const runs: string[] = [];
			const alternative = toAction({ id: 'alternative', label: 'Alternative', run: () => { runs.push('alternative'); } });
			const primary = toAction({ id: 'primary', label: 'Primary', alt: alternative, run: () => { runs.push('primary'); } });
			const menu = showMenu([primary]);
			menu.press(keys.alt, 'keydown');
			const label = menu.focusedLabel();
			menu.press({ ...keys.enter, modifiers: { altKey: true } });
			mainWindow.dispatchEvent(new KeyboardEvent(EventType.KEY_UP, { key: 'Alt', keyCode: 18 }));
			await timeout(0);
			assert.deepStrictEqual({ label, reachedWindow: menu.reachedWindow, hides: menu.hides, runs }, { label: 'Alternative', reachedWindow: ['Alt'], hides: [false], runs: ['alternative'] });
		});
	});
});
