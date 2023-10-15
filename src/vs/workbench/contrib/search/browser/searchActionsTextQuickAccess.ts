/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import * as Constants from 'vs/workbench/contrib/search/common/constants';
import { RenderableMatch } from 'vs/workbench/contrib/search/browser/searchModel';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { category } from 'vs/workbench/contrib/search/browser/searchActionsBase';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { TEXT_SEARCH_QUICK_ACCESS_PREFIX } from 'vs/workbench/contrib/search/browser/quickTextSearch/textSearchQuickAccess';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getSelectionTextFromEditor } from 'vs/workbench/contrib/search/browser/searchView';

registerAction2(class TextSearchQuickAccessAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.QuickTextSearchActionId,
			title: {
				value: nls.localize('quickTextSearch', "Quick Text Search (Experimental)"),
				original: 'Quick Text Search (Experimental)'
			},
			category,
			f1: true
		});

	}

	override async run(accessor: ServicesAccessor, match: RenderableMatch | undefined): Promise<any> {
		const quickInputService = accessor.get(IQuickInputService);
		const searchText = getSearchText(accessor) ?? '';
		quickInputService.quickAccess.show(TEXT_SEARCH_QUICK_ACCESS_PREFIX + searchText, { preserveValue: !!searchText });
	}
});

function getSearchText(accessor: ServicesAccessor): string | null {
	const editorService = accessor.get(IEditorService);
	const configurationService = accessor.get(IConfigurationService);

	const activeEditor: IEditor = editorService.activeTextEditorControl as IEditor;
	if (!activeEditor) {
		return null;
	}
	if (!activeEditor.hasTextFocus()) {
		return null;
	}

	// only happen if it would also happen for the search view
	const seedSearchStringFromSelection = configurationService.getValue<boolean>('editor.find.seedSearchStringFromSelection');
	if (!seedSearchStringFromSelection) {
		return null;
	}

	return getSelectionTextFromEditor(false, activeEditor);
}
