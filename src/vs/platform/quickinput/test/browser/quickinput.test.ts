/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { unthemedInboxStyles } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { unthemedListStyles } from '../../../../base/browser/ui/list/listWidget.js';
import { unthemedToggleStyles } from '../../../../base/browser/ui/toggle/toggle.js';
import { Event } from '../../../../base/common/event.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { unthemedCountStyles } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { unthemedKeybindingLabelOptions } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { unthemedProgressBarOptions } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { QuickInputController } from '../../browser/quickInputController.js';
import { TestThemeService } from '../../../theme/test/common/testThemeService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { QuickPick } from '../../browser/quickInput.js';
import { IQuickPickItem, ItemActivation } from '../../common/quickInput.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IContextViewService } from '../../../contextview/browser/contextView.js';
import { IListService, ListService } from '../../../list/browser/listService.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../contextkey/browser/contextKeyService.js';
import { NoMatchingKb } from '../../../keybinding/common/keybindingResolver.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';

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
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let controller: QuickInputController;

	setup(() => {
		const fixture = document.createElement('div');
		mainWindow.document.body.appendChild(fixture);
		store.add(toDisposable(() => fixture.remove()));

		const instantiationService = new TestInstantiationService();

		// Stub the services the quick input controller needs to function
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(IListService, store.add(new ListService()));
		// eslint-disable-next-line local/code-no-any-casts
		instantiationService.stub(ILayoutService, { activeContainer: fixture, onDidLayoutContainer: Event.None } as any);
		instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IKeybindingService, {
			mightProducePrintableCharacter() { return false; },
			softDispatch() { return NoMatchingKb; },
		});

		controller = store.add(instantiationService.createInstance(
			QuickInputController,
			{
				container: fixture,
				idPrefix: 'testQuickInput',
				ignoreFocusOut() { return true; },
				returnFocus() { },
				backKeybindingLabel() { return undefined; },
				setContextKey() { return undefined; },
				linkOpenerDelegate(content) { },
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
					}
				}
			}
		));

		// initial layout
		controller.layout({ height: 20, width: 40 }, 0);
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
		const quickpick = store.add(controller.createQuickPick());

		let value: string | undefined = undefined;
		store.add(quickpick.onDidChangeValue((e) => value = e));

		// Trigger a change
		quickpick.value = 'changed';

		try {
			assert.strictEqual(value, quickpick.value);
		} finally {
			quickpick.dispose();
		}
	});

	test('keepScrollPosition - works with activeItems', async () => {
		const quickpick = store.add(controller.createQuickPick() as QuickPick<IQuickPickItem>);

		const items = [];
		for (let i = 0; i < 1000; i++) {
			items.push({ label: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item should cause the quick pick to scroll to the bottom
		quickpick.activeItems = [items[items.length - 1]];
		quickpick.show();

		const cursorTop = quickpick.scrollTop;

		assert.notStrictEqual(cursorTop, 0);

		quickpick.keepScrollPosition = true;
		quickpick.activeItems = [items[0]];
		assert.strictEqual(cursorTop, quickpick.scrollTop);

		quickpick.keepScrollPosition = false;
		quickpick.activeItems = [items[0]];
		assert.strictEqual(quickpick.scrollTop, 0);
	});

	test('keepScrollPosition - works with items', async () => {
		const quickpick = store.add(controller.createQuickPick() as QuickPick<IQuickPickItem>);

		const items = [];
		for (let i = 0; i < 1000; i++) {
			items.push({ label: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item should cause the quick pick to scroll to the bottom
		quickpick.activeItems = [items[items.length - 1]];
		quickpick.show();

		const cursorTop = quickpick.scrollTop;
		assert.notStrictEqual(cursorTop, 0);

		quickpick.keepScrollPosition = true;
		quickpick.items = items;
		assert.strictEqual(cursorTop, quickpick.scrollTop);

		quickpick.keepScrollPosition = false;
		quickpick.items = items;
		assert.strictEqual(quickpick.scrollTop, 0);
	});

	test('selectedItems - verify previous selectedItems does not hang over to next set of items', async () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = [{ label: 'step 1' }];
		quickpick.show();

		void (await new Promise<void>(resolve => {
			store.add(quickpick.onDidAccept(() => {
				quickpick.canSelectMany = true;
				quickpick.items = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];
				resolve();
			}));

			// accept 'step 1'
			controller.accept();
		}));

		// accept in multi-select
		controller.accept();

		// Since we don't select any items, the selected items should be empty
		assert.strictEqual(quickpick.selectedItems.length, 0);
	});

	test('activeItems - verify onDidChangeActive is triggered after setting items', async () => {
		const quickpick = store.add(controller.createQuickPick());

		// Setup listener for verification
		const activeItemsFromEvent: IQuickPickItem[] = [];
		store.add(quickpick.onDidChangeActive(items => activeItemsFromEvent.push(...items)));

		quickpick.show();

		const item = { label: 'step 1' };
		quickpick.items = [item];

		assert.strictEqual(activeItemsFromEvent.length, 1);
		assert.strictEqual(activeItemsFromEvent[0], item);
		assert.strictEqual(quickpick.activeItems.length, 1);
		assert.strictEqual(quickpick.activeItems[0], item);
	});

	test('activeItems - verify setting itemActivation to None still triggers onDidChangeActive after selection #207832', async () => {
		const quickpick = store.add(controller.createQuickPick());
		const item = { label: 'step 1' };
		quickpick.items = [item];
		quickpick.show();
		assert.strictEqual(quickpick.activeItems[0], item);

		// Setup listener for verification
		const activeItemsFromEvent: IQuickPickItem[] = [];
		store.add(quickpick.onDidChangeActive(items => activeItemsFromEvent.push(...items)));

		// Trigger a change
		quickpick.itemActivation = ItemActivation.NONE;
		quickpick.items = [item];

		assert.strictEqual(activeItemsFromEvent.length, 0);
		assert.strictEqual(quickpick.activeItems.length, 0);
	});
});
