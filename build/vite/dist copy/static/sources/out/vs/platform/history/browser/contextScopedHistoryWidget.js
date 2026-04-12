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
import { FindInput } from '../../../base/browser/ui/findinput/findInput.js';
import { ReplaceInput } from '../../../base/browser/ui/findinput/replaceInput.js';
import { HistoryInputBox } from '../../../base/browser/ui/inputbox/inputBox.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../keybinding/common/keybindingsRegistry.js';
import { localize } from '../../../nls.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { isActiveElement } from '../../../base/browser/dom.js';
export const historyNavigationVisible = new RawContextKey('suggestWidgetVisible', false, localize('suggestWidgetVisible', "Whether suggestion are visible"));
const HistoryNavigationWidgetFocusContext = 'historyNavigationWidgetFocus';
const HistoryNavigationForwardsEnablementContext = 'historyNavigationForwardsEnabled';
const HistoryNavigationBackwardsEnablementContext = 'historyNavigationBackwardsEnabled';
let lastFocusedWidget = undefined;
const widgets = [];
export function registerAndCreateHistoryNavigationContext(scopedContextKeyService, widget) {
    if (widgets.includes(widget)) {
        throw new Error('Cannot register the same widget multiple times');
    }
    widgets.push(widget);
    const disposableStore = new DisposableStore();
    const historyNavigationWidgetFocus = new RawContextKey(HistoryNavigationWidgetFocusContext, false).bindTo(scopedContextKeyService);
    const historyNavigationForwardsEnablement = new RawContextKey(HistoryNavigationForwardsEnablementContext, true).bindTo(scopedContextKeyService);
    const historyNavigationBackwardsEnablement = new RawContextKey(HistoryNavigationBackwardsEnablementContext, true).bindTo(scopedContextKeyService);
    const onDidFocus = () => {
        historyNavigationWidgetFocus.set(true);
        lastFocusedWidget = widget;
    };
    const onDidBlur = () => {
        historyNavigationWidgetFocus.set(false);
        if (lastFocusedWidget === widget) {
            lastFocusedWidget = undefined;
        }
    };
    // Check for currently being focused
    if (isActiveElement(widget.element)) {
        onDidFocus();
    }
    disposableStore.add(widget.onDidFocus(() => onDidFocus()));
    disposableStore.add(widget.onDidBlur(() => onDidBlur()));
    disposableStore.add(toDisposable(() => {
        widgets.splice(widgets.indexOf(widget), 1);
        onDidBlur();
    }));
    return {
        historyNavigationForwardsEnablement,
        historyNavigationBackwardsEnablement,
        dispose() {
            disposableStore.dispose();
        }
    };
}
let ContextScopedHistoryInputBox = class ContextScopedHistoryInputBox extends HistoryInputBox {
    constructor(container, contextViewProvider, options, contextKeyService) {
        super(container, contextViewProvider, options);
        const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
        this._register(registerAndCreateHistoryNavigationContext(scopedContextKeyService, this));
    }
};
ContextScopedHistoryInputBox = __decorate([
    __param(3, IContextKeyService)
], ContextScopedHistoryInputBox);
export { ContextScopedHistoryInputBox };
let ContextScopedFindInput = class ContextScopedFindInput extends FindInput {
    constructor(container, contextViewProvider, options, contextKeyService) {
        super(container, contextViewProvider, options);
        const scopedContextKeyService = this._register(contextKeyService.createScoped(this.inputBox.element));
        this._register(registerAndCreateHistoryNavigationContext(scopedContextKeyService, this.inputBox));
    }
};
ContextScopedFindInput = __decorate([
    __param(3, IContextKeyService)
], ContextScopedFindInput);
export { ContextScopedFindInput };
let ContextScopedReplaceInput = class ContextScopedReplaceInput extends ReplaceInput {
    constructor(container, contextViewProvider, options, contextKeyService, showReplaceOptions = false) {
        super(container, contextViewProvider, showReplaceOptions, options);
        const scopedContextKeyService = this._register(contextKeyService.createScoped(this.inputBox.element));
        this._register(registerAndCreateHistoryNavigationContext(scopedContextKeyService, this.inputBox));
    }
};
ContextScopedReplaceInput = __decorate([
    __param(3, IContextKeyService)
], ContextScopedReplaceInput);
export { ContextScopedReplaceInput };
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'history.showPrevious',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(ContextKeyExpr.has(HistoryNavigationWidgetFocusContext), ContextKeyExpr.equals(HistoryNavigationBackwardsEnablementContext, true), ContextKeyExpr.not('isComposing'), historyNavigationVisible.isEqualTo(false)),
    primary: 16 /* KeyCode.UpArrow */,
    secondary: [512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */],
    handler: (accessor) => {
        lastFocusedWidget?.showPreviousValue();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'history.showNext',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(ContextKeyExpr.has(HistoryNavigationWidgetFocusContext), ContextKeyExpr.equals(HistoryNavigationForwardsEnablementContext, true), ContextKeyExpr.not('isComposing'), historyNavigationVisible.isEqualTo(false)),
    primary: 18 /* KeyCode.DownArrow */,
    secondary: [512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */],
    handler: (accessor) => {
        lastFocusedWidget?.showNextValue();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFFLFNBQVMsRUFBcUIsTUFBTSxpREFBaUQsQ0FBQztBQUMvRixPQUFPLEVBQXdCLFlBQVksRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxlQUFlLEVBQXdCLE1BQU0sK0NBQStDLENBQUM7QUFFdEcsT0FBTyxFQUFFLGNBQWMsRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN2SCxPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sZ0RBQWdELENBQUM7QUFDdkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRS9ELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLElBQUksYUFBYSxDQUFVLHNCQUFzQixFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDO0FBRXRLLE1BQU0sbUNBQW1DLEdBQUcsOEJBQThCLENBQUM7QUFDM0UsTUFBTSwwQ0FBMEMsR0FBRyxrQ0FBa0MsQ0FBQztBQUN0RixNQUFNLDJDQUEyQyxHQUFHLG1DQUFtQyxDQUFDO0FBT3hGLElBQUksaUJBQWlCLEdBQXlDLFNBQVMsQ0FBQztBQUN4RSxNQUFNLE9BQU8sR0FBK0IsRUFBRSxDQUFDO0FBRS9DLE1B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