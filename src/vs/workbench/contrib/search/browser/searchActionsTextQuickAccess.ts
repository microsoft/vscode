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
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';

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
		const searchText = getSearchText(accessor);
		const searchContents = searchText ? ' ' + searchText : '';
		quickInputService.quickAccess.show(TEXT_SEARCH_QUICK_ACCESS_PREFIX + searchContents);
	}
});

function getSearchText(accessor: ServicesAccessor): string | null {
	const editorService = accessor.get(IEditorService);
	const configurationService = accessor.get(IConfigurationService);

	if (editorService.activeTextEditorControl === undefined) {
		return null;
	}
	const activeEditor: IEditor = editorService.activeTextEditorControl;
	if (!activeEditor.hasTextFocus()) {
		return null;
	}

	const seedSearchStringFromSelection = configurationService.getValue<IEditorOptions>('editor').find!.seedSearchStringFromSelection;
	if (!seedSearchStringFromSelection) {
		return null;
	}

	if (!activeEditor) {
		return null;
	}
	const range = activeEditor.getSelection();
	if (!range) {
		return null;
	}
	if (!isCodeEditor(activeEditor) || !activeEditor.hasModel()) {
		return null;
	}

	let searchText = '';
	for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
		let lineText = activeEditor.getModel().getLineContent(i);
		if (i === range.endLineNumber) {
			lineText = lineText.substring(0, range.endColumn - 1);
		}

		if (i === range.startLineNumber) {
			lineText = lineText.substring(range.startColumn - 1);
		}

		if (i !== range.startLineNumber) {
			lineText = '\n' + lineText;
		}

		searchText += lineText;
	}

	return searchText;
}

