/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FormattingMode, formatDocumentWithSelectedProvider, getDocumentFormattingEditsWithSelectedProvider } from 'vs/editor/contrib/format/browser/format';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Progress } from 'vs/platform/progress/common/progress';
import { NOTEBOOK_ACTIONS_CATEGORY } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { INotebookCellExecution } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { ICellExecutionParticipant, INotebookExecutionService } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { CodeActionParticipantUtils } from 'vs/workbench/contrib/notebook/browser/contrib/saveParticipants/saveParticipants';

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
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI },
				weight: KeybindingWeight.WorkbenchContrib
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

	async run(accessor: ServicesAccessor): Promise<void> {
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

		const formatApplied: boolean = await instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, Progress.None, CancellationToken.None);

		const disposable = new DisposableStore();
		try {
			if (!formatApplied) {
				const allCellEdits = await Promise.all(notebook.cells.map(async cell => {
					const ref = await textModelService.createModelReference(cell.uri);
					disposable.add(ref);

					const model = ref.object.textEditorModel;

					const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
						editorWorkerService,
						languageFeaturesService,
						model,
						FormattingMode.Explicit,
						CancellationToken.None
					);

					const edits: ResourceTextEdit[] = [];

					if (formatEdits) {
						for (const edit of formatEdits) {
							edits.push(new ResourceTextEdit(model.uri, edit, model.getVersionId()));
						}

						return edits;
					}

					return [];
				}));

				await bulkEditService.apply(/* edit */allCellEdits.flat(), { label: localize('label', "Format Notebook"), code: 'undoredo.formatNotebook', });
			}
		} finally {
			disposable.dispose();
		}
	}
});

// format cell
registerEditorAction(class FormatCellAction extends EditorAction {
	constructor() {
		super({
			id: 'notebook.formatCell',
			label: localize('formatCell.label', "Format Cell"),
			alias: 'Format Cell',
			precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, EditorContextKeys.inCompositeEditor, EditorContextKeys.writable, EditorContextKeys.hasDocumentFormattingProvider),
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.editorTextFocus),
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI },
				weight: KeybindingWeight.EditorContrib
			},
			contextMenuOpts: {
				group: '1_modification',
				order: 1.301
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		if (editor.hasModel()) {
			const instaService = accessor.get(IInstantiationService);
			await instaService.invokeFunction(formatDocumentWithSelectedProvider, editor, FormattingMode.Explicit, Progress.None, CancellationToken.None, true);
		}
	}
});

class FormatOnCellExecutionParticipant implements ICellExecutionParticipant {
	constructor(
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotebookService private readonly _notebookService: INotebookService,
	) {
	}

	async onWillExecuteCell(executions: INotebookCellExecution[]): Promise<void> {

		const enabled = this.configurationService.getValue<boolean>(NotebookSetting.formatOnCellExecution);
		if (!enabled) {
			return;
		}

		const disposable = new DisposableStore();
		try {
			const allCellEdits = await Promise.all(executions.map(async cellExecution => {
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

				const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
					this.editorWorkerService,
					this.languageFeaturesService,
					model,
					FormattingMode.Silent,
					CancellationToken.None
				);

				const edits: ResourceTextEdit[] = [];

				if (formatEdits) {
					edits.push(...formatEdits.map(edit => new ResourceTextEdit(model.uri, edit, model.getVersionId())));
					return edits;
				}

				return [];
			}));

			await this.bulkEditService.apply(/* edit */allCellEdits.flat(), { label: localize('formatCells.label', "Format Cells"), code: 'undoredo.notebooks.onWillExecuteFormat', });

		} finally {
			disposable.dispose();
		}
	}
}

export class CellExecutionParticipantsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookExecutionService private readonly notebookExecutionService: INotebookExecutionService
	) {
		super();
		this.registerKernelExecutionParticipants();
	}

	private registerKernelExecutionParticipants(): void {
		this._register(this.notebookExecutionService.registerExecutionParticipant(this.instantiationService.createInstance(FormatOnCellExecutionParticipant)));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(CellExecutionParticipantsContribution, LifecyclePhase.Restored);
