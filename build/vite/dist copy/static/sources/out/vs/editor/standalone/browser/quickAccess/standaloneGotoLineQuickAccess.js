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
import { AbstractGotoLineQuickAccessProvider } from '../../../contrib/quickAccess/browser/gotoLineQuickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { GoToLineNLS } from '../../../common/standaloneStrings.js';
import { Event } from '../../../../base/common/event.js';
import { EditorAction, registerEditorAction } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
let StandaloneGotoLineQuickAccessProvider = class StandaloneGotoLineQuickAccessProvider extends AbstractGotoLineQuickAccessProvider {
    constructor(editorService, storageService) {
        super();
        this.editorService = editorService;
        this.storageService = storageService;
        this.onDidActiveTextEditorControlChange = Event.None;
    }
    get activeTextEditorControl() {
        return this.editorService.getFocusedCodeEditor() ?? undefined;
    }
};
StandaloneGotoLineQuickAccessProvider = __decorate([
    __param(0, ICodeEditorService),
    __param(1, IStorageService)
], StandaloneGotoLineQuickAccessProvider);
export { StandaloneGotoLineQuickAccessProvider };
export class GotoLineAction extends EditorAction {
    static { this.ID = 'editor.action.gotoLine'; }
    constructor() {
        super({
            id: GotoLineAction.ID,
            label: GoToLineNLS.gotoLineActionLabel,
            alias: 'Go to Line/Column...',
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.focus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */,
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 37 /* KeyCode.KeyG */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor) {
        accessor.get(IQuickInputService).quickAccess.show(StandaloneGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX);
    }
}
registerEditorAction(GotoLineAction);
Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
    ctor: StandaloneGotoLineQuickAccessProvider,
    prefix: StandaloneGotoLineQuickAccessProvider.GO_TO_LINE_PREFIX,
    helpEntries: [{ description: GoToLineNLS.gotoLineActionLabel, commandId: GotoLineAction.ID }]
});
class GotoOffsetAction extends EditorAction {
    static { this.ID = 'editor.action.gotoOffset'; }
    constructor() {
        super({
            id: GotoOffsetAction.ID,
            label: GoToLineNLS.gotoOffsetActionLabel,
            alias: 'Go to Offset...',
            precondition: undefined,
        });
    }
    run(accessor) {
        accessor.get(IQuickInputService).quickAccess.show(StandaloneGotoLineQuickAccessProvider.GO_TO_OFFSET_PREFIX);
    }
}
registerEditorAction(GotoOffsetAction);
Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
    ctor: StandaloneGotoLineQuickAccessProvider,
    prefix: StandaloneGotoLineQuickAccessProvider.GO_TO_OFFSET_PREFIX,
    helpEntries: [{ description: GoToLineNLS.gotoOffsetActionLabel, commandId: GotoOffsetAction.ID }]
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUdvdG9MaW5lUXVpY2tBY2Nlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3Ivc3RhbmRhbG9uZS9icm93c2VyL3F1aWNrQWNjZXNzL3N0YW5kYWxvbmVHb3RvTGluZVF1aWNrQWNjZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQXdCLFVBQVUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBb0IsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUd6RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFMUUsSUFBTSxxQ0FBcUMsR0FBM0MsTUFBTSxxQ0FBc0MsU0FBUSxtQ0FBbUM7SUFJN0YsWUFDcUIsYUFBa0QsRUFDckQsY0FBMkQ7UUFFNUUsS0FBSyxFQUFFLENBQUM7UUFINkIsa0JBQWEsR0FBYixhQUFhLENBQW9CO1FBQ3pCLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUoxRCx1Q0FBa0MsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBT25FLENBQUM7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