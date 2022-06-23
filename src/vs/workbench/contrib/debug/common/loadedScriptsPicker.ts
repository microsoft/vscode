/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
import { matchesFuzzy } from 'vs/base/common/filters';
import { Source } from 'vs/workbench/contrib/debug/common/debugSource';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IDebugSession } from 'vs/workbench/contrib/debug/common/debug';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';

export interface IPickerLoadedScriptItem extends IQuickPickItem {
	accept(): void;
}


/**
 * This function takes a regular quickpick and makes one for loaded scripts that has persistent headers
 * e.g. when some picks are filtered out, the ones that are visible still have its header.
 */
export async function showLoadedScriptMenu(sessions: IDebugSession[], quickInputService: IQuickInputService, editorService: IEditorService, modelService: IModelService, languageService: ILanguageService) {

	const quickPick = quickInputService.createQuickPick<IPickerLoadedScriptItem>();
	quickPick.matchOnLabel = quickPick.matchOnDescription = quickPick.matchOnDetail = quickPick.sortByLabel = false;
	quickPick.placeholder = nls.localize('moveFocusedView.selectView', "Search loaded scripts by name");
	quickPick.items = await _getPicks(quickPick.value, sessions, editorService, modelService, languageService);
	const changeListener = quickPick.onDidChangeValue(async () => {
		quickPick.items = await _getPicks(quickPick.value, sessions, editorService, modelService, languageService);
	});
	const acceptListener = quickPick.onDidAccept(() => {
		const selectedItem = quickPick.selectedItems[0];
		selectedItem.accept();
		acceptListener.dispose();
		changeListener.dispose();
		quickPick.hide();
		quickPick.dispose();
	});
	quickPick.show();
}

function _getLabelName(source: Source) {
	const posOfForwardSlash = source.name.lastIndexOf('/');
	const posOfBackSlash = source.name.lastIndexOf('\\');

	const delimeterPos = posOfForwardSlash > posOfBackSlash ? posOfForwardSlash : posOfBackSlash;
	const label = source.name.substring(delimeterPos + 1);
	return label;
}

async function _getPicksFromSession(session: IDebugSession, filter: string, editorService: IEditorService, modelService: IModelService, languageService: ILanguageService): Promise<Array<IPickerLoadedScriptItem | IQuickPickSeparator>> {
	const items: Array<IPickerLoadedScriptItem | IQuickPickSeparator> = [];
	items.push({ type: 'separator', label: session.name });
	const sources = await session.getLoadedSources();

	sources.forEach((element: Source) => {
		const pick = _createPick(element, filter, editorService, modelService, languageService);
		if (pick) {
			items.push(pick);
		}

	});
	return items;
}
async function _getPicks(filter: string, sessions: IDebugSession[], editorService: IEditorService, modelService: IModelService, languageService: ILanguageService): Promise<Array<IPickerLoadedScriptItem | IQuickPickSeparator>> {
	const loadedScriptPicks: Array<IPickerLoadedScriptItem | IQuickPickSeparator> = [];


	const picks = await Promise.all(
		sessions.map((session) => {
			return _getPicksFromSession(session, filter, editorService, modelService, languageService);
		})
	);

	for (const row of picks) {
		for (const elem of row) {
			loadedScriptPicks.push(elem);
		}
	}
	return loadedScriptPicks;
}

function _createPick(source: Source, filter: string, editorService: IEditorService, modelService: IModelService, languageService: ILanguageService): IPickerLoadedScriptItem | undefined {

	const label = _getLabelName(source);

	// manually filter so that headers don't get filtered out
	const highlights = matchesFuzzy(filter, label, true);
	if (highlights) {
		return {
			label,
			description: source.name,
			highlights: { label: highlights },
			iconClasses: getIconClasses(modelService, languageService, source.uri),
			accept: () => {
				if (source.available) {
					source.openInEditor(editorService, { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 });
				}
			}
		};
	}
	return undefined;
}
