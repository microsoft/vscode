/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../../nls.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { EditorAction, registerEditorAction } from '../../../../../../editor/browser/editorExtensions.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../../editor/browser/services/bulkEditService.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { FormattingMode, formatDocumentWithSelectedProvider, getDocumentFormattingEditsWithSelectedProvider } from '../../../../../../editor/contrib/format/browser/format.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Progress } from '../../../../../../platform/progress/common/progress.js';
import { NOTEBOOK_ACTIONS_CATEGORY } from '../../controller/coreActions.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../common/notebookContextKeys.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { INotebookCellExecution } from '../../../common/notebookExecutionStateService.js';
import { ICellExecutionParticipant, INotebookExecutionService } from '../../../common/notebookExecutionService.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from '../../../../../common/contributions.js';
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
			label: localize2('formatCell.label', "Format Cell"),
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
