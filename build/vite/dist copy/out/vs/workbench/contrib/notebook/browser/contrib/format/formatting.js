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
import { localize, localize2 } from '../../../../../../nls.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { EditorAction, registerEditorAction } from '../../../../../../editor/browser/editorExtensions.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../../editor/browser/services/bulkEditService.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { formatDocumentWithSelectedProvider, getDocumentFormattingEditsWithSelectedProvider } from '../../../../../../editor/contrib/format/browser/format.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Progress } from '../../../../../../platform/progress/common/progress.js';
import { NOTEBOOK_ACTIONS_CATEGORY } from '../../controller/coreActions.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../common/notebookContextKeys.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { INotebookExecutionService } from '../../../common/notebookExecutionService.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchContributionsExtensions } from '../../../../../common/contributions.js';
import { INotebookService } from '../../../common/notebookService.js';
import { CodeActionParticipantUtils } from '../saveParticipants/saveParticipants.js';
// format notebook
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.format',
            title: localize2('format.title', 'Format Notebook'),
            category: NOTEBOOK_ACTIONS_CATEGORY,
            precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE),
            keybinding: {
                when: EditorContextKeys.editorTextFocus.toNegated(),
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 36 /* KeyCode.KeyF */,
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 39 /* KeyCode.KeyI */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            f1: true,
            menu: {
                id: MenuId.EditorContext,
                when: ContextKeyExpr.and(EditorContextKeys.inCompositeEditor, EditorContextKeys.hasDocumentFormattingProvider),
                group: '1_modification',
                order: 1.3
            }
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const textModelService = accessor.get(ITextModelService);
        const editorWorkerService = accessor.get(IEditorWorkerService);
        const languageFeaturesService = accessor.get(ILanguageFeaturesService);
        const bulkEditService = accessor.get(IBulkEditService);
        const instantiationService = accessor.get(IInstantiationService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor || !editor.hasModel()) {
            return;
        }
        const notebook = editor.textModel;
        const formatApplied = await instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, Progress.None, CancellationToken.None);
        const disposable = new DisposableStore();
        try {
            if (!formatApplied) {
                const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
                    const ref = await textModelService.createModelReference(cell.uri);
                    disposable.add(ref);
                    const model = ref.object.textEditorModel;
                    const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(editorWorkerService, languageFeaturesService, model, 1 /* FormattingMode.Explicit */, CancellationToken.None);
                    const edits = [];
                    if (formatEdits) {
                        for (const edit of formatEdits) {
                            edits.push(new ResourceTextEdit(model.uri, edit, model.getVersionId()));
                        }
                        return edits;
                    }
                    return [];
                }));
                await bulkEditService.apply(/* edit */ allCellEdits.flat(), { label: localize('label', "Format Notebook"), code: 'undoredo.formatNotebook', });
            }
        }
        finally {
            disposable.dispose();
        }
    }
});
// format cell
registerEditorAction(class FormatCellAction extends EditorAction {
    constructor() {
        super({
            id: 'notebook.formatCell',
            label: localize2('formatCell.label', "Format Cell"),
            precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, EditorContextKeys.inCompositeEditor, EditorContextKeys.writable, EditorContextKeys.hasDocumentFormattingProvider),
            kbOpts: {
                kbExpr: ContextKeyExpr.and(EditorContextKeys.editorTextFocus),
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 36 /* KeyCode.KeyF */,
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 39 /* KeyCode.KeyI */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            contextMenuOpts: {
                group: '1_modification',
                order: 1.301
            }
        });
    }
    async run(accessor, editor) {
        if (editor.hasModel()) {
            const instaService = accessor.get(IInstantiationService);
            await instaService.invokeFunction(formatDocumentWithSelectedProvider, editor, 1 /* FormattingMode.Explicit */, Progress.None, CancellationToken.None, true);
        }
    }
});
let FormatOnCellExecutionParticipant = class FormatOnCellExecutionParticipant {
    constructor(bulkEditService, languageFeaturesService, textModelService, editorWorkerService, configurationService, _notebookService) {
        this.bulkEditService = bulkEditService;
        this.languageFeaturesService = languageFeaturesService;
        this.textModelService = textModelService;
        this.editorWorkerService = editorWorkerService;
        this.configurationService = configurationService;
        this._notebookService = _notebookService;
    }
    async onWillExecuteCell(executions) {
        const enabled = this.configurationService.getValue(NotebookSetting.formatOnCellExecution);
        if (!enabled) {
            return;
        }
        const disposable = new DisposableStore();
        try {
            const allCellEdits = await Promise.all(executions.map(async (cellExecution) => {
                const nbModel = this._notebookService.getNotebookTextModel(cellExecution.notebook);
                if (!nbModel) {
                    return [];
                }
                let activeCell;
                for (const cell of nbModel.cells) {
                    if (cell.handle === cellExecution.cellHandle) {
                        activeCell = cell;
                        break;
                    }
                }
                if (!activeCell) {
                    return [];
                }
                const ref = await this.textModelService.createModelReference(activeCell.uri);
                disposable.add(ref);
                const model = ref.object.textEditorModel;
                const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(this.editorWorkerService, this.languageFeaturesService, model, 2 /* FormattingMode.Silent */, CancellationToken.None);
                const edits = [];
                if (formatEdits) {
                    edits.push(...formatEdits.map(edit => new ResourceTextEdit(model.uri, edit, model.getVersionId())));
                    return edits;
                }
                return [];
            }));
            await this.bulkEditService.apply(/* edit */ allCellEdits.flat(), { label: localize('formatCells.label', "Format Cells"), code: 'undoredo.notebooks.onWillExecuteFormat', });
        }
        finally {
            disposable.dispose();
        }
    }
};
FormatOnCellExecutionParticipant = __decorate([
    __param(0, IBulkEditService),
    __param(1, ILanguageFeaturesService),
    __param(2, ITextModelService),
    __param(3, IEditorWorkerService),
    __param(4, IConfigurationService),
    __param(5, INotebookService)
], FormatOnCellExecutionParticipant);
let CellExecutionParticipantsContribution = class CellExecutionParticipantsContribution extends Disposable {
    constructor(instantiationService, notebookExecutionService) {
        super();
        this.instantiationService = instantiationService;
        this.notebookExecutionService = notebookExecutionService;
        this.registerKernelExecutionParticipants();
    }
    registerKernelExecutionParticipants() {
        this._register(this.notebookExecutionService.registerExecutionParticipant(this.instantiationService.createInstance(FormatOnCellExecutionParticipant)));
    }
};
CellExecutionParticipantsContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, INotebookExecutionService)
], CellExecutionParticipantsContribution);
export { CellExecutionParticipantsContribution };
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(CellExecutionParticipantsContribution, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9ybWF0dGluZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9mb3JtYXQvZm9ybWF0dGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRWxGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFekYsT0FBTyxFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2hHLE9BQU8sRUFBa0Isa0NBQWtDLEVBQUUsOENBQThDLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMvSyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN4RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDNUYsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLGtFQUFrRSxDQUFDO0FBRTNILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFB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