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
import { localize, localize2 } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { RawContextKey, IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory } from '../browserViewActions.js';
const CONTEXT_BROWSER_DEVTOOLS_OPEN = new RawContextKey('browserDevToolsOpen', false, localize('browser.devToolsOpen', "Whether developer tools are open for the current browser view"));
let BrowserEditorDevToolsContribution = class BrowserEditorDevToolsContribution extends BrowserEditorContribution {
    constructor(editor, contextKeyService) {
        super(editor);
        this._devToolsOpenContext = CONTEXT_BROWSER_DEVTOOLS_OPEN.bindTo(contextKeyService);
    }
    subscribeToModel(model, store) {
        this._devToolsOpenContext.set(model.isDevToolsOpen);
        store.add(model.onDidChangeDevToolsState(e => {
            this._devToolsOpenContext.set(e.isDevToolsOpen);
        }));
    }
    clear() {
        this._devToolsOpenContext.reset();
    }
};
BrowserEditorDevToolsContribution = __decorate([
    __param(1, IContextKeyService)
], BrowserEditorDevToolsContribution);
BrowserEditor.registerContribution(BrowserEditorDevToolsContribution);
class ToggleDevToolsAction extends Action2 {
    static { this.ID = BrowserViewCommandId.ToggleDevTools; }
    constructor() {
        super({
            id: ToggleDevToolsAction.ID,
            title: localize2('browser.toggleDevToolsAction', 'Toggle Developer Tools'),
            category: BrowserActionCategory,
            icon: Codicon.terminal,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
            toggled: ContextKeyExpr.equals(CONTEXT_BROWSER_DEVTOOLS_OPEN.key, true),
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: 'actions',
                order: 3,
            },
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 70 /* KeyCode.F12 */
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.toggleDevTools();
        }
    }
}
registerAction2(ToggleDevToolsAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckRldlRvb2xzRmVhdHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvZmVhdHVyZXMvYnJvd3NlckRldlRvb2xzRmVhdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRTVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsYUFBYSxFQUFlLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pJLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBR3JHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUVyRixPQUFPLEVBQUUsYUFBYSxFQUFFLHlCQUF5QixFQUFFLHlCQUF5QixFQUFFLHVCQUF1QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDbkksT0FBTyxFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFeEYsTUFBTSw2QkFBNkIsR0FBRyxJQUFJLGFBQWEsQ0FBVSxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLCtEQUErRCxDQUFDLENBQUMsQ0FBQztBQUVsTSxJQUFNLGlDQUFpQyxHQUF2QyxNQUFNLGlDQUFrQyxTQUFRLHlCQUF5QjtJQUd4RSxZQUNDLE1BQXFCLEVBQ0QsaUJBQXFDO1FBRXpELEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNkLElBQUksQ0FBQyxvQkFBb0IsR0FBRyw2QkFBNkIsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNyRixDQUFDO0lBRWtCLGdCQUFnQixDQUFDLEtBQXdCLEVBQUUsS0FBc0I7UUFDbkYsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDcEQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDNUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFUSxLQUFLO1FBQ2IsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ25DLENBQUM7Q0FDRCxDQUFBO0FBckJLLGlDQUFpQztJQUtwQyxXQUFBLGtCQUFrQixDQUFBO0dBTGYsaUNBQWlDLENBcUJ0QztBQUVELGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBRXRFLE1BQU0sb0JBQXFCLFNBQVEsT0FBTzthQUN6QixPQUFFLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDO0lBRXpEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLG9CQUFvQixDQUFDLEVBQUU7WUFDM0IsS0FBSyxFQUFFLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSx3QkFBd0IsQ0FBQztZQUMxRSxRQUFRLEVBQUUscUJBQXFCO1lBQy9CLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUTtZQUN0QixFQUFFLEVBQUUsSUFBSTtZQUNSLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLHVCQUF1QixFQUFFLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3BILE9BQU8sRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLDZCQUE2QixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUM7WUFDdkUsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO2dCQUNoQyxLQUFLLEVBQUUsU0FBUztnQkFDaEIsS0FBSyxFQUFFLENBQUM7YUFDUjtZQUNELFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsT0FBTyxzQkFBYTthQUNwQjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsZ0JBQWdCO1FBQ2xHLElBQUksYUFBYSxZQUFZLGFBQWEsRUFBRSxDQUFDO1lBQzVDLE1BQU0sYUFBYSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3RDLENBQUM7SUFDRixDQUFDOztBQUdGLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDIn0=