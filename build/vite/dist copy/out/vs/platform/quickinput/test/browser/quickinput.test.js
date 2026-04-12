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
import { ItemActivation, isKeyModified, NO_KEY_MODS } from '../../common/quickInput.js';
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
async function setupWaitTilShownListener(controller) {
    const result = await raceTimeout(new Promise(resolve => {
        const event = controller.onShow(_ => {
            event.dispose();
            resolve(true);
        });
    }), 2000);
    if (!result) {
        throw new Error('Cancelled');
    }
}
suite('QuickInput', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let controller;
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
        instantiationService.stub(ILayoutService, { _serviceBrand: undefined, activeContainer: fixture, onDidLayoutContainer: Event.None });
        instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
        instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
        instantiationService.stub(IKeybindingService, {
            mightProducePrintableCharacter() { return false; },
            softDispatch() { return NoMatchingKb; },
        });
        controller = store.add(instantiationService.createInstance(QuickInputController, {
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
        }));
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
        let value = undefined;
        store.add(quickpick.onDidChangeValue((e) => value = e));
        // Trigger a change
        quickpick.value = 'changed';
        try {
            assert.strictEqual(value, quickpick.value);
        }
        finally {
            quickpick.dispose();
        }
    });
    test('keepScrollPosition - works with activeItems', async () => {
        const quickpick = store.add(controller.createQuickPick());
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
        const quickpick = store.add(controller.createQuickPick());
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
        void (await new Promise(resolve => {
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
        const activeItemsFromEvent = [];
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
        const activeItemsFromEvent = [];
        store.add(quickpick.onDidChangeActive(items => activeItemsFromEvent.push(...items)));
        // Trigger a change
        quickpick.itemActivation = ItemActivation.NONE;
        quickpick.items = [item];
        assert.strictEqual(activeItemsFromEvent.length, 0);
        assert.strictEqual(quickpick.activeItems.length, 0);
    });
    test('isKeyModified - returns false when no modifiers are pressed', () => {
        assert.strictEqual(isKeyModified(NO_KEY_MODS), false);
        assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: false, shift: false }), false);
    });
    test('isKeyModified - returns true when any modifier is pressed', () => {
        assert.strictEqual(isKeyModified({ ctrlCmd: true, alt: false, shift: false }), true);
        assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: true, shift: false }), true);
        assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: false, shift: true }), true);
        assert.strictEqual(isKeyModified({ ctrlCmd: true, alt: true, shift: true }), true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tpbnB1dC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcXVpY2tpbnB1dC90ZXN0L2Jyb3dzZXIvcXVpY2tpbnB1dC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNwRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ2hILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFaEUsT0FBTyxFQUFrQixjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFB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R0FBRyxFQUFFO1FBQ3RFLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BGLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==