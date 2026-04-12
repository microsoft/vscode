/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../common/notebookContextKeys.js';
import { getNotebookEditorFromEditorPane } from '../notebookBrowser.js';
import { FoldingModel } from '../viewModel/foldingModel.js';
import { CellKind } from '../../common/notebookCommon.js';
import { registerNotebookContribution } from '../notebookEditorExtensions.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContextKey } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { NOTEBOOK_ACTIONS_CATEGORY } from './coreActions.js';
import { localize, localize2 } from '../../../../../nls.js';
export class FoldingController extends Disposable {
    static { this.id = 'workbench.notebook.foldingController'; }
    constructor(_notebookEditor) {
        super();
        this._notebookEditor = _notebookEditor;
        this._foldingModel = null;
        this._localStore = this._register(new DisposableStore());
        this._register(this._notebookEditor.onMouseUp(e => { this.onMouseUp(e); }));
        this._register(this._notebookEditor.onDidChangeModel(() => {
            this._localStore.clear();
            if (!this._notebookEditor.hasModel()) {
                return;
            }
            this._localStore.add(this._notebookEditor.onDidChangeCellState(e => {
                if (e.source.editStateChanged && e.cell.cellKind === CellKind.Markup) {
                    this._foldingModel?.recompute();
                }
            }));
            this._foldingModel = new FoldingModel();
            this._localStore.add(this._foldingModel);
            this._foldingModel.attachViewModel(this._notebookEditor.getViewModel());
            this._localStore.add(this._foldingModel.onDidFoldingRegionChanged(() => {
                this._updateEditorFoldingRanges();
            }));
        }));
    }
    saveViewState() {
        return this._foldingModel?.getMemento() || [];
    }
    restoreViewState(state) {
        this._foldingModel?.applyMemento(state || []);
        this._updateEditorFoldingRanges();
    }
    setFoldingStateDown(index, state, levels) {
        const doCollapse = state === 2 /* CellFoldingState.Collapsed */;
        const region = this._foldingModel.getRegionAtLine(index + 1);
        const regions = [];
        if (region) {
            if (region.isCollapsed !== doCollapse) {
                regions.push(region);
            }
            if (levels > 1) {
                const regionsInside = this._foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
                regions.push(...regionsInside);
            }
        }
        regions.forEach(r => this._foldingModel.setCollapsed(r.regionIndex, state === 2 /* CellFoldingState.Collapsed */));
        this._updateEditorFoldingRanges();
    }
    setFoldingStateUp(index, state, levels) {
        if (!this._foldingModel) {
            return;
        }
        const regions = this._foldingModel.getAllRegionsAtLine(index + 1, (region, level) => region.isCollapsed !== (state === 2 /* CellFoldingState.Collapsed */) && level <= levels);
        regions.forEach(r => this._foldingModel.setCollapsed(r.regionIndex, state === 2 /* CellFoldingState.Collapsed */));
        this._updateEditorFoldingRanges();
    }
    _updateEditorFoldingRanges() {
        if (!this._foldingModel) {
            return;
        }
        if (!this._notebookEditor.hasModel()) {
            return;
        }
        const vm = this._notebookEditor.getViewModel();
        vm.updateFoldingRanges(this._foldingModel.regions);
        const hiddenRanges = vm.getHiddenRanges();
        this._notebookEditor.setHiddenAreas(hiddenRanges);
    }
    onMouseUp(e) {
        if (!e.event.target) {
            return;
        }
        if (!this._notebookEditor.hasModel()) {
            return;
        }
        const viewModel = this._notebookEditor.getViewModel();
        const target = e.event.target;
        if (target.classList.contains('codicon-notebook-collapsed') || target.classList.contains('codicon-notebook-expanded')) {
            const parent = target.parentElement;
            if (!parent.classList.contains('notebook-folding-indicator')) {
                return;
            }
            // folding icon
            const cellViewModel = e.target;
            const modelIndex = viewModel.getCellIndex(cellViewModel);
            const state = viewModel.getFoldingState(modelIndex);
            if (state === 0 /* CellFoldingState.None */) {
                return;
            }
            this.setFoldingStateUp(modelIndex, state === 2 /* CellFoldingState.Collapsed */ ? 1 /* CellFoldingState.Expanded */ : 2 /* CellFoldingState.Collapsed */, 1);
            this._notebookEditor.focusElement(cellViewModel);
        }
        return;
    }
    recompute() {
        this._foldingModel?.recompute();
    }
}
registerNotebookContribution(FoldingController.id, FoldingController);
const NOTEBOOK_FOLD_COMMAND_LABEL = localize('fold.cell', "Fold Cell");
const NOTEBOOK_UNFOLD_COMMAND_LABEL = localize2('unfold.cell', "Unfold Cell");
const FOLDING_COMMAND_ARGS = {
    args: [{
            isOptional: true,
            name: 'index',
            description: 'The cell index',
            schema: {
                'type': 'object',
                'required': ['index', 'direction'],
                'properties': {
                    'index': {
                        'type': 'number'
                    },
                    'direction': {
                        'type': 'string',
                        'enum': ['up', 'down'],
                        'default': 'down'
                    },
                    'levels': {
                        'type': 'number',
                        'default': 1
                    },
                }
            }
        }]
};
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.fold',
            title: localize2('fold.cell', "Fold Cell"),
            category: NOTEBOOK_ACTIONS_CATEGORY,
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 92 /* KeyCode.BracketLeft */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 92 /* KeyCode.BracketLeft */,
                    secondary: [15 /* KeyCode.LeftArrow */],
                },
                secondary: [15 /* KeyCode.LeftArrow */],
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            metadata: {
                description: NOTEBOOK_FOLD_COMMAND_LABEL,
                args: FOLDING_COMMAND_ARGS.args
            },
            precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
            f1: true
        });
    }
    async run(accessor, args) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        if (!editor.hasModel()) {
            return;
        }
        const levels = args && args.levels || 1;
        const direction = args && args.direction === 'up' ? 'up' : 'down';
        let index = undefined;
        if (args) {
            index = args.index;
        }
        else {
            const activeCell = editor.getActiveCell();
            if (!activeCell) {
                return;
            }
            index = editor.getCellIndex(activeCell);
        }
        const controller = editor.getContribution(FoldingController.id);
        if (index !== undefined) {
            const targetCell = (index < 0 || index >= editor.getLength()) ? undefined : editor.cellAt(index);
            if (targetCell?.cellKind === CellKind.Code && direction === 'down') {
                return;
            }
            if (direction === 'up') {
                controller.setFoldingStateUp(index, 2 /* CellFoldingState.Collapsed */, levels);
            }
            else {
                controller.setFoldingStateDown(index, 2 /* CellFoldingState.Collapsed */, levels);
            }
            const viewIndex = editor.getViewModel().getNearestVisibleCellIndexUpwards(index);
            editor.focusElement(editor.cellAt(viewIndex));
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.unfold',
            title: NOTEBOOK_UNFOLD_COMMAND_LABEL,
            category: NOTEBOOK_ACTIONS_CATEGORY,
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 94 /* KeyCode.BracketRight */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 94 /* KeyCode.BracketRight */,
                    secondary: [17 /* KeyCode.RightArrow */],
                },
                secondary: [17 /* KeyCode.RightArrow */],
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            metadata: {
                description: NOTEBOOK_UNFOLD_COMMAND_LABEL,
                args: FOLDING_COMMAND_ARGS.args
            },
            precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
            f1: true
        });
    }
    async run(accessor, args) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        const levels = args && args.levels || 1;
        const direction = args && args.direction === 'up' ? 'up' : 'down';
        let index = undefined;
        if (args) {
            index = args.index;
        }
        else {
            const activeCell = editor.getActiveCell();
            if (!activeCell) {
                return;
            }
            index = editor.getCellIndex(activeCell);
        }
        const controller = editor.getContribution(FoldingController.id);
        if (index !== undefined) {
            if (direction === 'up') {
                controller.setFoldingStateUp(index, 1 /* CellFoldingState.Expanded */, levels);
            }
            else {
                controller.setFoldingStateDown(index, 1 /* CellFoldingState.Expanded */, levels);
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZ0NvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvZm9sZGluZ0NvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RyxPQUFPLEVBQTJFLCtCQUErQixFQUFvQixNQUFNLHVCQUF1QixDQUFDO0FBQ25LLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV2SCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUlsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUs1RCxNQUFNLE9BQU8saUJBQWtCLFNBQVEsVUFBVTthQUN6QyxPQUFFLEdBQVcsc0NBQXNDLEFBQWpELENBQWtEO0lBSzNELFlBQTZCLGVBQWdDO1FBQzVELEtBQUssRUFBRSxDQUFDO1FBRG9CLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUhyRCxrQkFBYSxHQUF3QixJQUFJLENBQUM7UUFDakMsZ0JBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUtwRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFNUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRTtZQUN6RCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRXpCLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7Z0JBQ3RDLE9BQU87WUFDUixDQUFDO1lBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDbEUsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLGdCQUFnQixJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDdEUsSUFBSSxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsQ0FBQztnQkFDakMsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksWUFBWSxFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ3pDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztZQUV4RSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsRUFBRTtnQkFDdEUsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7WUFDbkMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsYUFBYTtRQUNaLE9BQU8sSUFBSSxDQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDL0MsQ0FBQztJQUVELGdCQUFnQixDQUFDLEtBQStCO1FBQy9DLElBQUksQ0FBQyxhQUFhLEVBQUUsWUFBWSxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRUQsbUJBQW1CLENBQUMsS0FBYSxFQUFFLEtBQXVCLEVBQUUsTUFBYztRQUN6RSxNQUFNLFVBQVUsR0FBRyxLQUFLLHVDQUErQixDQUFDO1FBQ3hELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxhQUFjLENBQUMsZUFBZSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM5RCxNQUFNLE9BQU8sR0FBb0IsRUFBRSxDQUFDO1FBQ3BDLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixJQUFJLE1BQU0sQ0FBQyxXQUFXLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQ3ZDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEIsQ0FBQztZQUNELElBQUksTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNoQixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEtBQUssVUFBVSxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQztnQkFDekksT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLGFBQWEsQ0FBQyxDQUFDO1lBQ2hDLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFjLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyx1Q0FBK0IsQ0FBQyxDQUFDLENBQUM7UUFDNUcsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7SUFDbkMsQ0FBQztJQUVELGlCQUFpQixDQUFDLEtBQWEsRUFBRSxLQUF1QixFQUFFLE1BQWM7UUFDdkUsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN6QixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEtBQUssQ0FBQyxLQUFLLHVDQUErQixDQUFDLElBQUksS0FBSyxJQUFJLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZLLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssdUNBQStCLENBQUMsQ0FBQyxDQUFDO1FBQzVHLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFFTywwQkFBMEI7UUFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN6QixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDdEMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBdUIsQ0FBQztRQUVwRSxFQUFFLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNuRCxNQUFNLFlBQVksR0FBRyxFQUFFLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVELFNBQVMsQ0FBQyxDQUE0QjtRQUNyQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNyQixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDdEMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBdUIsQ0FBQztRQUMzRSxNQUFNLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQXFCLENBQUM7UUFFN0MsSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLEVBQUUsQ0FBQztZQUN2SCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsYUFBNEIsQ0FBQztZQUVuRCxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLENBQUMsRUFBRSxDQUFDO2dCQUM5RCxPQUFPO1lBQ1IsQ0FBQztZQUVELGVBQWU7WUFFZixNQUFNLGFBQWEsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQy9CLE1BQU0sVUFBVSxHQUFHLFNBQVMsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDekQsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUVwRCxJQUFJLEtBQUssa0NBQTBCLEVBQUUsQ0FBQztnQkFDckMsT0FBTztZQUNSLENBQUM7WUFFRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsVUFBVSxFQUFFLEtBQUssdUNBQStCLENBQUMsQ0FBQyxtQ0FBMkIsQ0FBQyxtQ0FBMkIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNySSxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBRUQsT0FBTztJQUNSLENBQUM7SUFFRCxTQUFTO1FBQ1IsSUFBSSxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUNqQyxDQUFDOztBQUdGLDRCQUE0QixDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0FBR3RFLE1BQU0sMkJBQTJCLEdBQUcsUUFBUSxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUN2RSxNQUFNLDZCQUE2QixHQUFHLFNBQVMsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFFOUUsTUFBTSxvQkFBb0IsR0FBbUM7SUFDNUQsSUFBSSxFQUFFLENBQUM7WUFDTixVQUFVLEVBQUUsSUFBSTtZQUNoQixJQUFJLEVBQUUsT0FBTztZQUNiLFdBQVcsRUFBRSxnQkFBZ0I7WUFDN0IsTUFBTSxFQUFFO2dCQUNQLE1BQU0sRUFBRSxRQUFRO2dCQUNoQixVQUFVLEVBQUUsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDO2dCQUNsQyxZQUFZLEVBQUU7b0JBQ2IsT0FBTyxFQUFFO3dCQUNSLE1BQU0sRUFBRSxRQUFRO3FCQUNoQjtvQkFDRCxXQUFXLEVBQUU7d0JBQ1osTUFBTSxFQUFFLFFBQVE7d0JBQ2hCLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUM7d0JBQ3RCLFNBQVMsRUFBRSxNQUFNO3FCQUNqQjtvQkFDRCxRQUFRLEVBQUU7d0JBQ1QsTUFBTSxFQUFFLFFBQVE7d0JBQ2hCLFNBQVMsRUFBRSxDQUFDO3FCQUNaO2lCQUNEO2FBQ0Q7U0FDRCxDQUFDO0NBQ0YsQ0FBQztBQUVGLGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztJQUNwQztRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxlQUFlO1lBQ25CLEtBQUssRUFBRSxTQUFTLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQztZQUMxQyxRQUFRLEVBQUUseUJBQXlCO1lBQ25DLFVBQVUsRUFBRTtnQkFDWCxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUM7Z0JBQzdGLE9BQU8sRUFBRSxtREFBNkIsK0JBQXNCO2dCQUM1RCxHQUFHLEVBQUU7b0JBQ0osT0FBTyxFQUFFLGdEQUEyQiwrQkFBc0I7b0JBQzFELFNBQVMsRUFBRSw0QkFBbUI7aUJBQzlCO2dCQUNELFNBQVMsRUFBRSw0QkFBbUI7Z0JBQzlCLE1BQU0sNkNBQW1DO2FBQ3pDO1lBQ0QsUUFBUSxFQUFFO2dCQUNULFdBQVcsRUFBRSwyQkFBMkI7Z0JBQ3hDLElBQUksRUFBRSxvQkFBb0IsQ0FBQyxJQUFJO2FBQy9CO1lBQ0QsWUFBWSxFQUFFLHlCQUF5QjtZQUN2QyxFQUFFLEVBQUUsSUFBSTtTQUNSLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsSUFBa0U7UUFDdkcsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVuRCxNQUFNLE1BQU0sR0FBRywrQkFBK0IsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMvRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUN4QixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQztRQUN4QyxNQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2xFLElBQUksS0FBSyxHQUF1QixTQUFTLENBQUM7UUFFMUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3BCLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDakIsT0FBTztZQUNSLENBQUM7WUFDRCxLQUFLLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLGVBQWUsQ0FBb0IsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkYsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDekIsTUFBTSxVQUFVLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLEtBQUssSUFBSSxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pHLElBQUksVUFBVSxFQUFFLFFBQVEsS0FBSyxRQUFRLENBQUMsSUFBSSxJQUFJLFNBQVMsS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDcEUsT0FBTztZQUNSLENBQUM7WUFFRCxJQUFJLFNBQVMsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDeEIsVUFBVSxDQUFDLGlCQUFpQixDQUFDLEtBQUssc0NBQThCLE1BQU0sQ0FBQyxDQUFDO1lBQ3pFLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxVQUFVLENBQUMsbUJBQW1CLENBQUMsS0FBSyxzQ0FBOEIsTUFBTSxDQUFDLENBQUM7WUFDM0UsQ0FBQztZQUVELE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxpQ0FBaUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqRixNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUMvQyxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztJQUNwQztRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxpQkFBaUI7WUFDckIsS0FBSyxFQUFFLDZCQUE2QjtZQUNwQyxRQUFRLEVBQUUseUJBQXlCO1lBQ25DLFVBQVUsRUFBRTtnQkFDWCxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUM7Z0JBQzdGLE9BQU8sRUFBRSxtREFBNkIsZ0NBQXVCO2dCQUM3RCxHQUFHLEVBQUU7b0JBQ0osT0FBTyxFQUFFLGdEQUEyQixnQ0FBdUI7b0JBQzNELFNBQVMsRUFBRSw2QkFBb0I7aUJBQy9CO2dCQUNELFNBQVMsRUFBRSw2QkFBb0I7Z0JBQy9CLE1BQU0sNkNBQW1DO2FBQ3pDO1lBQ0QsUUFBUSxFQUFFO2dCQUNULFdBQVcsRUFBRSw2QkFBNkI7Z0JBQzFDLElBQUksRUFBRSxvQkFBb0IsQ0FBQyxJQUFJO2FBQy9CO1lBQ0QsWUFBWSxFQUFFLHlCQUF5QjtZQUN2QyxFQUFFLEVBQUUsSUFBSTtTQUNSLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsSUFBa0U7UUFDdkcsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVuRCxNQUFNLE1BQU0sR0FBRywrQkFBK0IsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMvRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQztRQUN4QyxNQUFNLFNBQVMsR0FBRyxJQUFJLElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2xFLElBQUksS0FBSyxHQUF1QixTQUFTLENBQUM7UUFFMUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3BCLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDakIsT0FBTztZQUNSLENBQUM7WUFDRCxLQUFLLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLGVBQWUsQ0FBb0IsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkYsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDekIsSUFBSSxTQUFTLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQ3hCLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLHFDQUE2QixNQUFNLENBQUMsQ0FBQztZQUN4RSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsVUFBVSxDQUFDLG1CQUFtQixDQUFDLEtBQUsscUNBQTZCLE1BQU0sQ0FBQyxDQUFDO1lBQzFFLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUMsQ0FBQyJ9