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
import { SearchMultiDiffSourceResolver } from './searchMultiDiffSourceResolver.js';

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
		const searchEditor = activeEditorPane as any;
		const searchModel = searchEditor.searchModel;
		
		if (!searchModel || !searchModel.searchResult) {
			return;
		}

		// Create multi-diff source URI and resolver instance
		const multiDiffSource = SearchMultiDiffSourceResolver.getMultiDiffSourceUri(searchModel.searchResult);
		
		// Create the resolver instance to handle this specific URI
		instantiationService.createInstance(SearchMultiDiffSourceResolver, searchModel.searchResult, multiDiffSource);
		
		await editorService.openEditor({ 
			label: localize('searchEditor.multiDiffTitle', 'Search Results'),
			multiDiffSource 
		});
	}
}

registerAction2(OpenSearchResultsAsMultiDiffAction);