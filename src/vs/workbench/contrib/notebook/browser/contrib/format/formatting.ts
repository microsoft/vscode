/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { localize } from 'vs/nls';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { getActiveNotebookEditor, NOTEBOOK_ACTIONS_CATEGORY } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { getDocumentFormattingEditsUntilResult } from 'vs/editor/contrib/format/format';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { WorkspaceTextEdit } from 'vs/editor/common/modes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.format',
			title: localize('format.title', 'Format Notebook'),
			category: NOTEBOOK_ACTIONS_CATEGORY,
			precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR),
			keybinding: {
				when: EditorContextKeys.editorTextFocus.toNegated(),
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I },
				weight: KeybindingWeight.WorkbenchContrib
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const textModelService = accessor.get(ITextModelService);
		const editorWorkerService = accessor.get(IEditorWorkerService);
		const bulkEditService = accessor.get(IBulkEditService);

		const editor = getActiveNotebookEditor(editorService);
		if (!editor || !editor.viewModel) {
			return;
		}

		const notebook = editor.viewModel.notebookDocument;
		const dispoables = new DisposableStore();
		try {

			const edits: WorkspaceTextEdit[] = [];

			for (let cell of notebook.cells) {

				const ref = await textModelService.createModelReference(cell.uri);
				dispoables.add(ref);

				const model = ref.object.textEditorModel;

				const formatEdits = await getDocumentFormattingEditsUntilResult(
					editorWorkerService, model,
					model.getOptions(), CancellationToken.None
				);

				if (formatEdits) {
					formatEdits.forEach(edit => edits.push({
						edit,
						resource: model.uri,
						modelVersionId: model.getVersionId()
					}));
				}
			}

			await bulkEditService.apply(
				{ edits },
				{ label: localize('label', "Format Notebook") }
			);

		} finally {
			dispoables.dispose();
		}

	}
});
