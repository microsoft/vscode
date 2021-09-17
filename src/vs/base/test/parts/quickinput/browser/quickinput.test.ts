/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { QuickInputController } from 'vs/base/parts/quickinput/browser/quickInput';
import { IQuickPick, IQuickPickItem } from 'vs/base/parts/quickinput/common/quickInput';
import { IWorkbenchListOptions } from 'vs/platform/list/browser/listService';

// Simple promisify of setTimeout
function wait(delayMS: number) {
	return new Promise(function (resolve) {
		setTimeout(resolve, delayMS);
	});
}

suite('QuickInput', () => {
	let fixture: HTMLElement, controller: QuickInputController, quickpick: IQuickPick<IQuickPickItem>;

	function getScrollTop(): number {
		return (quickpick as any).scrollTop;
	}

	setup(() => {
		fixture = document.createElement('div');
		document.body.appendChild(fixture);

		controller = new QuickInputController({
			container: fixture,
			idPrefix: 'testQuickInput',
			ignoreFocusOut() { return false; },
			isScreenReaderOptimized() { return false; },
			returnFocus() { },
			backKeybindingLabel() { return undefined; },
			setContextKey() { return undefined; },
			createList: <T>(
				user: string,
				container: HTMLElement,
				delegate: IListVirtualDelegate<T>,
				renderers: IListRenderer<T, any>[],
				options: IWorkbenchListOptions<T>,
			) => new List<T>(user, container, delegate, renderers, options),
			styles: {
				button: {},
				countBadge: {},
				inputBox: {},
				keybindingLabel: {},
				list: {},
				progressBar: {},
				widget: {}
			}
		});

		// initial layout
		controller.layout({ height: 20, width: 40 }, 0);
	});

	teardown(() => {
		quickpick.dispose();
		controller.dispose();
		document.body.removeChild(fixture);
	});

	test('onDidChangeValue gets triggered when .value is set', async () => {
		quickpick = controller.createQuickPick();

		let value: string | undefined = undefined;
		quickpick.onDidChangeValue((e) => value = e);

		// Trigger a change
		quickpick.value = 'changed';

		try {
			// wait a bit to let the event play out.
			await wait(200);
			assert.strictEqual(value, quickpick.value);
		} finally {
			quickpick.dispose();
		}
	});

	test('keepScrollPosition works with activeItems', async () => {
		quickpick = controller.createQuickPick();

		const items = [];
		for (let i = 0; i < 1000; i++) {
			items.push({ label: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item should cause the quick pick to scroll to the bottom
		quickpick.activeItems = [items[items.length - 1]];
		quickpick.show();

		let cursorTop = getScrollTop();

		assert.notStrictEqual(cursorTop, 0);

		quickpick.keepScrollPosition = true;
		quickpick.activeItems = [items[0]];
		assert.strictEqual(cursorTop, getScrollTop());

		quickpick.keepScrollPosition = false;
		quickpick.activeItems = [items[0]];
		assert.strictEqual(getScrollTop(), 0);
	});

	test('keepScrollPosition works with items', async () => {
		quickpick = controller.createQuickPick();

		const items = [];
		for (let i = 0; i < 1000; i++) {
			items.push({ label: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item should cause the quick pick to scroll to the bottom
		quickpick.activeItems = [items[items.length - 1]];
		quickpick.show();

		let cursorTop = getScrollTop();
		assert.notStrictEqual(cursorTop, 0);

		quickpick.keepScrollPosition = true;
		quickpick.items = items;
		assert.strictEqual(cursorTop, getScrollTop());

		quickpick.keepScrollPosition = false;
		quickpick.items = items;
		assert.strictEqual(getScrollTop(), 0);
	});
});
