/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import * as Constants from '../common/constants.js';
import { RenderableMatch } from './searchModel.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { category } from './searchActionsBase.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { TEXT_SEARCH_QUICK_ACCESS_PREFIX } from './quickTextSearch/textSearchQuickAccess.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditor } from '../../../../editor/common/editorCommon.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getSelectionTextFromEditor } from './searchView.js';

registerAction2(class TextSearchQuickAccessAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.QuickTextSearchActionId,
			title: nls.localize2('quickTextSearch', "Quick Search"),
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
