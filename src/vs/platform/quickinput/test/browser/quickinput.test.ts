/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { unthemedInboxStyles } from 'vs/base/browser/ui/inputbox/inputBox';
import { unthemedButtonStyles } from 'vs/base/browser/ui/button/button';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListOptions, List, unthemedListStyles } from 'vs/base/browser/ui/list/listWidget';
import { unthemedToggleStyles } from 'vs/base/browser/ui/toggle/toggle';
import { raceTimeout } from 'vs/base/common/async';
import { unthemedCountStyles } from 'vs/base/browser/ui/countBadge/countBadge';
import { unthemedKeybindingLabelOptions } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { unthemedProgressBarOptions } from 'vs/base/browser/ui/progressbar/progressbar';
import { QuickInputController } from 'vs/platform/quickinput/browser/quickInput';
import { IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ColorScheme } from 'vs/platform/theme/common/theme';

// Sets up an `onShow` listener to allow us to wait until the quick pick is shown (useful when triggering an `accept()` right after launching a quick pick)
// kick this off before you launch the picker and then await the promise returned after you launch the picker.
async function setupWaitTilShownListener(controller: QuickInputController): Promise<void> {
	const result = await raceTimeout(new Promise<boolean>(resolve => {
		const event = controller.onShow(_ => {
			event.dispose();
			resolve(true);
		});
	}), 2000);

	if (!result) {
		throw new Error('Cancelled');
	}
}

suite('QuickInput', () => { // https://github.com/microsoft/vscode/issues/147543
	let fixture: HTMLElement, controller: QuickInputController, quickpick: IQuickPick<IQuickPickItem>;

	function getScrollTop(): number {
		return quickpick.scrollTop;
	}

	setup(() => {
		fixture = document.createElement('div');
		document.body.appendChild(fixture);

		controller = new QuickInputController({
			container: fixture,
			idPrefix: 'testQuickInput',
			ignoreFocusOut() { return true; },
			returnFocus() { },
			backKeybindingLabel() { return undefined; },
			setContextKey() { return undefined; },
			linkOpenerDelegate(content) { },
			createList: <T>(
				user: string,
				container: HTMLElement,
				delegate: IListVirtualDelegate<T>,
				renderers: IListRenderer<T, any>[],
				options: IListOptions<T>,
			) => new List<T>(user, container, delegate, renderers, options),
			hoverDelegate: {
				showHover(options, focus) {
					return undefined;
				},
				delay: 200
			},
			styles: {
				button: unthemedButtonStyles,
				countBadge: unthemedCountStyles,
				inputBox: unthemedInboxStyles,
				toggle: unthemedToggleStyles,
				keybindingLabel: unthemedKeybindingLabelOptions,
				list: unthemedListStyles,
				progressBar: unthemedProgressBarOptions,
				widget: {
					quickInputBackground: undefined,
					quickInputForeground: undefined,
					quickInputTitleBackground: undefined,
					widgetBorder: undefined,
					widgetShadow: undefined,
				},
				pickerGroup: {
					pickerGroupBorder: undefined,
					pickerGroupForeground: undefined,
				},
				colorScheme: ColorScheme.DARK
			}
		});

		// initial layout
		controller.layout({ height: 20, width: 40 }, 0);
	});

	teardown(() => {
		quickpick?.dispose();
		controller.dispose();
		document.body.removeChild(fixture);
	});

	test('pick - basecase', async () => {
		const item = { label: 'foo' };

		const wait = setupWaitTilShownListener(controller);
		const pickPromise = controller.pick([item, { label: 'bar' }]);
		await wait;

		controller.accept();
		const pick = await raceTimeout(pickPromise, 2000);

		assert.strictEqual(pick, item);
	});

	test('pick - activeItem is honored', async () => {
		const item = { label: 'foo' };

		const wait = setupWaitTilShownListener(controller);
		const pickPromise = controller.pick([{ label: 'bar' }, item], { activeItem: item });
		await wait;

		controller.accept();
		const pick = await pickPromise;

		assert.strictEqual(pick, item);
	});

	test('input - basecase', async () => {
		const wait = setupWaitTilShownListener(controller);
		const inputPromise = controller.input({ value: 'foo' });
		await wait;

		controller.accept();
		const value = await raceTimeout(inputPromise, 2000);

		assert.strictEqual(value, 'foo');
	});

	test('onDidChangeValue - gets triggered when .value is set', async () => {
		quickpick = controller.createQuickPick();

		let value: string | undefined = undefined;
		quickpick.onDidChangeValue((e) => value = e);

		// Trigger a change
		quickpick.value = 'changed';

		try {
			assert.strictEqual(value, quickpick.value);
		} finally {
			quickpick.dispose();
		}
	});

	test('keepScrollPosition - works with activeItems', async () => {
		quickpick = controller.createQuickPick();

		const items = [];
		for (let i = 0; i < 1000; i++) {
			items.push({ label: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item should cause the quick pick to scroll to the bottom
		quickpick.activeItems = [items[items.length - 1]];
		quickpick.show();

		const cursorTop = getScrollTop();

		assert.notStrictEqual(cursorTop, 0);

		quickpick.keepScrollPosition = true;
		quickpick.activeItems = [items[0]];
		assert.strictEqual(cursorTop, getScrollTop());

		quickpick.keepScrollPosition = false;
		quickpick.activeItems = [items[0]];
		assert.strictEqual(getScrollTop(), 0);
	});

	test('keepScrollPosition - works with items', async () => {
		quickpick = controller.createQuickPick();

		const items = [];
		for (let i = 0; i < 1000; i++) {
			items.push({ label: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item should cause the quick pick to scroll to the bottom
		quickpick.activeItems = [items[items.length - 1]];
		quickpick.show();

		const cursorTop = getScrollTop();
		assert.notStrictEqual(cursorTop, 0);

		quickpick.keepScrollPosition = true;
		quickpick.items = items;
		assert.strictEqual(cursorTop, getScrollTop());

		quickpick.keepScrollPosition = false;
		quickpick.items = items;
		assert.strictEqual(getScrollTop(), 0);
	});

	test('selectedItems - verify previous selectedItems does not hang over to next set of items', async () => {
		quickpick = controller.createQuickPick();
		quickpick.items = [{ label: 'step 1' }];
		quickpick.show();

		void (await new Promise<void>(resolve => {
			quickpick.onDidAccept(() => {
				quickpick.canSelectMany = true;
				quickpick.items = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];
				resolve();
			});

			// accept 'step 1'
			controller.accept();
		}));

		// accept in multi-select
		controller.accept();

		// Since we don't select any items, the selected items should be empty
		assert.strictEqual(quickpick.selectedItems.length, 0);
	});
});
