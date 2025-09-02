/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { InSearchEditor } from './constants.js';
import { SearchEditorInput } from './searchEditorInput.js';
import { SearchMultiDiffEditorInput } from './searchMultiDiffEditorInput.js';

export class OpenSearchResultsAsMultiDiffAction extends Action2 {
	static readonly ID = 'search.action.openAsMultiDiff';
	static readonly LABEL = localize('searchEditor.openAsMultiDiff', "View as Multi-Diff");

	constructor() {
		super({
			id: OpenSearchResultsAsMultiDiffAction.ID,
			title: OpenSearchResultsAsMultiDiffAction.LABEL,
			category: 'Search Editor',
			f1: true,
			precondition: InSearchEditor,
			menu: [{
				id: MenuId.EditorTitle,
				when: InSearchEditor,
				group: 'navigation'
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);
		const activeEditorPane = editorService.activeEditorPane;

		if (!activeEditorPane) {
			return;
		}

		const input = activeEditorPane.input;
		if (!(input instanceof SearchEditorInput)) {
			return;
		}

		// Get search results from the search editor input
		// For now, we would need to access the search model from the editor
		// This is a simplified version - in reality we'd need to access the SearchModel
		const searchEditor = activeEditorPane as any;
		const searchModel = searchEditor.searchModel;
		
		if (!searchModel || !searchModel.searchResult) {
			return;
		}

		// Create multi-diff editor input and open it
		const multiDiffInput = SearchMultiDiffEditorInput.createInput(searchModel.searchResult, instantiationService);
		await editorService.openEditor(multiDiffInput);
	}
}

registerAction2(OpenSearchResultsAsMultiDiffAction);