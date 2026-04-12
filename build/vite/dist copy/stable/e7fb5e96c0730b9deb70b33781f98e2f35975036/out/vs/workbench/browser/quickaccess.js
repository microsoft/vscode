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
import { Disposable } from '../../base/common/lifecycle.js';
import { getIEditor } from '../../editor/browser/editorBrowser.js';
import { localize } from '../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { IQuickInputService } from '../../platform/quickinput/common/quickInput.js';
import { IEditorGroupsService } from '../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../services/editor/common/editorService.js';
export const inQuickPickContextKeyValue = 'inQuickOpen';
export const InQuickPickContextKey = new RawContextKey(inQuickPickContextKeyValue, false, localize('inQuickOpen', "Whether keyboard focus is inside the quick open control"));
export const inQuickPickContext = ContextKeyExpr.has(inQuickPickContextKeyValue);
export const defaultQuickAccessContextKeyValue = 'inFilesPicker';
export const defaultQuickAccessContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(defaultQuickAccessContextKeyValue));
export function getQuickNavigateHandler(id, next) {
    return accessor => {
        const keybindingService = accessor.get(IKeybindingService);
        const quickInputService = accessor.get(IQuickInputService);
        const keys = keybindingService.lookupKeybindings(id);
        const quickNavigate = { keybindings: keys };
        quickInputService.navigate(!!next, quickNavigate);
    };
}
let PickerEditorState = class PickerEditorState extends Disposable {
    constructor(editorService, editorGroupsService) {
        super();
        this.editorService = editorService;
        this.editorGroupsService = editorGroupsService;
        this.editorViewState = undefined;
        this.openedTransientEditors = new Set(); // editors that were opened between set and restore
    }
    set() {
        if (this.editorViewState) {
            return; // return early if already done
        }
        const activeEditorPane = this.editorService.activeEditorPane;
        if (activeEditorPane) {
            this.editorViewState = {
                group: activeEditorPane.group,
                editor: activeEditorPane.input,
                state: getIEditor(activeEditorPane.getControl())?.saveViewState() ?? undefined,
            };
        }
    }
    /**
     * Open a transient editor such that it may be closed when the state is restored.
     * Note that, when the state is restored, if the editor is no longer transient, it will not be closed.
     */
    async openTransientEditor(editor, group) {
        editor.options = { ...editor.options, transient: true };
        const editorPane = await this.editorService.openEditor(editor, group);
        if (editorPane?.input && editorPane.input !== this.editorViewState?.editor && editorPane.group.isTransient(editorPane.input)) {
            this.openedTransientEditors.add(editorPane.input);
        }
        return editorPane;
    }
    async restore() {
        if (this.editorViewState) {
            for (const editor of this.openedTransientEditors) {
                if (editor.isDirty()) {
                    continue;
                }
                for (const group of this.editorGroupsService.groups) {
                    if (group.isTransient(editor)) {
                        await group.closeEditor(editor, { preserveFocus: true });
                    }
                }
            }
            await this.editorViewState.group.openEditor(this.editorViewState.editor, {
                viewState: this.editorViewState.state,
                preserveFocus: true // important to not close the picker as a result
            });
            this.reset();
        }
    }
    reset() {
        this.editorViewState = undefined;
        this.openedTransientEditors.clear();
    }
    dispose() {
        super.dispose();
        this.reset();
    }
};
PickerEditorState = __decorate([
    __param(0, IEditorService),
    __param(1, IEditorGroupsService)
], PickerEditorState);
export { PickerEditorState };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2thY2Nlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9xdWlja2FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFFeEMsT0FBTyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUUvRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUdwRixPQUFPLEVBQWdCLG9CQUFvQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdEcsT0FBTyxFQUFrQixjQUFjLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUU1RixNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxhQUFhLENBQUM7QUFDeEQsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxhQUFhLENBQVUsMEJBQTBCLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxhQUFhLEVBQUUseURBQXlELENBQUMsQ0FBQyxDQUFDO0FBQ3ZMLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUVqRixNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyxlQUFlLENBQUM7QUFDakUsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFD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