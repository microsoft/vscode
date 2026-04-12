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
import '../../../../base/browser/ui/codicons/codiconStyles.js'; // The codicon symbol styles are defined here and must be loaded
import '../../../contrib/symbolIcons/browser/symbolIcons.js'; // The codicon symbol colors are defined here and must be loaded to get colors
import { AbstractGotoSymbolQuickAccessProvider } from '../../../contrib/quickAccess/browser/gotoSymbolQuickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { QuickOutlineNLS } from '../../../common/standaloneStrings.js';
import { Event } from '../../../../base/common/event.js';
import { EditorAction, registerEditorAction } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { IQuickInputService, ItemActivation } from '../../../../platform/quickinput/common/quickInput.js';
import { IOutlineModelService } from '../../../contrib/documentSymbols/browser/outlineModel.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
let StandaloneGotoSymbolQuickAccessProvider = class StandaloneGotoSymbolQuickAccessProvider extends AbstractGotoSymbolQuickAccessProvider {
    constructor(editorService, languageFeaturesService, outlineModelService) {
        super(languageFeaturesService, outlineModelService);
        this.editorService = editorService;
        this.onDidActiveTextEditorControlChange = Event.None;
    }
    get activeTextEditorControl() {
        return this.editorService.getFocusedCodeEditor() ?? undefined;
    }
};
StandaloneGotoSymbolQuickAccessProvider = __decorate([
    __param(0, ICodeEditorService),
    __param(1, ILanguageFeaturesService),
    __param(2, IOutlineModelService)
], StandaloneGotoSymbolQuickAccessProvider);
export { StandaloneGotoSymbolQuickAccessProvider };
export class GotoSymbolAction extends EditorAction {
    static { this.ID = 'editor.action.quickOutline'; }
    constructor() {
        super({
            id: GotoSymbolAction.ID,
            label: QuickOutlineNLS.quickOutlineActionLabel,
            alias: 'Go to Symbol...',
            precondition: EditorContextKeys.hasDocumentSymbolProvider,
            kbOpts: {
                kbExpr: EditorContextKeys.focus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 45 /* KeyCode.KeyO */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            contextMenuOpts: {
                group: 'navigation',
                order: 3
            }
        });
    }
    run(accessor) {
        accessor.get(IQuickInputService).quickAccess.show(AbstractGotoSymbolQuickAccessProvider.PREFIX, { itemActivation: ItemActivation.NONE });
    }
}
registerEditorAction(GotoSymbolAction);
Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
    ctor: StandaloneGotoSymbolQuickAccessProvider,
    prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
    helpEntries: [
        { description: QuickOutlineNLS.quickOutlineActionLabel, prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX, commandId: GotoSymbolAction.ID },
        { description: QuickOutlineNLS.quickOutlineByCategoryActionLabel, prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY }
    ]
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUdvdG9TeW1ib2xRdWlja0FjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvcXVpY2tBY2Nlc3Mvc3RhbmRhbG9uZUdvdG9TeW1ib2xRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHVEQUF1RCxDQUFDLENBQUMsZ0VBQWdFO0FBQ2hJLE9BQU8scURBQXFELENBQUMsQ0FBQyw4RUFBOEU7QUFDNUksT0FBTyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBd0IsVUFBVSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDekcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDMUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJekUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWpGLElBQU0sdUNBQXVDLEdBQTdDLE1BQU0sdUNBQXdDLFNBQVEscUNBQXFDO0lBSWpHLFlBQ3FCLGFBQWtELEVBQzVDLHVCQUFpRCxFQUNyRCxtQkFBeUM7UUFFL0QsS0FBSyxDQUFDLHVCQUF1QixFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFKZixrQkFBYSxHQUFiLGFBQWEsQ0FBb0I7UUFIcEQsdUNBQWtDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztJQVFuRSxDQUFDO0lBRUQsSUFBYyx1QkFBdUI7UUFDcEMsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLG9CQUFvQixFQUFFLElBQUksU0FBUyxDQUFDO0lBQy9ELENBQUM7Q0FDRCxDQUFBO0FBZlksdUNBQXVDO0lBS2pELFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLG9CQUFvQixDQUFBO0dBUFYsdUNBQXVDLENBZW5EOztBQUVELE1BQU0sT0FBTyxnQkFBaUIsU0FBUSxZQUFZO2FBRWpDLE9BQUUsR0FBRyw0QkFBNEIsQ0FBQztJQUVsRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFO1lBQ3ZCLEtBQUssRUFBRSxlQUFlLENBQUMsdUJBQXVCO1lBQzlDLEtBQUssRUFBRSxpQkFBaUI7WUFDeEIsWUFBWSxFQUFFLGlCQUFpQixDQUFDLHlCQUF5QjtZQUN6RCxNQUFNLEVBQUU7Z0JBQ1AsTUFBTSxFQUFFLGlCQUFpQixDQUFDLEtBQUs7Z0JBQy9CLE9BQU8sRUFBRSxtREFBNkIsd0JBQWU7Z0JBQ3JELE1BQU0sMENBQWdDO2FBQ3RDO1lBQ0QsZUFBZSxFQUFFO2dCQUNoQixLQUFLLEVBQUUsWUFBWTtnQkFDbkIsS0FBSyxFQUFFLENBQUM7YUFDUjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxHQUFHLENBQUMsUUFBMEI7UUFDN0IsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMscUNBQXFDLENBQUMsTUFBTSxFQUFFLEVBQUUsY0FBYyxFQUFFLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzFJLENBQUM7O0FBR0Ysb0JBQW9CLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUV2QyxRQUFRLENBQUMsRUFBRSxDQUF1QixVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsMkJBQTJCLENBQUM7SUFDckYsSUFBSSxFQUFFLHVDQUF1QztJQUM3QyxNQUFNLEVBQUUscUNBQXFDLENBQUMsTUFBTTtJQUNwRCxXQUFXLEVBQUU7UUFDWixFQUFFLFdBQVcsRUFBRSxlQUFlLENBQUMsdUJBQXVCLEVBQUUsTUFBTSxFQUFFLHFDQUFxQyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxFQUFFO1FBQzlJLEVBQUUsV0FBVyxFQUFFLGVBQWUsQ0FBQyxpQ0FBaUMsRUFBRSxNQUFNLEVBQUUscUNBQXFDLENBQUMsa0JBQWtCLEVBQUU7S0FDcEk7Q0FDRCxDQUFDLENBQUMifQ==