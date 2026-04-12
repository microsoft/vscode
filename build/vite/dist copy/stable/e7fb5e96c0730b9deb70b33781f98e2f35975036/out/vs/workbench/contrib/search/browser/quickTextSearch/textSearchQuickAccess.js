var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { basenameOrAuthority, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { getSelectionKeyboardEvent } from '../../../../../platform/list/browser/listService.js';
import { PickerQuickAccessProvider, TriggerAction } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { DefaultQuickAccessFilterValue } from '../../../../../platform/quickinput/common/quickAccess.js';
import { QuickInputButtonLocation, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { searchDetailsIcon, searchOpenInFileIcon, searchActivityBarIcon } from '../searchIcons.js';
import { getEditorSelectionFromMatch } from '../searchView.js';
import { getOutOfWorkspaceEditorResources } from '../../common/search.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { VIEW_ID } from '../../../../services/search/common/search.js';
import { Event } from '../../../../../base/common/event.js';
import { PickerEditorState } from '../../../../browser/quickaccess.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { Sequencer } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { SearchModelImpl } from '../searchTreeModel/searchModel.js';
import { SearchModelLocation } from '../searchTreeModel/searchTreeCommon.js';
import { searchComparer } from '../searchCompare.js';
export const TEXT_SEARCH_QUICK_ACCESS_PREFIX = '%';
const DEFAULT_TEXT_QUERY_BUILDER_OPTIONS = {
    _reason: 'quickAccessSearch',
    disregardIgnoreFiles: false,
    disregardExcludeSettings: false,
    onlyOpenEditors: false,
    expandPatterns: true
};
const MAX_FILES_SHOWN = 30;
const MAX_RESULTS_PER_FILE = 10;
const DEBOUNCE_DELAY = 75;
let TextSearchQuickAccess = class TextSearchQuickAccess extends PickerQuickAccessProvider {
    _getTextQueryBuilderOptions(charsPerLine) {
        return {
            ...DEFAULT_TEXT_QUERY_BUILDER_OPTIONS,
            ...{
                extraFileResources: this._instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
                maxResults: this.configuration.maxResults ?? undefined,
                isSmartCase: this.configuration.smartCase,
            },
            previewOptions: {
                matchLines: 1,
                charsPerLine
            }
        };
    }
    constructor(_instantiationService, _contextService, _editorService, _labelService, _viewsService, _configurationService) {
        super(TEXT_SEARCH_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true, shouldSkipTrimPickFilter: true });
        this._instantiationService = _instantiationService;
        this._contextService = _contextService;
        this._editorService = _editorService;
        this._labelService = _labelService;
        this._viewsService = _viewsService;
        this._configurationService = _configurationService;
        this.currentAsyncSearch = Promise.resolve({
            results: [],
            messages: []
        });
        this.queryBuilder = this._instantiationService.createInstance(QueryBuilder);
        this.searchModel = this._register(this._instantiationService.createInstance(SearchModelImpl));
        this.editorViewState = this._register(this._instantiationService.createInstance(PickerEditorState));
        this.searchModel.location = SearchModelLocation.QUICK_ACCESS;
        this.editorSequencer = new Sequencer();
    }
    dispose() {
        this.searchModel.dispose();
        super.dispose();
    }
    provide(picker, token, runOptions) {
        const disposables = new DisposableStore();
        if (TEXT_SEARCH_QUICK_ACCESS_PREFIX.length < picker.value.length) {
            picker.valueSelection = [TEXT_SEARCH_QUICK_ACCESS_PREFIX.length, picker.value.length];
        }
        picker.buttons = [{
                location: QuickInputButtonLocation.Inline,
                iconClass: ThemeIcon.asClassName(Codicon.goToSearch),
                tooltip: localize('goToSearch', "Open in Search View")
            }];
        this.editorViewState.reset();
        disposables.add(picker.onDidTriggerButton(async () => {
            await this.moveToSearchViewlet(undefined);
            picker.hide();
        }));
        const onDidChangeActive = () => {
            const [item] = picker.activeItems;
            if (item?.match) {
                // we must remember our curret view state to be able to restore (will automatically track if there is already stored state)
                this.editorViewState.set();
                const itemMatch = item.match;
                this.editorSequencer.queue(async () => {
                    await this.editorViewState.openTransientEditor({
                        resource: itemMatch.parent().resource,
                        options: { preserveFocus: true, revealIfOpened: true, ignoreError: true, selection: itemMatch.range() }
                    });
                });
            }
        };
        disposables.add(Event.debounce(picker.onDidChangeActive, (last, event) => event, DEBOUNCE_DELAY, true)(onDidChangeActive));
        disposables.add(Event.once(picker.onWillHide)(({ reason }) => {
            // Restore view state upon cancellation if we changed it
            // but only when the picker was closed via explicit user
            // gesture and not e.g. when focus was lost because that
            // could mean the user clicked into the editor directly.
            if (reason === QuickInputHideReason.Gesture) {
                this.editorViewState.restore();
            }
        }));
        disposables.add(Event.once(picker.onDidHide)(({ reason }) => {
            this.searchModel.searchResult.toggleHighlights(false);
        }));
        disposables.add(super.provide(picker, token, runOptions));
        disposables.add(picker.onDidAccept(() => this.searchModel.searchResult.toggleHighlights(false)));
        return disposables;
    }
    get configuration() {
        const editorConfig = this._configurationService.getValue().workbench?.editor;
        const searchConfig = this._configurationService.getValue().search;
        return {
            openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
            preserveInput: searchConfig.quickAccess.preserveInput,
            maxResults: searchConfig.maxResults,
            smartCase: searchConfig.smartCase,
            sortOrder: searchConfig.sortOrder,
        };
    }
    get defaultFilterValue() {
        if (this.configuration.preserveInput) {
            return DefaultQuickAccessFilterValue.LAST;
        }
        return undefined;
    }
    doSearch(contentPattern, token) {
        if (contentPattern === '') {
            return undefined;
        }
        const folderResources = this._contextService.getWorkspace().folders;
        const content = {
            pattern: contentPattern,
        };
        this.searchModel.searchResult.toggleHighlights(false);
        const charsPerLine = content.isRegExp ? 10000 : 1000; // from https://github.com/microsoft/vscode/blob/e7ad5651ac26fa00a40aa1e4010e81b92f655569/src/vs/workbench/contrib/search/browser/searchView.ts#L1508
        const query = this.queryBuilder.text(content, folderResources.map(folder => folder.uri), this._getTextQueryBuilderOptions(charsPerLine));
        const result = this.searchModel.search(query, undefined, token);
        const getAsyncResults = async () => {
            this.currentAsyncSearch = result.asyncResults;
            await result.asyncResults;
            const syncResultURIs = new ResourceSet(result.syncResults.map(e => e.resource));
            return this.searchModel.searchResult.matches(false).filter(e => !syncResultURIs.has(e.resource));
        };
        return {
            syncResults: this.searchModel.searchResult.matches(false),
            asyncResults: getAsyncResults()
        };
    }
    async moveToSearchViewlet(currentElem) {
        // this function takes this._searchModel and moves it to the search viewlet's search model.
        // then, this._searchModel will construct a new (empty) SearchModel.
        this._viewsService.openView(VIEW_ID, false);
        const viewlet = this._viewsService.getActiveViewWithId(VIEW_ID);
        await viewlet.replaceSearchModel(this.searchModel, this.currentAsyncSearch);
        this.searchModel = this._instantiationService.createInstance(SearchModelImpl);
        this.searchModel.location = SearchModelLocation.QUICK_ACCESS;
        const viewer = viewlet?.getControl();
        if (currentElem) {
            viewer.setFocus([currentElem], getSelectionKeyboardEvent());
            viewer.setSelection([currentElem], getSelectionKeyboardEvent());
            viewer.reveal(currentElem);
        }
        else {
            viewlet.searchAndReplaceWidget.focus();
        }
    }
    _getPicksFromMatches(matches, limit, firstFile) {
        matches = matches.sort((a, b) => {
            if (firstFile) {
                if (firstFile === a.resource) {
                    return -1;
                }
                else if (firstFile === b.resource) {
                    return 1;
                }
            }
            return searchComparer(a, b, this.configuration.sortOrder);
        });
        const files = matches.length > limit ? matches.slice(0, limit) : matches;
        const picks = [];
        for (let fileIndex = 0; fileIndex < matches.length; fileIndex++) {
            if (fileIndex === limit) {
                picks.push({
                    type: 'separator',
                });
                picks.push({
                    label: localize('QuickSearchSeeMoreFiles', "See More Files"),
                    iconClass: ThemeIcon.asClassName(searchDetailsIcon),
                    accept: async () => {
                        await this.moveToSearchViewlet(matches[limit]);
                    }
                });
                break;
            }
            const iFileInstanceMatch = files[fileIndex];
            const label = basenameOrAuthority(iFileInstanceMatch.resource);
            const description = this._labelService.getUriLabel(dirname(iFileInstanceMatch.resource), { relative: true });
            picks.push({
                label,
                type: 'separator',
                description,
                buttons: [{
                        iconClass: ThemeIcon.asClassName(searchOpenInFileIcon),
                        tooltip: localize('QuickSearchOpenInFile', "Open File")
                    }],
                trigger: async () => {
                    await this.handleAccept(iFileInstanceMatch, {});
                    return TriggerAction.CLOSE_PICKER;
                },
            });
            const results = iFileInstanceMatch.matches() ?? [];
            for (let matchIndex = 0; matchIndex < results.length; matchIndex++) {
                const element = results[matchIndex];
                if (matchIndex === MAX_RESULTS_PER_FILE) {
                    picks.push({
                        label: localize('QuickSearchMore', "More"),
                        iconClass: ThemeIcon.asClassName(searchDetailsIcon),
                        accept: async () => {
                            await this.moveToSearchViewlet(element);
                        }
                    });
                    break;
                }
                const preview = element.preview();
                const previewText = (preview.before + preview.inside + preview.after).trim().substring(0, 999);
                const match = [{
                        start: preview.before.length,
                        end: preview.before.length + preview.inside.length
                    }];
                picks.push({
                    label: `${previewText}`,
                    highlights: {
                        label: match
                    },
                    buttons: [{
                            iconClass: ThemeIcon.asClassName(searchActivityBarIcon),
                            tooltip: localize('showMore', "Open in Search View"),
                        }],
                    ariaLabel: `Match at location ${element.range().startLineNumber}:${element.range().startColumn} - ${previewText}`,
                    accept: async (keyMods, event) => {
                        await this.handleAccept(iFileInstanceMatch, {
                            keyMods,
                            selection: getEditorSelectionFromMatch(element, this.searchModel),
                            preserveFocus: event.inBackground,
                            forcePinned: event.inBackground
                        });
                    },
                    trigger: async () => {
                        await this.moveToSearchViewlet(element);
                        return TriggerAction.CLOSE_PICKER;
                    },
                    match: element
                });
            }
        }
        return picks;
    }
    async handleAccept(iFileInstanceMatch, options) {
        const editorOptions = {
            preserveFocus: options.preserveFocus,
            pinned: options.keyMods?.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
            selection: options.selection
        };
        // from https://github.com/microsoft/vscode/blob/f40dabca07a1622b2a0ae3ee741cfc94ab964bef/src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts#L1037
        const targetGroup = options.keyMods?.alt || (this.configuration.openEditorPinned && options.keyMods?.ctrlCmd) || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP;
        await this._editorService.openEditor({
            resource: iFileInstanceMatch.resource,
            options: editorOptions
        }, targetGroup);
    }
    _getPicks(contentPattern, disposables, token) {
        const searchModelAtTimeOfSearch = this.searchModel;
        if (contentPattern === '') {
            this.searchModel.searchResult.clear();
            return [{
                    label: localize('enterSearchTerm', "Enter a term to search for across your files.")
                }];
        }
        const conditionalTokenCts = disposables.add(new CancellationTokenSource());
        disposables.add(token.onCancellationRequested(() => {
            if (searchModelAtTimeOfSearch.location === SearchModelLocation.QUICK_ACCESS) {
                // if the search model has not been imported to the panel, you can cancel
                conditionalTokenCts.cancel();
            }
        }));
        const allMatches = this.doSearch(contentPattern, conditionalTokenCts.token);
        if (!allMatches) {
            return null;
        }
        const matches = allMatches.syncResults;
        const syncResult = this._getPicksFromMatches(matches, MAX_FILES_SHOWN, this._editorService.activeEditor?.resource);
        if (syncResult.length > 0) {
            this.searchModel.searchResult.toggleHighlights(true);
        }
        if (matches.length >= MAX_FILES_SHOWN) {
            return syncResult;
        }
        return {
            picks: syncResult,
            additionalPicks: allMatches.asyncResults
                .then(asyncResults => (asyncResults.length + syncResult.length === 0) ? [{
                    label: localize('noAnythingResults', "No matching results")
                }] : this._getPicksFromMatches(asyncResults, MAX_FILES_SHOWN - matches.length))
                .then(picks => {
                if (picks.length > 0) {
                    this.searchModel.searchResult.toggleHighlights(true);
                }
                return picks;
            })
        };
    }
};
TextSearchQuickAccess = __decorate([
    __param(0, IInstantiationService),
    __param(1, IWorkspaceContextService),
    __param(2, IEditorService),
    __param(3, ILabelService),
    __param(4, IViewsService),
    __param(5, IConfigurationService)
], TextSearchQuickAccess);
export { TextSearchQuickAccess };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFNlYXJjaFF1aWNrQWNjZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2Jyb3dzZXIvcXVpY2tUZXh0U2VhcmNoL3RleHRTZWFyY2hRdWlja0FjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUUsT0FBTyxFQUFzQyx5QkFBeUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3BJLE9BQU8sRUFBeUUseUJBQXlCLEVBQVMsYUFBYSxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDek0sT0FBTyxFQUFFLDZCQUE2QixFQUFrQyxNQUFNLDBEQUEwRCxDQUFDO0FBQ3pJLE9BQU8sRUFBd0Msd0JBQXdCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvSixPQUFPLEVBQUUsd0JBQXdCLEVBQW9CLE1BQU0sdURBQXVELENBQUM7QUFF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