/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { extname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from '../../../../editor/contrib/find/browser/findModel.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions, DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getSearchView } from '../../search/browser/searchActionsBase.js';
import { searchNewEditorIcon, searchRefreshIcon } from '../../search/browser/searchIcons.js';
import * as SearchConstants from '../../search/common/constants.js';
import * as SearchEditorConstants from './constants.js';
import { SearchEditor } from './searchEditor.js';
import { createEditorFromSearchResult, modifySearchEditorContextLinesCommand, openNewSearchEditor, openSearchEditor, selectAllSearchEditorMatchesCommand, toggleSearchEditorCaseSensitiveCommand, toggleSearchEditorContextLinesCommand, toggleSearchEditorRegexCommand, toggleSearchEditorWholeWordCommand } from './searchEditorActions.js';
import { getOrMakeSearchEditorInput, SearchEditorInput, SEARCH_EDITOR_EXT } from './searchEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { VIEW_ID } from '../../../services/search/common/search.js';
import { RegisteredEditorPriority, IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getActiveElement } from '../../../../base/browser/dom.js';
const OpenInEditorCommandId = 'search.action.openInEditor';
const OpenNewEditorToSideCommandId = 'search.action.openNewEditorToSide';
const FocusQueryEditorWidgetCommandId = 'search.action.focusQueryEditorWidget';
const FocusQueryEditorFilesToIncludeCommandId = 'search.action.focusFilesToInclude';
const FocusQueryEditorFilesToExcludeCommandId = 'search.action.focusFilesToExclude';
const ToggleSearchEditorCaseSensitiveCommandId = 'toggleSearchEditorCaseSensitive';
const ToggleSearchEditorWholeWordCommandId = 'toggleSearchEditorWholeWord';
const ToggleSearchEditorRegexCommandId = 'toggleSearchEditorRegex';
const IncreaseSearchEditorContextLinesCommandId = 'increaseSearchEditorContextLines';
const DecreaseSearchEditorContextLinesCommandId = 'decreaseSearchEditorContextLines';
const RerunSearchEditorSearchCommandId = 'rerunSearchEditorSearch';
const CleanSearchEditorStateCommandId = 'cleanSearchEditorState';
const SelectAllSearchEditorMatchesCommandId = 'selectAllSearchEditorMatches';
//#region Editor Descriptior
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(SearchEditor, SearchEditor.ID, localize('searchEditor', "Search Editor")), [
    new SyncDescriptor(SearchEditorInput)
]);
//#endregion
//#region Startup Contribution
let SearchEditorContribution = class SearchEditorContribution {
    static { this.ID = 'workbench.contrib.searchEditor'; }
    constructor(editorResolverService, instantiationService) {
        editorResolverService.registerEditor('*' + SEARCH_EDITOR_EXT, {
            id: SearchEditorInput.ID,
            label: localize('promptOpenWith.searchEditor.displayName', "Search Editor"),
            detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
            priority: RegisteredEditorPriority.default,
        }, {
            singlePerResource: true,
            canSupportResource: resource => (extname(resource) === SEARCH_EDITOR_EXT)
        }, {
            createEditorInput: ({ resource }) => {
                return { editor: instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'existingFile', fileUri: resource }) };
            }
        });
    }
};
SearchEditorContribution = __decorate([
    __param(0, IEditorResolverService),
    __param(1, IInstantiationService)
], SearchEditorContribution);
registerWorkbenchContribution2(SearchEditorContribution.ID, SearchEditorContribution, 1 /* WorkbenchPhase.BlockStartup */);
class SearchEditorInputSerializer {
    canSerialize(input) {
        return !!input.tryReadConfigSync();
    }
    serialize(input) {
        if (!this.canSerialize(input)) {
            return undefined;
        }
        if (input.isDisposed()) {
            return JSON.stringify({ modelUri: undefined, dirty: false, config: input.tryReadConfigSync(), name: input.getName(), matchRanges: [], backingUri: input.backingUri?.toString() });
        }
        let modelUri = undefined;
        if (input.modelUri.path || input.modelUri.fragment && input.isDirty()) {
            modelUri = input.modelUri.toString();
        }
        const config = input.tryReadConfigSync();
        const dirty = input.isDirty();
        const matchRanges = dirty ? input.getMatchRanges() : [];
        const backingUri = input.backingUri;
        return JSON.stringify({ modelUri, dirty, config, name: input.getName(), matchRanges, backingUri: backingUri?.toString() });
    }
    deserialize(instantiationService, serializedEditorInput) {
        const { modelUri, dirty, config, matchRanges, backingUri } = JSON.parse(serializedEditorInput);
        if (config && (config.query !== undefined)) {
            if (modelUri) {
                const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'model', modelUri: URI.parse(modelUri), config, backupOf: backingUri ? URI.parse(backingUri) : undefined });
                input.setDirty(dirty);
                input.setMatchRanges(matchRanges);
                return input;
            }
            else {
                if (backingUri) {
                    return instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'existingFile', fileUri: URI.parse(backingUri) });
                }
                else {
                    return instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'rawData', resultsContents: '', config });
                }
            }
        }
        return undefined;
    }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(SearchEditorInput.ID, SearchEditorInputSerializer);
