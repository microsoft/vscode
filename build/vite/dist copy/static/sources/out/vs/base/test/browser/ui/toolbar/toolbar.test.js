/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { BaseActionViewItem } from '../../../../browser/ui/actionbar/actionViewItems.js';
import { ToggleMenuAction, ToolBar } from '../../../../browser/ui/toolbar/toolbar.js';
import { Action } from '../../../../common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
class FixedWidthActionViewItem extends BaseActionViewItem {
    constructor(action, width) {
        super(undefined, action);
        this.width = width;
    }
    render(container) {
        super.render(container);
        container.style.width = `${this.width}px`;
        container.style.boxSizing = 'border-box';
        container.style.overflow = 'hidden';
        container.style.whiteSpace = 'nowrap';
        container.textContent = this.action.label;
    }
}
class TestToolBar extends ToolBar {
    get actionBarForTest() {
        return this.actionBar;
    }
}
const contextMenuProvider = {
    showContextMenu: () => { }
};
suite('ToolBar', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let container;
    setup(() => {
        container = document.createElement('div');
        container.style.width = '273px';
        document.body.appendChild(container);
    });
    teardown(() => {
        container.remove();
    });
    test('keeps the last primary action shrinkable when overflow is inserted', () => {
        const widths = new Map([
            ['workbench.action.chat.attachContext', 22],
            ['workbench.action.chat.openModePicker', 75],
            ['workbench.action.chat.openModelPicker', 271],
            ['workbench.action.chat.configureTools', 22],
            [ToggleMenuAction.ID, 22],
        ]);
        const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
            responsiveBehavior: {
                enabled: true,
                kind: 'last',
                minItems: 1,
                actionMinWidth: 22,
            },
            actionViewItemProvider: action => {
                const width = widths.get(action.id);
                return typeof width === 'number' ? new FixedWidthActionViewItem(action, width) : undefined;
            }
        }));
        const actionBar = toolbar.actionBarForTest;
        const originalGetWidth = actionBar.getWidth.bind(actionBar);
        actionBar.getWidth = (index) => {
            const action = actionBar.getAction(index);
            return action ? (widths.get(action.id) ?? originalGetWidth(index)) : originalGetWidth(index);
        };
        const originalGetBoundingClientRect = toolbar.getElement().getBoundingClientRect.bind(toolbar.getElement());
        toolbar.getElement().getBoundingClientRect = () => ({
            ...originalGetBoundingClientRect(),
            width: 273,
            right: 273,
            left: 0,
            x: 0,
            y: 0,
            top: 0,
            bottom: 0,
            height: 0,
            toJSON() {
                return {};
            }
        });
        const actions = [
            store.add(new Action('workbench.action.chat.attachContext', 'Add Context...')),
            store.add(new Action('workbench.action.chat.openModePicker', 'Open Agent Picker')),
            store.add(new Action('workbench.action.chat.openModelPicker', 'Open Model Picker')),
            store.add(new Action('workbench.action.chat.configureTools', 'Configure Tools...')),
        ];
        toolbar.setActions(actions);
        assert.strictEqual(toolbar.getItemsLength(), 4);
        assert.strictEqual(toolbar.getItemAction(0)?.id, 'workbench.action.chat.attachContext');
        assert.strictEqual(toolbar.getItemAction(1)?.id, 'workbench.action.chat.openModePicker');
        assert.strictEqual(toolbar.getItemAction(2)?.id, 'workbench.action.chat.openModelPicker');
        assert.strictEqual(toolbar.getItemAction(3)?.id, ToggleMenuAction.ID);
        assert.strictEqual(toolbar.getElement().querySelector('.monaco-action-bar')?.classList.contains('has-overflow'), true);
    });
    test('applies per-action responsive min widths', () => {
        const toolbar = store.add(new ToolBar(container, contextMenuProvider, {
            responsiveBehavior: {
                enabled: true,
                kind: 'last',
                minItems: 1,
                actionMinWidth: 22,
                getActionMinWidth: action => action.id === 'workbench.action.chat.openModelPicker' ? 28 : undefined,
            },
            actionViewItemProvider: action => new FixedWidthActionViewItem(action, 22)
        }));
        const actions = [
            store.add(new Action('workbench.action.chat.attachContext', 'Add Context...')),
            store.add(new Action('workbench.action.chat.openModePicker', 'Open Agent Picker')),
            store.add(new Action('workbench.action.chat.openModelPicker', 'Open Model Picker')),
        ];
        toolbar.setActions(actions);
        assert.strictEqual(toolbar.getElement().style.getPropertyValue('--vscode-toolbar-action-min-width'), '28px');
    });
    test('relayout re-evaluates responsive overflow after action width changes', () => {
        const widths = new Map([
            ['workbench.action.chat.attachContext', 22],
            ['workbench.action.chat.openModePicker', 22],
            ['workbench.action.chat.openModelPicker', 50],
            [ToggleMenuAction.ID, 22],
        ]);
        const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
            responsiveBehavior: {
                enabled: true,
                kind: 'last',
                minItems: 1,
                actionMinWidth: 22,
            },
            actionViewItemProvider: action => {
                const width = widths.get(action.id);
                return typeof width === 'number' ? new FixedWidthActionViewItem(action, width) : undefined;
            }
        }));
        const actionBar = toolbar.actionBarForTest;
        const originalGetWidth = actionBar.getWidth.bind(actionBar);
        actionBar.getWidth = (index) => {
            const action = actionBar.getAction(index);
            return action ? (widths.get(action.id) ?? originalGetWidth(index)) : originalGetWidth(index);
        };
        const originalGetBoundingClientRect = toolbar.getElement().getBoundingClientRect.bind(toolbar.getElement());
        toolbar.getElement().getBoundingClientRect = () => ({
            ...originalGetBoundingClientRect(),
            width: 110,
            right: 110,
            left: 0,
            x: 0,
            y: 0,
            top: 0,
            bottom: 0,
            height: 0,
            toJSON() {
                return {};
            }
        });
        const actions = [
            store.add(new Action('workbench.action.chat.attachContext', 'Add Context...')),
            store.add(new Action('workbench.action.chat.openModePicker', 'Open Mode Picker')),
            store.add(new Action('workbench.action.chat.openModelPicker', 'Open Model Picker')),
        ];
        toolbar.setActions(actions);
        assert.strictEqual(toolbar.getItemsLength(), 3);
        assert.strictEqual(toolbar.getItemAction(2)?.id, 'workbench.action.chat.openModelPicker');
        assert.strictEqual(toolbar.getElement().querySelector('.monaco-action-bar')?.classList.contains('has-overflow'), false);
        widths.set('workbench.action.chat.openModePicker', 80);
        toolbar.relayout();
        assert.strictEqual(toolbar.getItemsLength(), 3);
        assert.strictEqual(toolbar.getItemAction(0)?.id, 'workbench.action.chat.attachContext');
        assert.strictEqual(toolbar.getItemAction(1)?.id, 'workbench.action.chat.openModePicker');
        assert.strictEqual(toolbar.getItemAction(2)?.id, ToggleMenuAction.ID);
        assert.strictEqual(toolbar.getElement().querySelector('.monaco-action-bar')?.classList.contains('has-overflow'), true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbGJhci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2Jyb3dzZXIvdWkvdG9vbGJhci90b29sYmFyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRzVCLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0RixPQUFPLEVBQUUsTUFBTSxFQUFXLE1BQU0sK0JBQStCLENBQUM7QUFDaEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFbkYsTUFBTSx3QkFBeUIsU0FBUSxrQkFBa0I7SUFFeEQsWUFBWSxNQUFlLEVBQW1CLEtBQWE7UUFDMUQsS0FBSyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQURvQixVQUFLLEdBQUwsS0FBSyxDQUFRO0lBRTNELENBQUM7SUFFUSxNQUFNLENBQUMsU0FBc0I7UUFDckMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4QixTQUFTLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQztRQUMxQyxTQUFTLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxZQUFZLENBQUM7UUFDekMsU0FBUyxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3BDLFNBQVMsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLFFBQVEsQ0FBQztRQUN0QyxTQUFTLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO0lBQzNDLENBQUM7Q0FDRDtBQUVELE1BQU0sV0FBWSxT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