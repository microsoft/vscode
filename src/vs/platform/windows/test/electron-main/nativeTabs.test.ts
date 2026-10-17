/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type electron from 'electron';
import { Emitter } from '../../../../base/common/event.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getNativeTabState, restoreNativeTabGroups, waitForNativeTabWindow } from '../../electron-main/nativeTabs.js';

interface ITestWindow extends electron.BrowserWindow {
	getTabbedWindows(): ITestWindow[];
	getSelectedTab(): ITestWindow | null;
	selectTab(): void;
	tabbingMode: 'automatic' | 'preferred' | 'disallowed';
}

suite('Native Tab Session', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createWindows(ids: number[], destroyed = new Set<number>()): ITestWindow[] {
		const groups = new Map<number, { tabs: ITestWindow[]; selected: ITestWindow }>();
		return ids.map(id => {
			const window = upcastPartial<ITestWindow>({
				id,
				tabbingMode: 'disallowed',
				isDestroyed: () => destroyed.has(id),
				getTabbedWindows: () => groups.get(id)!.tabs,
				getSelectedTab: () => groups.get(id)!.selected,
				selectTab: () => { groups.get(id)!.selected = window; },
				addTabbedWindow: other => {
					const group = groups.get(id)!;
					const otherGroup = groups.get(other.id)!;
					const otherTab = otherGroup.tabs.find(tab => tab.id === other.id)!;
					otherGroup.tabs.splice(otherGroup.tabs.indexOf(otherTab), 1);
					group.tabs.splice(group.tabs.indexOf(window) + 1, 0, otherTab);
					groups.set(other.id, group);
				}
			});
			groups.set(id, { tabs: [window], selected: window });
			return window;
		});
	}

	for (const event of ['ready', 'close', 'destroy'] as const) {
		test(`completes startup waiting when a window signals ${event}`, async () => {
			const ready = disposables.add(new Emitter<void>());
			const close = disposables.add(new Emitter<void>());
			const destroy = disposables.add(new Emitter<void>());
			const window = upcastPartial<ICodeWindow>({
				win: createWindows([1])[0],
				isReady: false,
				onDidSignalReady: ready.event,
				onDidClose: close.event,
				onDidDestroy: destroy.event
			});
			const pending = waitForNativeTabWindow(window);
			({ ready, close, destroy })[event].fire();
			await pending;
		});
	}

	test('bounds startup waiting when a renderer never becomes ready', async () => {
		const ready = disposables.add(new Emitter<void>());
		const close = disposables.add(new Emitter<void>());
		const destroy = disposables.add(new Emitter<void>());
		await waitForNativeTabWindow(upcastPartial<ICodeWindow>({
			win: createWindows([1])[0],
			isReady: false,
			onDidSignalReady: ready.event,
			onDidClose: close.event,
			onDidDestroy: destroy.event
		}), 0);
	});

	test('does not wait for ready or destroyed windows', async () => {
		await Promise.all([
			waitForNativeTabWindow(upcastPartial<ICodeWindow>({ win: createWindows([1])[0], isReady: true })),
			waitForNativeTabWindow(upcastPartial<ICodeWindow>({ win: createWindows([2], new Set([2]))[0], isReady: false }))
		]);
	});

	test('restores independent groups and three tabs in saved order', () => {
		const windows = createWindows([1, 2, 3, 4, 5]);
		const selected = restoreNativeTabGroups(windows.map(window => ({ window, state: {
			group: window.id <= 3 ? 7 : 9,
			index: window.id <= 3 ? 3 - window.id : window.id - 4,
			selected: window.id === 2 || window.id === 5
		} })));
		assert.deepStrictEqual(selected.map(window => ({
			tabs: getNativeTabState(window),
			order: (window as ITestWindow).getTabbedWindows().map(tab => tab.id)
		})), [
			{ tabs: { group: 3, index: 1, selected: true }, order: [3, 2, 1] },
			{ tabs: { group: 4, index: 1, selected: true }, order: [4, 5] }
		]);
	});

	test('falls back to the first surviving tab when the selected project is missing', () => {
		const windows = createWindows([1, 2]);
		const selected = restoreNativeTabGroups(windows.map(window => ({ window, state: { group: 7, index: 2 - window.id, selected: false } })));
		assert.deepStrictEqual(selected.map(window => window.id), [2]);
	});

	test('does not join destroyed windows or windows without saved membership', () => {
		const windows = createWindows([1, 2, 3], new Set([2]));
		const selected = restoreNativeTabGroups([
			{ window: windows[0], state: { group: 7, index: 0, selected: true } },
			{ window: windows[1], state: { group: 7, index: 1, selected: false } },
			{ window: windows[2] }
		]);
		assert.deepStrictEqual({
			selected: selected.map(window => window.id),
			groups: [windows[0], windows[2]].map(window => window.getTabbedWindows().map(tab => tab.id)),
			modes: windows.map(window => window.tabbingMode)
		}, { selected: [1], groups: [[1], [3]], modes: ['automatic', 'disallowed', 'automatic'] });
	});
});