//#endregion
//#region Commands
CommandsRegistry.registerCommand(CleanSearchEditorStateCommandId, (accessor) => {
    const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
    if (activeEditorPane instanceof SearchEditor) {
        activeEditorPane.cleanState();
    }
});
//#endregion
//#region Actions
const category = localize2('search', 'Search Editor');
const translateLegacyConfig = (legacyConfig = {}) => {
    const config = {};
    const overrides = {
        includes: 'filesToInclude',
        excludes: 'filesToExclude',
        wholeWord: 'matchWholeWord',
        caseSensitive: 'isCaseSensitive',
        regexp: 'isRegexp',
        useIgnores: 'useExcludeSettingsAndIgnoreFiles',
    };
    Object.entries(legacyConfig).forEach(([key, value]) => {
        // eslint-disable-next-line local/code-no-any-casts
        config[overrides[key] ?? key] = value;
    });
    return config;
};
const openArgMetadata = {
    description: 'Open a new search editor. Arguments passed can include variables like ${relativeFileDirname}.',
    args: [{
            name: 'Open new Search Editor args',
            schema: {
                properties: {
                    query: { type: 'string' },
                    filesToInclude: { type: 'string' },
                    filesToExclude: { type: 'string' },
                    contextLines: { type: 'number' },
                    matchWholeWord: { type: 'boolean' },
                    isCaseSensitive: { type: 'boolean' },
                    isRegexp: { type: 'boolean' },
                    useExcludeSettingsAndIgnoreFiles: { type: 'boolean' },
                    showIncludesExcludes: { type: 'boolean' },
                    triggerSearch: { type: 'boolean' },
                    focusResults: { type: 'boolean' },
                    onlyOpenEditors: { type: 'boolean' },
                }
            }
        }]
};
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'search.searchEditor.action.deleteFileResults',
            title: localize2('searchEditor.deleteResultBlock', 'Delete File Results'),
            keybinding: {
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 1 /* KeyCode.Backspace */,
            },
            precondition: SearchEditorConstants.InSearchEditor,
            category,
            f1: true,
        });
    }
    async run(accessor) {
        const contextService = accessor.get(IContextKeyService).getContext(getActiveElement());
        if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
            accessor.get(IEditorService).activeEditorPane.deleteResultBlock();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SearchEditorConstants.OpenNewEditorCommandId,
            title: localize2('search.openNewSearchEditor', 'New Search Editor'),
            category,
            f1: true,
            metadata: openArgMetadata
        });
    }
    async run(accessor, args) {
        await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig({ location: 'new', ...args }));
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SearchEditorConstants.OpenEditorCommandId,
            title: localize2('search.openSearchEditor', 'Open Search Editor'),
            category,
            f1: true,
            metadata: openArgMetadata
        });
    }
    async run(accessor, args) {
        await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig({ location: 'reuse', ...args }));
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: OpenNewEditorToSideCommandId,
            title: localize2('search.openNewEditorToSide', 'Open New Search Editor to the Side'),
            category,
            f1: true,
            metadata: openArgMetadata
        });
    }
    async run(accessor, args) {
        await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig(args), true);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: OpenInEditorCommandId,
            title: localize2('search.openResultsInEditor', 'Open Results in Editor'),
            category,
            f1: true,
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */,
                when: ContextKeyExpr.and(SearchConstants.SearchContext.HasSearchResults, SearchConstants.SearchContext.SearchViewFocusedKey),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */
                }
            },
        });
    }
    async run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const instantiationService = accessor.get(IInstantiationService);
        const searchView = getSearchView(viewsService);
        if (searchView) {
            await instantiationService.invokeFunction(createEditorFromSearchResult, searchView.searchResult, searchView.searchIncludePattern.getValue(), searchView.searchExcludePattern.getValue(), searchView.searchIncludePattern.onlySearchInOpenEditors());
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: RerunSearchEditorSearchCommandId,
            title: localize2('search.rerunSearchInEditor', 'Search Again'),
            category,
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 48 /* KeyCode.KeyR */,
                when: SearchEditorConstants.InSearchEditor,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            icon: searchRefreshIcon,
            menu: [...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map(id => ({
                    id,
                    group: 'navigation',
                    when: ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID)
                })),
                {
                    id: MenuId.CommandPalette,
                    when: ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID)
                }]
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const input = editorService.activeEditor;
        if (input instanceof SearchEditorInput) {
            editorService.activeEditorPane.triggerSearch({ resetCursor: false });
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: FocusQueryEditorWidgetCommandId,
            title: localize2('search.action.focusQueryEditorWidget', 'Focus Search Editor Input'),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
            keybinding: {
                primary: 9 /* KeyCode.Escape */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const input = editorService.activeEditor;
        if (input instanceof SearchEditorInput) {
            editorService.activeEditorPane.focusSearchInput();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: FocusQueryEditorFilesToIncludeCommandId,
            title: localize2('search.action.focusFilesToInclude', 'Focus Search Editor Files to Include'),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const input = editorService.activeEditor;
        if (input instanceof SearchEditorInput) {
            editorService.activeEditorPane.focusFilesToIncludeInput();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: FocusQueryEditorFilesToExcludeCommandId,
            title: localize2('search.action.focusFilesToExclude', 'Focus Search Editor Files to Exclude'),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const input = editorService.activeEditor;
        if (input instanceof SearchEditorInput) {
            editorService.activeEditorPane.focusFilesToExcludeInput();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: ToggleSearchEditorCaseSensitiveCommandId,
            title: localize2('searchEditor.action.toggleSearchEditorCaseSensitive', 'Toggle Match Case'),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
            keybinding: Object.assign({
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: SearchConstants.SearchContext.SearchInputBoxFocusedKey,
            }, ToggleCaseSensitiveKeybinding)
        });
    }
    run(accessor) {
        toggleSearchEditorCaseSensitiveCommand(accessor);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: ToggleSearchEditorWholeWordCommandId,
            title: localize2('searchEditor.action.toggleSearchEditorWholeWord', 'Toggle Match Whole Word'),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
            keybinding: Object.assign({
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: SearchConstants.SearchContext.SearchInputBoxFocusedKey,
            }, ToggleWholeWordKeybinding)
        });
    }
    run(accessor) {
        toggleSearchEditorWholeWordCommand(accessor);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: ToggleSearchEditorRegexCommandId,
            title: localize2('searchEditor.action.toggleSearchEditorRegex', "Toggle Use Regular Expression"),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
            keybinding: Object.assign({
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: SearchConstants.SearchContext.SearchInputBoxFocusedKey,
            }, ToggleRegexKeybinding)
        });
    }
    run(accessor) {
        toggleSearchEditorRegexCommand(accessor);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SearchEditorConstants.ToggleSearchEditorContextLinesCommandId,
            title: localize2('searchEditor.action.toggleSearchEditorContextLines', "Toggle Context Lines"),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 512 /* KeyMod.Alt */ | 42 /* KeyCode.KeyL */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 42 /* KeyCode.KeyL */ }
            }
        });
    }
    run(accessor) {
        toggleSearchEditorContextLinesCommand(accessor);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: IncreaseSearchEditorContextLinesCommandId,
            title: localize2('searchEditor.action.increaseSearchEditorContextLines', "Increase Context Lines"),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 512 /* KeyMod.Alt */ | 86 /* KeyCode.Equal */
            }
        });
    }
    run(accessor) { modifySearchEditorContextLinesCommand(accessor, true); }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: DecreaseSearchEditorContextLinesCommandId,
            title: localize2('searchEditor.action.decreaseSearchEditorContextLines', "Decrease Context Lines"),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 512 /* KeyMod.Alt */ | 88 /* KeyCode.Minus */
            }
        });
    }
    run(accessor) { modifySearchEditorContextLinesCommand(accessor, false); }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SelectAllSearchEditorMatchesCommandId,
            title: localize2('searchEditor.action.selectAllSearchEditorMatches', "Select All Matches"),
            category,
            f1: true,
            precondition: SearchEditorConstants.InSearchEditor,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 42 /* KeyCode.KeyL */,
            }
        });
    }
    run(accessor) {
        selectAllSearchEditorMatchesCommand(accessor);
    }
});
registerAction2(class OpenSearchEditorAction extends Action2 {
    constructor() {
        super({
            id: 'search.action.openNewEditorFromView',
            title: localize('search.openNewEditor', "Open New Search Editor"),
            category,
            icon: searchNewEditorIcon,
            menu: [{
                    id: MenuId.ViewTitle,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.equals('view', VIEW_ID),
                }]
        });
    }
    run(accessor, ...args) {
        return openSearchEditor(accessor);
    }
});
//#endregion
//#region Search Editor Working Copy Editor Handler
let SearchEditorWorkingCopyEditorHandler = class SearchEditorWorkingCopyEditorHandler extends Disposable {
    static { this.ID = 'workbench.contrib.searchEditorWorkingCopyEditorHandler'; }
    constructor(instantiationService, workingCopyEditorService) {
        super();
        this.instantiationService = instantiationService;
        this._register(workingCopyEditorService.registerHandler(this));
    }
    handles(workingCopy) {
        return workingCopy.resource.scheme === SearchEditorConstants.SearchEditorScheme;
    }
    isOpen(workingCopy, editor) {
        if (!this.handles(workingCopy)) {
            return false;
        }
        return editor instanceof SearchEditorInput && isEqual(workingCopy.resource, editor.modelUri);
    }
    createEditor(workingCopy) {
        const input = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: 'model', modelUri: workingCopy.resource });
        input.setDirty(true);
        return input;
    }
};
SearchEditorWorkingCopyEditorHandler = __decorate([
    __param(0, IInstantiationService),
    __param(1, IWorkingCopyEditorService)
], SearchEditorWorkingCopyEditorHandler);
registerWorkbenchContribution2(SearchEditorWorkingCopyEditorHandler.ID, SearchEditorWorkingCopyEditorHandler, 2 /* WorkbenchPhase.BlockRestore */);
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRWRpdG9yLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaEVkaXRvci9icm93c2VyL3NlYXJjaEVkaXRvci5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHckQsT0FBTyxFQUFFLDZCQUE2QixFQUFFLHFCQUFxQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdkosT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsb0JBQW9CLEVBQXVCLE1BQU0sNEJBQTRCLENBQUM7QUFDdkYsT0FBTyxFQUEwQyw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFILE9BQU8sRUFBNkMsZ0JBQWdCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztB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