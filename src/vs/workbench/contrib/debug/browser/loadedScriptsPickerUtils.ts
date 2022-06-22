/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
import { matchesFuzzy } from 'vs/base/common/filters';
import { Source } from 'vs/workbench/contrib/debug/common/debugSource';
import { Codicon } from 'vs/base/common/codicons';
import { IQuickPick, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IDebugSession, State } from 'vs/workbench/contrib/debug/common/debug';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export interface IPickerLoadedScriptItem extends IQuickPickItem {
	accept(): void;
}

// this function takes a regular quickpick and makes one for loaded scripts that has persistent headers
// e.g. when some picks are filtered out, the ones that are visible still have its header
export async function configureLoadedScriptMenu(quickPick: IQuickPick<IPickerLoadedScriptItem>, sessions: IDebugSession[], editorService: IEditorService) {
	quickPick.matchOnLabel = quickPick.matchOnDescription = quickPick.matchOnDetail = quickPick.sortByLabel = false;
	quickPick.placeholder = nls.localize('moveFocusedView.selectView', "search for a loaded script");
	quickPick.items = await _getPicks(quickPick.value, sessions, editorService);
	quickPick.onDidChangeValue(async () => {
		quickPick.items = await _getPicks(quickPick.value, sessions, editorService);
	});
	quickPick.onDidAccept(() => {
		const selectedItem = quickPick.selectedItems[0];
		selectedItem.accept();
		quickPick.hide();
	});
}

function _getLabelName(source: Source) {
	const posOfForwardSlash = source.name.lastIndexOf('/');
	const posOfBackSlash = source.name.lastIndexOf('\\');

	const delimeterPos = posOfForwardSlash > posOfBackSlash ? posOfForwardSlash : posOfBackSlash;
	const label = source.name.substring(delimeterPos + 1);
	return label;
}

async function _getPicksFromSession(session: IDebugSession, filter: string, editorService: IEditorService): Promise<Array<IPickerLoadedScriptItem | IQuickPickSeparator>> {
	const items: Array<IPickerLoadedScriptItem | IQuickPickSeparator> = [];
	items.push({ type: 'separator', label: session.name });
	const sources = await session.getLoadedSources();

	sources.forEach((element: Source) => {
		const pick = _createPick(element, filter, editorService);
		if (pick) {
			items.push(pick);
		}

	});
	return items;
}
async function _getPicks(filter: string, sessions: IDebugSession[], editorService: IEditorService): Promise<Array<IPickerLoadedScriptItem | IQuickPickSeparator>> {
	const loadedScriptPicks: Array<IPickerLoadedScriptItem | IQuickPickSeparator> = [];


	const picks = await Promise.all(
		sessions.map((session) => {
			return session.state !== State.Inactive ? _getPicksFromSession(session, filter, editorService) : undefined;
		})
	);

	for (const row of picks) {
		if (row) {
			for (const elem of row) {
				loadedScriptPicks.push(elem);
			}
		}
	}
	return loadedScriptPicks;
}

function _createPick(source: Source, filter: string, editorService: IEditorService): IPickerLoadedScriptItem | undefined {
	const iconId = Codicon.file.id;
	const label = `$(${iconId}) ${_getLabelName(source)}`;

	// manually filter so that headers don't get filtered out
	const highlights = matchesFuzzy(filter, label, true);
	if (highlights) {
		return {
			label,
			description: source.name,
			highlights: { label: highlights },
			accept: () => {
				if (source.available) {
					source.openInEditor(editorService, { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 });
				}
			}
		};
	}
	return undefined;
}
