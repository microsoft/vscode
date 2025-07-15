/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import './media/searchEditor.css';
import { ICodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorsOrder } from '../../../common/editor.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getSearchView } from '../../search/browser/searchActionsBase.js';
import { SearchEditor } from './searchEditor.js';
import { OpenSearchEditorArgs } from './searchEditor.contribution.js';
import { getOrMakeSearchEditorInput, SearchEditorInput } from './searchEditorInput.js';
import { serializeSearchResultForEditor } from './searchEditorSerialization.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { ISearchConfigurationProperties } from '../../../services/search/common/search.js';
import { ISearchResult } from '../../search/browser/searchTreeModel/searchTreeCommon.js';

export const toggleSearchEditorCaseSensitiveCommand = (accessor: ServicesAccessor) => {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		(editorService.activeEditorPane as SearchEditor).toggleCaseSensitive();
	}
};

export const toggleSearchEditorWholeWordCommand = (accessor: ServicesAccessor) => {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		(editorService.activeEditorPane as SearchEditor).toggleWholeWords();
	}
};

export const toggleSearchEditorRegexCommand = (accessor: ServicesAccessor) => {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		(editorService.activeEditorPane as SearchEditor).toggleRegex();
	}
};

export const toggleSearchEditorContextLinesCommand = (accessor: ServicesAccessor) => {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		(editorService.activeEditorPane as SearchEditor).toggleContextLines();
	}
};

export const modifySearchEditorContextLinesCommand = (accessor: ServicesAccessor, increase: boolean) => {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		(editorService.activeEditorPane as SearchEditor).modifyContextLines(increase);
	}
};

export const selectAllSearchEditorMatchesCommand = (accessor: ServicesAccessor) => {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		(editorService.activeEditorPane as SearchEditor).focusAllResults();
	}
};

export async function openSearchEditor(accessor: ServicesAccessor): Promise<void> {
	const viewsService = accessor.get(IViewsService);
	const instantiationService = accessor.get(IInstantiationService);
	const searchView = getSearchView(viewsService);
	if (searchView) {
		await instantiationService.invokeFunction(openNewSearchEditor, {
			filesToInclude: searchView.searchIncludePattern.getValue(),
			onlyOpenEditors: searchView.searchIncludePattern.onlySearchInOpenEditors(),
			filesToExclude: searchView.searchExcludePattern.getValue(),
			isRegexp: searchView.searchAndReplaceWidget.searchInput?.getRegex(),
			isCaseSensitive: searchView.searchAndReplaceWidget.searchInput?.getCaseSensitive(),
			matchWholeWord: searchView.searchAndReplaceWidget.searchInput?.getWholeWords(),
			useExcludeSettingsAndIgnoreFiles: searchView.searchExcludePattern.useExcludesAndIgnoreFiles(),
			showIncludesExcludes: !!(searchView.searchIncludePattern.getValue() || searchView.searchExcludePattern.getValue() || !searchView.searchExcludePattern.useExcludesAndIgnoreFiles())
		});
	} else {
		await instantiationService.invokeFunction(openNewSearchEditor);
	}
}

