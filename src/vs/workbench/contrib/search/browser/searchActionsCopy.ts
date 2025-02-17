/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import * as Constants from '../common/constants.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { category, getSearchView } from './searchActionsBase.js';
import { isWindows } from '../../../../base/common/platform.js';
import { searchMatchComparer } from './searchCompare.js';
import { RenderableMatch, ISearchTreeMatch, isSearchTreeMatch, ISearchTreeFileMatch, ISearchTreeFolderMatch, ISearchTreeFolderMatchWithResource, isSearchTreeFileMatch, isSearchTreeFolderMatch, isSearchTreeFolderMatchWithResource } from './searchTreeModel/searchTreeCommon.js';

//#region Actions
registerAction2(class CopyMatchCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.CopyMatchCommandId,
			title: nls.localize2('copyMatchLabel', "Copy"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchContext.FileMatchOrMatchFocusKey,
				primary: KeyMod.CtrlCmd | KeyCode.KeyC,
			},
			menu: [{
				id: MenuId.SearchContext,
				when: Constants.SearchContext.FileMatchOrMatchFocusKey,
				group: 'search_2',
				order: 1
			}]
		});

	}

	override async run(accessor: ServicesAccessor, match: RenderableMatch | undefined): Promise<any> {
		await copyMatchCommand(accessor, match);
	}
});

registerAction2(class CopyPathCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.CopyPathCommandId,
			title: nls.localize2('copyPathLabel', "Copy Path"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: Constants.SearchContext.FileMatchOrFolderMatchWithResourceFocusKey,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
				win: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC
				},
			},
			menu: [{
				id: MenuId.SearchContext,
				when: Constants.SearchContext.FileMatchOrFolderMatchWithResourceFocusKey,
				group: 'search_2',
				order: 2
			}]
		});

	}

	override async run(accessor: ServicesAccessor, fileMatch: ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource | undefined): Promise<any> {
		await copyPathCommand(accessor, fileMatch);
	}
});

registerAction2(class CopyAllCommandAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.CopyAllCommandId,
			title: nls.localize2('copyAllLabel', "Copy All"),
			category,
			menu: [{
				id: MenuId.SearchContext,
				when: Constants.SearchContext.HasSearchResults,
				group: 'search_2',
				order: 3
			}]
		});

	}

	override async run(accessor: ServicesAccessor): Promise<any> {
		await copyAllCommand(accessor);
	}
});

//#endregion

//#region Helpers
export const lineDelimiter = isWindows ? '\r\n' : '\n';

async function copyPathCommand(accessor: ServicesAccessor, fileMatch: ISearchTreeFileMatch | ISearchTreeFolderMatchWithResource | undefined) {
	if (!fileMatch) {
		const selection = getSelectedRow(accessor);
		if (!isSearchTreeFileMatch(selection) || isSearchTreeFolderMatchWithResource(selection)) {
			return;
		}

		fileMatch = selection;
	}

	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	const text = labelService.getUriLabel(fileMatch.resource, { noPrefix: true });
	await clipboardService.writeText(text);
}

async function copyMatchCommand(accessor: ServicesAccessor, match: RenderableMatch | undefined) {
	if (!match) {
		const selection = getSelectedRow(accessor);
		if (!selection) {
			return;
		}

		match = selection;
	}

	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	let text: string | undefined;
	if (isSearchTreeMatch(match)) {
		text = matchToString(match);
	} else if (isSearchTreeFileMatch(match)) {
		text = fileMatchToString(match, labelService).text;
	} else if (isSearchTreeFolderMatch(match)) {
		text = folderMatchToString(match, labelService).text;
	}

	if (text) {
		await clipboardService.writeText(text);
	}
}

async function copyAllCommand(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	const searchView = getSearchView(viewsService);
	if (searchView) {
		const root = searchView.searchResult;

		const text = allFolderMatchesToString(root.folderMatches(), labelService);
		await clipboardService.writeText(text);
	}
}

function matchToString(match: ISearchTreeMatch, indent = 0): string {
	const getFirstLinePrefix = () => `${match.range().startLineNumber},${match.range().startColumn}`;
	const getOtherLinePrefix = (i: number) => match.range().startLineNumber + i + '';

	const fullMatchLines = match.fullPreviewLines();
	const largestPrefixSize = fullMatchLines.reduce((largest, _, i) => {
		const thisSize = i === 0 ?
			getFirstLinePrefix().length :
			getOtherLinePrefix(i).length;

		return Math.max(thisSize, largest);
	}, 0);

	const formattedLines = fullMatchLines
		.map((line, i) => {
			const prefix = i === 0 ?
				getFirstLinePrefix() :
				getOtherLinePrefix(i);

			const paddingStr = ' '.repeat(largestPrefixSize - prefix.length);
			const indentStr = ' '.repeat(indent);
			return `${indentStr}${prefix}: ${paddingStr}${line}`;
		});

	return formattedLines.join('\n');
}

function fileFolderMatchToString(match: ISearchTreeFileMatch | ISearchTreeFolderMatch | ISearchTreeFolderMatchWithResource, labelService: ILabelService): { text: string; count: number } {
	if (isSearchTreeFileMatch(match)) {
		return fileMatchToString(match, labelService);
	} else {
		return folderMatchToString(match, labelService);
	}
}

function fileMatchToString(fileMatch: ISearchTreeFileMatch, labelService: ILabelService): { text: string; count: number } {
	const matchTextRows = fileMatch.matches()
		.sort(searchMatchComparer)
		.map(match => matchToString(match, 2));
	const uriString = labelService.getUriLabel(fileMatch.resource, { noPrefix: true });
	return {
		text: `${uriString}${lineDelimiter}${matchTextRows.join(lineDelimiter)}`,
		count: matchTextRows.length
	};
}

function folderMatchToString(folderMatch: ISearchTreeFolderMatchWithResource | ISearchTreeFolderMatch, labelService: ILabelService): { text: string; count: number } {
	const results: string[] = [];
	let numMatches = 0;

	const matches = folderMatch.matches().sort(searchMatchComparer);

	matches.forEach(match => {
		const result = fileFolderMatchToString(match, labelService);
		numMatches += result.count;
		results.push(result.text);
	});

	return {
		text: results.join(lineDelimiter + lineDelimiter),
		count: numMatches
	};
}

function allFolderMatchesToString(folderMatches: Array<ISearchTreeFolderMatchWithResource | ISearchTreeFolderMatch>, labelService: ILabelService): string {
	const folderResults: string[] = [];
	folderMatches = folderMatches.sort(searchMatchComparer);
	for (let i = 0; i < folderMatches.length; i++) {
		const folderResult = folderMatchToString(folderMatches[i], labelService);
		if (folderResult.count) {
			folderResults.push(folderResult.text);
		}
	}

	return folderResults.join(lineDelimiter + lineDelimiter);
}

function getSelectedRow(accessor: ServicesAccessor): RenderableMatch | undefined | null {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	return searchView?.getControl().getSelection()[0];
}

//#endregion
