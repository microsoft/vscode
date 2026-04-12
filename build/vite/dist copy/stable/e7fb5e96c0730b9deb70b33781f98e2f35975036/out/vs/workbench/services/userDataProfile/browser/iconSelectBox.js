/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WorkbenchIconSelectBox_1;
import { IconSelectBox } from '../../../../base/browser/ui/icons/iconSelectBox.js';
import * as dom from '../../../../base/browser/dom.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
export const WorkbenchIconSelectBoxFocusContextKey = new RawContextKey('iconSelectBoxFocus', true);
export const WorkbenchIconSelectBoxInputFocusContextKey = new RawContextKey('iconSelectBoxInputFocus', true);
export const WorkbenchIconSelectBoxInputEmptyContextKey = new RawContextKey('iconSelectBoxInputEmpty', true);
let WorkbenchIconSelectBox = class WorkbenchIconSelectBox extends IconSelectBox {
    static { WorkbenchIconSelectBox_1 = this; }
    static getFocusedWidget() {
        return WorkbenchIconSelectBox_1.focusedWidget;
    }
    constructor(options, contextKeyService) {
        super(options);
        this.contextKeyService = this._register(contextKeyService.createScoped(this.domNode));
        WorkbenchIconSelectBoxFocusContextKey.bindTo(this.contextKeyService);
        this.inputFocusContextKey = WorkbenchIconSelectBoxInputFocusContextKey.bindTo(this.contextKeyService);
        this.inputEmptyContextKey = WorkbenchIconSelectBoxInputEmptyContextKey.bindTo(this.contextKeyService);
        if (this.inputBox) {
            const focusTracker = this._register(dom.trackFocus(this.inputBox.inputElement));
            this._register(focusTracker.onDidFocus(() => this.inputFocusContextKey.set(true)));
            this._register(focusTracker.onDidBlur(() => this.inputFocusContextKey.set(false)));
            this._register(this.inputBox.onDidChange(() => this.inputEmptyContextKey.set(this.inputBox?.value.length === 0)));
        }
    }
    focus() {
        super.focus();
        WorkbenchIconSelectBox_1.focusedWidget = this;
    }
};
WorkbenchIconSelectBox = WorkbenchIconSelectBox_1 = __decorate([
    __param(1, IContextKeyService)
], WorkbenchIconSelectBox);
export { WorkbenchIconSelectBox };
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'iconSelectBox.focusUp',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchIconSelectBoxFocusContextKey,
    primary: 16 /* KeyCode.UpArrow */,
    handler: () => {
        const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
        if (selectBox) {
            selectBox.focusPreviousRow();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'iconSelectBox.focusDown',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchIconSelectBoxFocusContextKey,
    primary: 18 /* KeyCode.DownArrow */,
    handler: () => {
        const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
        if (selectBox) {
            selectBox.focusNextRow();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'iconSelectBox.focusNext',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(WorkbenchIconSelectBoxFocusContextKey, ContextKeyExpr.or(WorkbenchIconSelectBoxInputEmptyContextKey, WorkbenchIconSelectBoxInputFocusContextKey.toNegated())),
    primary: 17 /* KeyCode.RightArrow */,
    handler: () => {
        const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
        if (selectBox) {
            selectBox.focusNext();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'iconSelectBox.focusPrevious',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(WorkbenchIconSelectBoxFocusContextKey, ContextKeyExpr.or(WorkbenchIconSelectBoxInputEmptyContextKey, WorkbenchIconSelectBoxInputFocusContextKey.toNegated())),
    primary: 15 /* KeyCode.LeftArrow */,
    handler: () => {
        const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
        if (selectBox) {
            selectBox.focusPrevious();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'iconSelectBox.selectFocused',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: WorkbenchIconSelectBoxFocusContextKey,
    primary: 3 /* KeyCode.Enter */,
    handler: () => {
        const selectBox = WorkbenchIconSelectBox.getFocusedWidget();
        if (selectBox) {
            selectBox.setSelection(selectBox.getFocus()[0]);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWNvblNlbGVjdEJveC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci9pY29uU2VsZWN0Qm94LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQXlCLGFBQWEsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRTFHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLGNBQWMsRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0SSxPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFFdEgsTUFBTSxDQUFDLE1BQU0scUNBQXFDLEdBQUcsSUFBSSxhQUFhLENBQVUsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDNUcsTUFBTSxDQUFDLE1BQU0sMENBQTBDLEdBQUcsSUFBSSxhQUFhLENBQVUseUJBQXlCLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdEgsTUFBTSxDQUFDLE1BQU0sMENBQTBDLEdBQUcsSUFBSSxhQUFhLENBQVUseUJBQXlCLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFFL0csSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSxhQUFhOztJQUd4RCxNQUFNLENBQUMsZ0JBQWdCO1FBQ3RCLE9BQU8sd0JBQXNCLENBQUMsYUFBYSxDQUFDO0lBQzdDLENBQUM7SUFNRCxZQUNDLE9BQThCLEVBQ1YsaUJBQXFDO1FBRXpELEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNmLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENB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