/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { CellEditType } from '../../common/notebookCommon.js';
import { NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUTS_TRANSIENT } from '../../common/notebookContextKeys.js';
import { getNotebookEditorFromEditorPane } from '../notebookBrowser.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { NOTEBOOK_ACTIONS_CATEGORY } from './coreActions.js';

export const TOGGLE_NOTEBOOK_TRANSIENT_OUTPUTS = 'notebook.toggleTransientOutputs';

registerAction2(class ToggleTransientOutputsAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_NOTEBOOK_TRANSIENT_OUTPUTS,
			title: localize2('notebook.toggleTransientOutputs', "Toggle Transient Outputs"),
			f1: true,
			precondition: NOTEBOOK_EDITOR_FOCUSED,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			menu: {
				id: MenuId.NotebookToolbar,
				when: NOTEBOOK_EDITOR_FOCUSED,
				group: 'notebook/cell/execute'
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const notebookEditor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
		
		if (!notebookEditor) {
			return;
		}
		
		const model = notebookEditor.textModel;
		if (!model) {
			return;
		}
		
		const currentValue = !!model.metadata.transientOutputs;
		const newMetadata = {
			...model.metadata,
			transientOutputs: !currentValue
		};
		
		await model.applyEdits([{
			editType: CellEditType.DocumentMetadata,
			metadata: newMetadata
		}], true, undefined, () => undefined, undefined, true);
	}
});