export const openNewSearchEditor =
	async (accessor: ServicesAccessor, _args: OpenSearchEditorArgs = {}, toSide = false) => {
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const telemetryService = accessor.get(ITelemetryService);
		const instantiationService = accessor.get(IInstantiationService);
		const configurationService = accessor.get(IConfigurationService);

		const configurationResolverService = accessor.get(IConfigurationResolverService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const historyService = accessor.get(IHistoryService);
		const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.file);
		const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;


		const activeEditorControl = editorService.activeTextEditorControl;
		let activeModel: ICodeEditor | undefined;
		let selected = '';
		if (activeEditorControl) {
			if (isDiffEditor(activeEditorControl)) {
				if (activeEditorControl.getOriginalEditor().hasTextFocus()) {
					activeModel = activeEditorControl.getOriginalEditor();
				} else {
					activeModel = activeEditorControl.getModifiedEditor();
				}
			} else {
				activeModel = activeEditorControl as ICodeEditor;
			}
			const selection = activeModel?.getSelection();
			selected = (selection && activeModel?.getModel()?.getValueInRange(selection)) ?? '';

			if (selection?.isEmpty() && configurationService.getValue<ISearchConfigurationProperties>('search').seedWithNearestWord) {
				const wordAtPosition = activeModel.getModel()?.getWordAtPosition(selection.getStartPosition());
				if (wordAtPosition) {
					selected = wordAtPosition.word;
				}
			}
		} else {
			if (editorService.activeEditor instanceof SearchEditorInput) {
				const active = editorService.activeEditorPane as SearchEditor;
				selected = active.getSelected();
			}
		}

		telemetryService.publicLog2<{},
			{
				owner: 'roblourens';
				comment: 'Fired when a search editor is opened';
			}>
			('searchEditor/openNewSearchEditor');

		const seedSearchStringFromSelection = _args.location === 'new' || configurationService.getValue<IEditorOptions>('editor').find!.seedSearchStringFromSelection;
		const args: OpenSearchEditorArgs = { query: seedSearchStringFromSelection ? selected : undefined };
		for (const entry of Object.entries(_args)) {
			const name = entry[0];
			const value = entry[1];
			if (value !== undefined) {
				(args as any)[name as any] = (typeof value === 'string') ? await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, value) : value;
			}
		}
		const existing = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(id => id.editor.typeId === SearchEditorInput.ID);
		let editor: SearchEditor;
		if (existing && args.location === 'reuse') {
			const group = editorGroupsService.getGroup(existing.groupId);
			if (!group) {
				throw new Error('Invalid group id for search editor');
			}
			const input = existing.editor as SearchEditorInput;
			editor = (await group.openEditor(input)) as SearchEditor;
			if (selected) { editor.setQuery(selected); }
			else { editor.selectQuery(); }
			editor.setSearchConfig(args);
		} else {
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { config: args, resultsContents: '', from: 'rawData' });
			// TODO @roblourens make this use the editor resolver service if possible
			editor = await editorService.openEditor(input, { pinned: true }, toSide ? SIDE_GROUP : ACTIVE_GROUP) as SearchEditor;
		}

		const searchOnType = configurationService.getValue<ISearchConfigurationProperties>('search').searchOnType;
		if (
			args.triggerSearch === true ||
			args.triggerSearch !== false && searchOnType && args.query
		) {
			editor.triggerSearch({ focusResults: args.focusResults });
		}

		if (!args.focusResults) { editor.focusSearchInput(); }
	};

export const createEditorFromSearchResult =
	async (accessor: ServicesAccessor, searchResult: ISearchResult, rawIncludePattern: string, rawExcludePattern: string, onlySearchInOpenEditors: boolean) => {
		if (!searchResult.query) {
			console.error('Expected searchResult.query to be defined. Got', searchResult);
			return;
		}

		const editorService = accessor.get(IEditorService);
		const telemetryService = accessor.get(ITelemetryService);
		const instantiationService = accessor.get(IInstantiationService);
		const labelService = accessor.get(ILabelService);
		const configurationService = accessor.get(IConfigurationService);
		const sortOrder = configurationService.getValue<ISearchConfigurationProperties>('search').sortOrder;

		telemetryService.publicLog2<
			{},
			{
				owner: 'roblourens';
				comment: 'Fired when a search editor is opened from the search view';
			}>
			('searchEditor/createEditorFromSearchResult');

		const labelFormatter = (uri: URI): string => labelService.getUriLabel(uri, { relative: true });

		const { text, matchRanges, config } = serializeSearchResultForEditor(searchResult, rawIncludePattern, rawExcludePattern, 0, labelFormatter, sortOrder);
		config.onlyOpenEditors = onlySearchInOpenEditors;
		const contextLines = configurationService.getValue<ISearchConfigurationProperties>('search').searchEditor.defaultNumberOfContextLines;

		if (searchResult.isDirty || contextLines === 0 || contextLines === null) {
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { resultsContents: text, config, from: 'rawData' });
			await editorService.openEditor(input, { pinned: true });
			input.setMatchRanges(matchRanges);
		} else {
			const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'rawData', resultsContents: '', config: { ...config, contextLines } });
			const editor = await editorService.openEditor(input, { pinned: true }) as SearchEditor;
			editor.triggerSearch();
		}
	};
