/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { setTimeout0 } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { QuickInput } from '../quickInput.js';
import { getParentNodeState } from './quickInputTree.js';
// Contains the API
export class QuickTree extends QuickInput {
    static { this.DEFAULT_ARIA_LABEL = localize('quickInputBox.ariaLabel', "Type to narrow down results."); }
    constructor(ui) {
        super(ui);
        this.type = "quickTree" /* QuickInputType.QuickTree */;
        this._value = observableValue('value', '');
        this._ariaLabel = observableValue('ariaLabel', undefined);
        this._placeholder = observableValue('placeholder', undefined);
        this._matchOnDescription = observableValue('matchOnDescription', false);
        this._matchOnLabel = observableValue('matchOnLabel', true);
        this._sortByLabel = observableValue('sortByLabel', true);
        this._activeItems = observableValue('activeItems', []);
        this._itemTree = observableValue('itemTree', []);
        this.onDidChangeValue = Event.fromObservable(this._value, this._store);
        this.onDidChangeActive = Event.fromObservable(this._activeItems, this._store);
        this._onDidChangeCheckedLeafItems = this._register(new Emitter());
        this.onDidChangeCheckedLeafItems = this._onDidChangeCheckedLeafItems.event;
        this._onDidChangeCheckboxState = this._register(new Emitter());
        this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
        this._onDidAcceptEmitter = this._register(new Emitter());
        this.onDidAccept = Event.any(ui.onDidAccept, this._onDidAcceptEmitter.event);
        this._registerAutoruns();
        this._register(ui.tree.onDidChangeCheckedLeafItems(e => this._onDidChangeCheckedLeafItems.fire(e)));
        this._register(ui.tree.onDidChangeCheckboxState(e => this._onDidChangeCheckboxState.fire(e.item)));
        // Sync active items with tree focus changes
        this._register(ui.tree.tree.onDidChangeFocus(e => {
            this._activeItems.set(ui.tree.getActiveItems(), undefined);
        }));
    }
    get value() { return this._value.get(); }
    set value(value) { this._value.set(value, undefined); }
    get ariaLabel() { return this._ariaLabel.get(); }
    set ariaLabel(ariaLabel) { this._ariaLabel.set(ariaLabel, undefined); }
    get placeholder() { return this._placeholder.get(); }
    set placeholder(placeholder) { this._placeholder.set(placeholder, undefined); }
    get matchOnDescription() { return this._matchOnDescription.get(); }
    set matchOnDescription(matchOnDescription) { this._matchOnDescription.set(matchOnDescription, undefined); }
    get matchOnLabel() { return this._matchOnLabel.get(); }
    set matchOnLabel(matchOnLabel) { this._matchOnLabel.set(matchOnLabel, undefined); }
    get sortByLabel() { return this._sortByLabel.get(); }
    set sortByLabel(sortByLabel) { this._sortByLabel.set(sortByLabel, undefined); }
    get activeItems() { return this._activeItems.get(); }
    set activeItems(activeItems) { this._activeItems.set(activeItems, undefined); }
    get itemTree() { return this._itemTree.get(); }
    get onDidTriggerItemButton() {
        // Is there a cleaner way to avoid the `as` cast here?
        return this.ui.tree.onDidTriggerButton;
    }
    // TODO: Fix the any casting
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    get checkedLeafItems() { return this.ui.tree.getCheckedLeafItems(); }
    setItemTree(itemTree) {
        this._itemTree.set(itemTree, undefined);
    }
    getParent(element) {
        return this.ui.tree.tree.getParentElement(element) ?? undefined;
    }
    expand(element) {
        this.ui.tree.tree.expand(element);
    }
    collapse(element) {
        this.ui.tree.tree.collapse(element);
    }
    isCollapsed(element) {
        return this.ui.tree.tree.isCollapsed(element);
    }
    focusOnInput() {
        this.ui.inputBox.setFocus();
    }
    reveal(element) {
        this.ui.tree.tree.reveal(element);
        this.ui.tree.tree.setFocus([element]);
    }
    show() {
        if (!this.visible) {
            const visibilities = {
                title: !!this.title || !!this.step || !!this.titleButtons.length,
                description: !!this.description,
                checkAll: true,
                checkBox: true,
                inputBox: true,
                progressBar: true,
                visibleCount: true,
                count: true,
                ok: true,
                list: false,
                tree: true,
                message: !!this.validationMessage,
                customButton: false
            };
            this.ui.setVisibilities(visibilities);
            this.visibleDisposables.add(this.ui.inputBox.onDidChange(value => {
                this._value.set(value, undefined);
            }));
            this.visibleDisposables.add(this.ui.tree.onDidChangeCheckboxState((e) => {
                const checkAllState = getParentNodeState([...this.ui.tree.tree.getNode().children]);
                if (this.ui.checkAll.checked !== checkAllState) {
                    this.ui.checkAll.checked = checkAllState;
                }
            }));
            this.visibleDisposables.add(this.ui.checkAll.onChange(_e => {
                const checked = this.ui.checkAll.checked;
                this.ui.tree.checkAll(checked);
            }));
            this.visibleDisposables.add(this.ui.tree.onDidChangeCheckedLeafItems(e => {
                this.ui.count.setCount(e.length);
            }));
        }
        super.show(); // TODO: Why have show() bubble up while update() trickles down?
        // Initial state
        // TODO@TylerLeonhardt: Without this setTimeout, the screen reader will not read out
        // the final count of checked items correctly. Investigate a better way
        // to do this. ref https://github.com/microsoft/vscode/issues/258617
        setTimeout0(() => this.ui.count.setCount(this.ui.tree.getCheckedLeafItems().length));
        const checkAllState = getParentNodeState([...this.ui.tree.tree.getNode().children]);
        if (this.ui.checkAll.checked !== checkAllState) {
            this.ui.checkAll.checked = checkAllState;
        }
    }
    update() {
        if (!this.visible) {
            return;
        }
        const visibilities = {
            title: !!this.title || !!this.step || !!this.titleButtons.length,
            description: !!this.description,
            checkAll: true,
            checkBox: true,
            inputBox: true,
            progressBar: true,
            visibleCount: true,
            count: true,
            ok: true,
            tree: true,
            message: !!this.validationMessage
        };
        this.ui.setVisibilities(visibilities);
        super.update();
    }
    _registerListeners() {
    }
    // TODO: Move to using autoruns instead of update function
    _registerAutoruns() {
        this.registerVisibleAutorun(reader => {
            const value = this._value.read(reader);
            this.ui.inputBox.value = value;
            this.ui.tree.filter(value);
        });
        this.registerVisibleAutorun(reader => {
            let ariaLabel = this._ariaLabel.read(reader);
            if (!ariaLabel) {
                ariaLabel = this.placeholder || QuickTree.DEFAULT_ARIA_LABEL;
                // If we have a title, include it in the aria label.
                if (this.title) {
                    ariaLabel += ` - ${this.title}`;
                }
            }
            if (this.ui.list.ariaLabel !== ariaLabel) {
                this.ui.list.ariaLabel = ariaLabel ?? null;
            }
            if (this.ui.inputBox.ariaLabel !== ariaLabel) {
                this.ui.inputBox.ariaLabel = ariaLabel ?? 'input';
            }
        });
        this.registerVisibleAutorun(reader => {
            const placeholder = this._placeholder.read(reader);
            if (this.ui.inputBox.placeholder !== placeholder) {
                this.ui.inputBox.placeholder = placeholder ?? '';
            }
        });
        this.registerVisibleAutorun((reader) => {
            const matchOnLabel = this._matchOnLabel.read(reader);
            const matchOnDescription = this._matchOnDescription.read(reader);
            this.ui.tree.updateFilterOptions({ matchOnLabel, matchOnDescription });
        });
        this.registerVisibleAutorun((reader) => {
            const sortByLabel = this._sortByLabel.read(reader);
            this.ui.tree.sortByLabel = sortByLabel;
        });
        this.registerVisibleAutorun((reader) => {
            const itemTree = this._itemTree.read(reader);
            this.ui.tree.setTreeData(itemTree);
        });
    }
    registerVisibleAutorun(fn) {
        this._register(autorun((reader) => {
            if (this._visible.read(reader)) {
                fn(reader);
            }
        }));
    }
    focus(focus) {
        this.ui.tree.focus(focus);
        // To allow things like space to check/uncheck items
        this.ui.tree.tree.domFocus();
    }
    /**
     * Programmatically accepts an item. Used internally for keyboard navigation.
     * @param inBackground Whether you are accepting an item in the background and keeping the picker open.
     */
    accept(_inBackground) {
        this._onDidAcceptEmitter.fire();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tUcmVlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3RyZWUvcXVpY2tUcmVlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBVyxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxVQUFVLEVBQThCLE1BQU0sa0JBQWtCLENBQUM7QUFDMUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFekQsbUJBQW1CO0FBRW5CLE1BQU0sT0FBTyxTQUFvQyxTQUFRLFVBQVU7YUFDMUMsdUJBQWtCLEdBQUcsUUFBUSxDQUFDLHlCQUF5QixFQUFFLDhCQUE4QixDQUFDLEFBQXRFLENBQXVFO0lBeUJqSCxZQUFZLEVBQWdCO1FBQzNCLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztRQXhCRixTQUFJLDhDQUE0QjtRQUV4QixXQUFNLEdBQUcsZUFBZSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0QyxlQUFVLEdBQUcsZUFBZSxDQUFxQixXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDekUsaUJBQVksR0FBRyxlQUFlLENBQXFCLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM3RSx3QkFBbUIsR0FBRyxlQUFlLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkUsa0JBQWEsR0FBRyxlQUFlLENBQUMsY0FBYyxFQUFFLElBQUks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