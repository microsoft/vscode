/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../base/common/network.js';
import './media/searchEditor.css';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getSearchView } from '../../search/browser/searchActionsBase.js';
import { getOrMakeSearchEditorInput, SearchEditorInput } from './searchEditorInput.js';
import { serializeSearchResultForEditor } from './searchEditorSerialization.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IHistoryService } from '../../../services/history/common/history.js';
export const toggleSearchEditorCaseSensitiveCommand = (accessor) => {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
        editorService.activeEditorPane.toggleCaseSensitive();
    }
};
export const toggleSearchEditorWholeWordCommand = (accessor) => {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
        editorService.activeEditorPane.toggleWholeWords();
    }
};
export const toggleSearchEditorRegexCommand = (accessor) => {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
        editorService.activeEditorPane.toggleRegex();
    }
};
export const toggleSearchEditorContextLinesCommand = (accessor) => {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
        editorService.activeEditorPane.toggleContextLines();
    }
};
export const modifySearchEditorContextLinesCommand = (accessor, increase) => {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
        editorService.activeEditorPane.modifyContextLines(increase);
    }
};
export const selectAllSearchEditorMatchesCommand = (accessor) => {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
        editorService.activeEditorPane.focusAllResults();
    }
};
export async function openSearchEditor(accessor) {
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
    }
    else {
        await instantiationService.invokeFunction(openNewSearchEditor);
    }
}
export const openNewSearchEditor = async (accessor, _args = {}, toSide = false) => {
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
    let activeModel;
    let selected = '';
    if (activeEditorControl) {
        if (isDiffEditor(activeEditorControl)) {
            if (activeEditorControl.getOriginalEditor().hasTextFocus()) {
                activeModel = activeEditorControl.getOriginalEditor();
            }
            else {
                activeModel = activeEditorControl.getModifiedEditor();
            }
        }
        else {
            activeModel = activeEditorControl;
        }
        const selection = activeModel?.getSelection();
        selected = (selection && activeModel?.getModel()?.getValueInRange(selection)) ?? '';
        if (selection?.isEmpty() && configurationService.getValue('search').seedWithNearestWord) {
            const wordAtPosition = activeModel.getModel()?.getWordAtPosition(selection.getStartPosition());
            if (wordAtPosition) {
                selected = wordAtPosition.word;
            }
        }
    }
    else {
        if (editorService.activeEditor instanceof SearchEditorInput) {
            const active = editorService.activeEditorPane;
            selected = active.getSelected();
        }
    }
    telemetryService.publicLog2('searchEditor/openNewSearchEditor');
    const seedSearchStringFromSelection = _args.location === 'new' || configurationService.getValue('editor').find.seedSearchStringFromSelection;
    const args = { query: seedSearchStringFromSelection ? selected : undefined };
    for (const entry of Object.entries(_args)) {
        const name = entry[0];
        const value = entry[1];
        if (value !== undefined) {
            // eslint-disable-next-line local/code-no-any-casts
            args[name] = (typeof value === 'string') ? await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, value) : value;
        }
    }
    const existing = editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).find(id => id.editor.typeId === SearchEditorInput.ID);
    let editor;
    if (existing && args.location === 'reuse') {
        const group = editorGroupsService.getGroup(existing.groupId);
        if (!group) {
            throw new Error('Invalid group id for search editor');
        }
        const input = existing.editor;
        editor = (await group.openEditor(input));
        if (selected) {
            editor.setQuery(selected);
        }
        else {
            editor.selectQuery();
        }
        editor.setSearchConfig(args);
    }
    else {
        const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { config: args, resultsContents: '', from: 'rawData' });
        // TODO @roblourens make this use the editor resolver service if possible
        editor = await editorService.openEditor(input, { pinned: true }, toSide ? SIDE_GROUP : ACTIVE_GROUP);
    }
    const searchOnType = configurationService.getValue('search').searchOnType;
    if (args.triggerSearch === true ||
        args.triggerSearch !== false && searchOnType && args.query) {
        editor.triggerSearch({ focusResults: args.focusResults });
    }
    if (!args.focusResults) {
        editor.focusSearchInput();
    }
};
export const createEditorFromSearchResult = async (accessor, searchResult, rawIncludePattern, rawExcludePattern, onlySearchInOpenEditors) => {
    if (!searchResult.query) {
        console.error('Expected searchResult.query to be defined. Got', searchResult);
        return;
    }
    const editorService = accessor.get(IEditorService);
    const telemetryService = accessor.get(ITelemetryService);
    const instantiationService = accessor.get(IInstantiationService);
    const labelService = accessor.get(ILabelService);
    const configurationService = accessor.get(IConfigurationService);
    const sortOrder = configurationService.getValue('search').sortOrder;
    telemetryService.publicLog2('searchEditor/createEditorFromSearchResult');
    const labelFormatter = (uri) => labelService.getUriLabel(uri, { relative: true });
    const { text, matchRanges, config } = serializeSearchResultForEditor(searchResult, rawIncludePattern, rawExcludePattern, 0, labelFormatter, sortOrder);
    config.onlyOpenEditors = onlySearchInOpenEditors;
    const contextLines = configurationService.getValue('search').searchEditor.defaultNumberOfContextLines;
    if (searchResult.isDirty || contextLines === 0 || contextLines === null) {
        const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { resultsContents: text, config, from: 'rawData' });
        await editorService.openEditor(input, { pinned: true });
        input.setMatchRanges(matchRanges);
    }
    else {
        const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'rawData', resultsContents: '', config: { ...config, contextLines } });
        const editor = await editorService.openEditor(input, { pinned: true });
        editor.triggerSearch();
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRWRpdG9yQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaEVkaXRvci9icm93c2VyL3NlYXJjaEVkaXRvckFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTdELE9BQU8sMEJBQTBCLENBQUM7QUFDbEMsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXhGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFOUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUcxRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN2RixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUN4SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RyxPQUFP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