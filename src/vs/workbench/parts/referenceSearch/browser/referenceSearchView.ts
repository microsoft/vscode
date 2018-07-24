/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { $, Builder } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { IAction } from 'vs/base/common/actions';
import * as errors from 'vs/base/common/errors';
import { debounceEvent, Emitter } from 'vs/base/common/event';
import * as paths from 'vs/base/common/paths';
import * as env from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFocusEvent, ITree } from 'vs/base/parts/tree/browser/tree';
import 'vs/css!./media/referenceSearchview';
import { ICodeEditor, isDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import * as nls from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TreeResourceNavigator, WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IReferenceSearchQueryInfo, IReferenceSearchComplete, IReferenceSearchProgressItem, VIEW_ID } from 'vs/workbench/parts/referenceSearch/common/referenceSearch';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { diffInserted, diffInsertedOutline, diffRemoved, diffRemovedOutline, editorFindMatchHighlight, editorFindMatchHighlightBorder } from 'vs/platform/theme/common/colorRegistry';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { OpenFileFolderAction, OpenFolderAction } from 'vs/workbench/browser/actions/workspaceActions';
import { SimpleFileResourceDragAndDrop } from 'vs/workbench/browser/dnd';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { IPanel } from 'vs/workbench/common/panel';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { CancelReferenceSearchAction, ClearReferenceSearchResultsAction, CollapseDeepestExpandedLevelAction, RefreshAction } from 'vs/workbench/parts/referenceSearch/browser/referenceSearchActions';
import { ReferenceSearchAccessibilityProvider, ReferenceSearchDataSource, ReferenceSearchFilter, ReferenceSearchRenderer, ReferenceSearchSorter, ReferenceSearchTreeController } from 'vs/workbench/parts/referenceSearch/browser/referenceSearchResultsView';
import * as Constants from 'vs/workbench/parts/referenceSearch/common/constants';
import { FileMatch, FileMatchOrMatch, FolderMatch, IChangeEvent, IReferenceSearchWorkbenchService, Match, ReferenceSearchModel } from 'vs/workbench/parts/referenceSearch/common/referenceSearchModel';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';

export class ReferenceSearchView extends Viewlet implements IViewlet, IPanel {

	private static readonly WIDE_CLASS_NAME = 'wide';
	private static readonly WIDE_VIEW_SIZE = 600;

	private isDisposed: boolean;

	private viewModel: ReferenceSearchModel;

	private viewletVisible: IContextKey<boolean>;
	private firstMatchFocused: IContextKey<boolean>;
	private fileMatchOrMatchFocused: IContextKey<boolean>;
	private fileMatchOrFolderMatchFocus: IContextKey<boolean>;
	private fileMatchFocused: IContextKey<boolean>;
	private folderMatchFocused: IContextKey<boolean>;
	private matchFocused: IContextKey<boolean>;
	private hasReferenceSearchResultsKey: IContextKey<boolean>;

	private referenceSearchSubmitted: boolean;
	private referenceSearching: boolean;

	private actions: (RefreshAction | CollapseDeepestExpandedLevelAction | ClearReferenceSearchResultsAction | CancelReferenceSearchAction)[] = [];
	private tree: WorkbenchTree;
	private messages: Builder;
	private size: dom.Dimension;
	private results: Builder;

	private currentSelectedFileMatch: FileMatch;

	private readonly selectCurrentMatchEmitter: Emitter<string>;
	private changedWhileHidden: boolean;

	private referenceSearchWithoutFolderMessageBuilder: Builder;

	private queryInfo: IReferenceSearchQueryInfo;

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService private fileService: IFileService,
		@IEditorService private editorService: IEditorService,
		@IProgressService private progressService: IProgressService,
		@IStorageService storageService: IStorageService,
		@IContextViewService contextViewService: IContextViewService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IReferenceSearchWorkbenchService private referenceSearchWorkbenchService: IReferenceSearchWorkbenchService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IThemeService protected themeService: IThemeService
	) {
		super(VIEW_ID, partService, telemetryService, themeService);

		this.viewletVisible = Constants.ReferenceSearchViewVisibleKey.bindTo(contextKeyService);
		this.firstMatchFocused = Constants.FirstMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchOrMatchFocused = Constants.FileMatchOrMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchOrFolderMatchFocus = Constants.FileMatchOrFolderMatchFocusKey.bindTo(contextKeyService);
		this.fileMatchFocused = Constants.FileFocusKey.bindTo(contextKeyService);
		this.folderMatchFocused = Constants.FolderFocusKey.bindTo(contextKeyService);
		this.matchFocused = Constants.MatchFocusKey.bindTo(this.contextKeyService);
		this.hasReferenceSearchResultsKey = Constants.HasReferenceSearchResults.bindTo(this.contextKeyService);

		this._register(this.fileService.onFileChanges(e => this.onFilesChanged(e)));
		this._register(this.untitledEditorService.onDidChangeDirty(e => this.onUntitledDidChangeDirty(e)));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));

		this.selectCurrentMatchEmitter = new Emitter<string>();
		debounceEvent(this.selectCurrentMatchEmitter.event, (l, e) => e, 100, /*leading=*/true)
			(() => this.selectCurrentMatch());
	}

	private onDidChangeWorkbenchState(): void {
		if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.referenceSearchWithoutFolderMessageBuilder) {
			this.referenceSearchWithoutFolderMessageBuilder.hide();
		}
	}

	public create(parent: HTMLElement): TPromise<void> {
		super.create(parent);

		this.viewModel = this._register(this.referenceSearchWorkbenchService.referenceSearchModel);
		let builder: Builder;
		$(parent).div({
			'class': 'referenceSearch-view'
		}, (div) => {
			builder = div;
		});

		this.messages = builder.div({ 'class': 'messages' }).hide().clone();
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.referenceSearchWithoutFolderMessage(this.clearMessage());
		}

		this.createReferenceSearchResultsView(builder);

		this.actions = [
			this.instantiationService.createInstance(RefreshAction, RefreshAction.ID, RefreshAction.LABEL),
			this.instantiationService.createInstance(CollapseDeepestExpandedLevelAction, CollapseDeepestExpandedLevelAction.ID, CollapseDeepestExpandedLevelAction.LABEL),
			this.instantiationService.createInstance(ClearReferenceSearchResultsAction, ClearReferenceSearchResultsAction.ID, ClearReferenceSearchResultsAction.LABEL)
		];

		this._register(this.viewModel.referenceSearchResult.onChange((event) => this.onReferenceSearchResultsChanged(event)));

		return TPromise.as(null);
	}

	private updateActions(): void {
		for (const action of this.actions) {
			action.update();
		}
	}

	private onReferenceSearchResultsChanged(event?: IChangeEvent): TPromise<any> {
		if (this.isVisible()) {
			return this.refreshAndUpdateCount(event);
		} else {
			this.changedWhileHidden = true;
			return TPromise.wrap(null);
		}
	}

	private refreshAndUpdateCount(event?: IChangeEvent): TPromise<void> {
		return this.refreshTree(event).then(() => {
			this.updateReferenceSearchResultCount();
		});
	}

	private refreshTree(event?: IChangeEvent): TPromise<any> {
		if (!event || event.added || event.removed) {
			return this.tree.refresh(this.viewModel.referenceSearchResult);
		} else {
			if (event.elements.length === 1) {
				return this.tree.refresh(event.elements[0]);
			} else {
				return this.tree.refresh(event.elements);
			}
		}
	}

	private clearMessage(): Builder {
		this.referenceSearchWithoutFolderMessageBuilder = void 0;

		return this.messages.empty().show()
			.asContainer().div({ 'class': 'message' })
			.asContainer();
	}

	private createReferenceSearchResultsView(builder: Builder): void {
		builder.div({ 'class': 'results' }, (div) => {
			this.results = div;
			this.results.addClass('show-file-icons');

			let dataSource = this._register(this.instantiationService.createInstance(ReferenceSearchDataSource));
			let renderer = this._register(this.instantiationService.createInstance(ReferenceSearchRenderer, this.getActionRunner()));
			let dnd = this.instantiationService.createInstance(SimpleFileResourceDragAndDrop, (obj: any) => obj instanceof FileMatch ? obj.resource() : void 0);

			this.tree = this._register(this.instantiationService.createInstance(WorkbenchTree, div.getHTMLElement(), {
				dataSource: dataSource,
				renderer: renderer,
				sorter: new ReferenceSearchSorter(),
				filter: new ReferenceSearchFilter(),
				controller: this.instantiationService.createInstance(ReferenceSearchTreeController),
				accessibilityProvider: this.instantiationService.createInstance(ReferenceSearchAccessibilityProvider),
				dnd
			}, {
					ariaLabel: nls.localize('treeAriaLabel', "ReferenceSearch Results"),
					showLoading: false
				}));

			this.tree.setInput(this.viewModel.referenceSearchResult);

			const referenceSearchResultsNavigator = this._register(new TreeResourceNavigator(this.tree, { openOnFocus: true }));
			this._register(debounceEvent(referenceSearchResultsNavigator.openResource, (last, event) => event, 75, true)(options => {
				if (options.element instanceof Match) {
					let selectedMatch: Match = options.element;
					if (this.currentSelectedFileMatch) {
						this.currentSelectedFileMatch.setSelectedMatch(null);
					}
					this.currentSelectedFileMatch = selectedMatch.parent();
					this.currentSelectedFileMatch.setSelectedMatch(selectedMatch);
					if (!(options.payload && options.payload.preventEditorOpen)) {
						this.onFocus(selectedMatch, options.editorOptions.preserveFocus, options.sideBySide, options.editorOptions.pinned);
					}
				}
			}));

			let treeHasFocus = false;
			this.tree.onDidFocus(() => {
				treeHasFocus = true;
			});

			this._register(this.tree.onDidChangeFocus((e: IFocusEvent) => {
				if (treeHasFocus) {
					const focus = e.focus;
					this.firstMatchFocused.set(this.tree.getNavigator().first() === focus);
					this.fileMatchOrMatchFocused.set(!!focus);
					this.fileMatchFocused.set(focus instanceof FileMatch);
					this.folderMatchFocused.set(focus instanceof FolderMatch);
					this.matchFocused.set(focus instanceof Match);
					this.fileMatchOrFolderMatchFocus.set(focus instanceof FileMatch || focus instanceof FolderMatch);
				}
			}));

			this._register(this.tree.onDidBlur(e => {
				treeHasFocus = false;
				this.firstMatchFocused.reset();
				this.fileMatchOrMatchFocused.reset();
				this.fileMatchFocused.reset();
				this.folderMatchFocused.reset();
				this.matchFocused.reset();
				this.fileMatchOrFolderMatchFocus.reset();
			}));
		});
	}

	public selectCurrentMatch(): void {
		const focused = this.tree.getFocus();
		const eventPayload = { focusEditor: true };
		this.tree.setSelection([focused], eventPayload);
	}

	public selectNextMatch(): void {
		const [selected]: FileMatchOrMatch[] = this.tree.getSelection();

		// Expand the initial selected node, if needed
		if (selected instanceof FileMatch) {
			if (!this.tree.isExpanded(selected)) {
				this.tree.expand(selected);
			}
		}

		let navigator = this.tree.getNavigator(selected, /*subTreeOnly=*/false);

		let next = navigator.next();
		if (!next) {
			// Reached the end - get a new navigator from the root.
			// .first and .last only work when subTreeOnly = true. Maybe there's a simpler way.
			navigator = this.tree.getNavigator(this.tree.getInput(), /*subTreeOnly*/true);
			next = navigator.first();
		}

		// Expand and go past FileMatch nodes
		if (!(next instanceof Match)) {
			if (!this.tree.isExpanded(next)) {
				this.tree.expand(next);
			}

			// Select the FileMatch's first child
			next = navigator.next();
		}

		// Reveal the newly selected element
		if (next) {
			const eventPayload = { preventEditorOpen: true };
			this.tree.setFocus(next, eventPayload);
			this.tree.setSelection([next], eventPayload);
			this.tree.reveal(next);
			this.selectCurrentMatchEmitter.fire();
		}
	}

	public selectPreviousMatch(): void {
		const [selected]: FileMatchOrMatch[] = this.tree.getSelection();
		let navigator = this.tree.getNavigator(selected, /*subTreeOnly=*/false);

		let prev = navigator.previous();

		// Expand and go past FileMatch nodes
		if (!(prev instanceof Match)) {
			prev = navigator.previous();
			if (!prev) {
				// Wrap around. Get a new tree starting from the root
				navigator = this.tree.getNavigator(this.tree.getInput(), /*subTreeOnly*/true);
				prev = navigator.last();

				// This is complicated because .last will set the navigator to the last FileMatch,
				// so expand it and FF to its last child
				this.tree.expand(prev);
				let tmp;
				while (tmp = navigator.next()) {
					prev = tmp;
				}
			}

			if (!(prev instanceof Match)) {
				// There is a second non-Match result, which must be a collapsed FileMatch.
				// Expand it then select its last child.
				navigator.next();
				this.tree.expand(prev);
				prev = navigator.previous();
			}
		}

		// Reveal the newly selected element
		if (prev) {
			const eventPayload = { preventEditorOpen: true };
			this.tree.setFocus(prev, eventPayload);
			this.tree.setSelection([prev], eventPayload);
			this.tree.reveal(prev);
			this.selectCurrentMatchEmitter.fire();
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		let promise: TPromise<void>;
		this.viewletVisible.set(visible);
		if (visible) {
			if (this.changedWhileHidden) {
				// Render if results changed while viewlet was hidden - #37818
				this.refreshAndUpdateCount();
				this.changedWhileHidden = false;
			}

			promise = super.setVisible(visible);
			this.tree.onVisible();
		} else {
			this.tree.onHidden();
			promise = super.setVisible(visible);
		}

		// Enable highlights if there are referenceSearchresults
		if (this.viewModel) {
			this.viewModel.referenceSearchResult.toggleHighlights(visible);
		}

		// Open focused element from results in case the editor area is otherwise empty
		if (visible && !this.editorService.activeEditor) {
			let focus = this.tree.getFocus();
			if (focus) {
				this.onFocus(focus, true);
			}
		}

		return promise;
	}

	public moveFocusToResults(): void {
		this.tree.domFocus();
	}

	public startReferenceSearch(): void {
		this.queryInfo = this.getSearchPatternFromEditor();
		this.onQueryChanged(true);
	}

	private getSearchPatternFromEditor(): IReferenceSearchQueryInfo {
		if (!this.editorService.activeEditor) {
			return null;
		}

		let activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (isDiffEditor(activeTextEditorWidget)) {
			if (activeTextEditorWidget.getOriginalEditor().hasTextFocus()) {
				activeTextEditorWidget = activeTextEditorWidget.getOriginalEditor();
			} else {
				activeTextEditorWidget = activeTextEditorWidget.getModifiedEditor();
			}
		}

		if (!isCodeEditor(activeTextEditorWidget)) {
			return null;
		}

		const range = activeTextEditorWidget.getSelection();
		if (!range) {
			return null;
		}

		return {
			uri: activeTextEditorWidget.getModel().uri,
			position: range.getPosition(),
		};
	}

	private reLayout(): void {
		if (this.isDisposed) {
			return;
		}

		if (this.size.width >= ReferenceSearchView.WIDE_VIEW_SIZE) {
			dom.addClass(this.getContainer(), ReferenceSearchView.WIDE_CLASS_NAME);
		} else {
			dom.removeClass(this.getContainer(), ReferenceSearchView.WIDE_CLASS_NAME);
		}

		const messagesSize = this.messages.isHidden() ? 0 : dom.getTotalHeight(this.messages.getHTMLElement());
		const referenceSearchResultContainerSize = this.size.height - messagesSize;

		this.results.style({ height: referenceSearchResultContainerSize + 'px' });

		this.tree.layout(referenceSearchResultContainerSize);
	}

	public layout(dimension: dom.Dimension): void {
		this.size = dimension;
		this.reLayout();
	}

	public getControl(): ITree {
		return this.tree;
	}

	public isReferenceSearchSubmitted(): boolean {
		return this.referenceSearchSubmitted;
	}

	public isReferenceSearching(): boolean {
		return this.referenceSearching;
	}

	public hasReferenceSearchResults(): boolean {
		return !this.viewModel.referenceSearchResult.isEmpty();
	}

	public clearReferenceSearchResults(): void {
		this.viewModel.referenceSearchResult.clear();
		this.showEmptyStage();
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.referenceSearchWithoutFolderMessage(this.clearMessage());
		}
		this.viewModel.cancelReferenceSearch();
	}

	public cancelReferenceSearch(): boolean {
		if (this.viewModel.cancelReferenceSearch()) {
			return true;
		}
		return false;
	}

	public referenceSearchInFolders(resources: URI[], pathToRelative: (from: string, to: string) => string): void {
		const folderPaths: string[] = [];
		const workspace = this.contextService.getWorkspace();

		if (resources) {
			resources.forEach(resource => {
				let folderPath: string;
				if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
					// Show relative path from the root for single-root mode
					folderPath = paths.normalize(pathToRelative(workspace.folders[0].uri.fsPath, resource.fsPath));
					if (folderPath && folderPath !== '.') {
						folderPath = './' + folderPath;
					}
				} else {
					const owningFolder = this.contextService.getWorkspaceFolder(resource);
					if (owningFolder) {
						const owningRootBasename = paths.basename(owningFolder.uri.fsPath);

						// If this root is the only one with its basename, use a relative ./ path. If there is another, use an absolute path
						const isUniqueFolder = workspace.folders.filter(folder => paths.basename(folder.uri.fsPath) === owningRootBasename).length === 1;
						if (isUniqueFolder) {
							folderPath = `./${owningRootBasename}/${paths.normalize(pathToRelative(owningFolder.uri.fsPath, resource.fsPath))}`;
						} else {
							folderPath = resource.fsPath;
						}
					}
				}

				if (folderPath) {
					folderPaths.push(folderPath);
				}
			});
		}

		if (!folderPaths.length || folderPaths.some(folderPath => folderPath === '.')) {
			return;
		}
	}

	public onQueryChanged(rerunQuery: boolean, preserveFocus?: boolean): void {
		if (!rerunQuery) {
			return;
		}

		try {
			this.onQueryTriggered(this.queryInfo);
		} catch (err) {
			this.viewModel.referenceSearchResult.clear();
		}
	}

	private onQueryTriggered(queryInfo: IReferenceSearchQueryInfo): void {
		this.viewModel.cancelReferenceSearch();

		// Progress total is 100.0% for more progress bar granularity
		let progressTotal = 1000;
		let progressWorked = 0;

		let progressRunner = this.progressService.show(progressTotal);

		this.referenceSearching = true;
		setTimeout(() => {
			if (this.referenceSearching) {
				this.changeActionAtPosition(0, this.instantiationService.createInstance(CancelReferenceSearchAction, CancelReferenceSearchAction.ID, CancelReferenceSearchAction.LABEL));
			}
		}, 2000);
		this.showEmptyStage();

		let onComplete = (completed?: IReferenceSearchComplete) => {
			this.referenceSearching = false;
			this.changeActionAtPosition(0, this.instantiationService.createInstance(RefreshAction, RefreshAction.ID, RefreshAction.LABEL));

			// Complete up to 100% as needed
			if (completed) {
				progressRunner.worked(progressTotal - progressWorked);
				setTimeout(() => progressRunner.done(), 200);
			} else {
				progressRunner.done();
			}

			// Do final render, then expand if just 1 file with less than 50 matches
			this.onReferenceSearchResultsChanged().then(() => {
				if (this.viewModel.referenceSearchResult.count() === 1) {
					const onlyMatch = this.viewModel.referenceSearchResult.matches()[0];
					if (onlyMatch.count() < 50) {
						return this.tree.expand(onlyMatch);
					}
				}

				return null;
			}).done(null, errors.onUnexpectedError);

			let hasResults = !this.viewModel.referenceSearchResult.isEmpty();

			this.referenceSearchSubmitted = true;
			this.updateActions();

			if (!hasResults) {
				let message: string;

				if (!completed) {
					message = nls.localize('referenceSearchCanceled', "ReferenceSearch was canceled before any results could be found - ");
				} else {
					message = nls.localize('noResultsFound', "No results found");
				}

				// Indicate as status to ARIA
				aria.status(message);

				this.tree.onHidden();
				this.results.hide();
				const div = this.clearMessage();
				const p = $(div).p({ text: message });

				if (!completed) {
					$(p).a({
						'class': ['pointer', 'prominent'],
						text: nls.localize('rerunReferenceSearch.message', "ReferenceSearch again")
					}).on(dom.EventType.CLICK, (e: MouseEvent) => {
						dom.EventHelper.stop(e, false);

						this.onQueryChanged(true);
					});
				}

				if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
					this.referenceSearchWithoutFolderMessage(div);
				}
			} else {
				this.viewModel.referenceSearchResult.toggleHighlights(true); // show highlights

				// Indicate final referenceSearch result count for ARIA
				aria.status(nls.localize('ariaReferenceSearchResultsStatus', "ReferenceSearch returned {0} results in {1} files", this.viewModel.referenceSearchResult.count(), this.viewModel.referenceSearchResult.fileCount()));
			}
		};

		let onError = (e: any) => {
			if (errors.isPromiseCanceledError(e)) {
				onComplete(null);
			} else {
				this.referenceSearching = false;
				this.changeActionAtPosition(0, this.instantiationService.createInstance(RefreshAction, RefreshAction.ID, RefreshAction.LABEL));
				progressRunner.done();
				this.viewModel.referenceSearchResult.clear();
			}
		};

		let total: number = 0;
		let worked: number = 0;
		let visibleMatches = 0;
		let onProgress = (p: IReferenceSearchProgressItem) => {
			// Progress
			if (p.total) {
				total = p.total;
			}
			if (p.worked) {
				worked = p.worked;
			}
		};

		// Handle UI updates in an interval to show frequent progress and results
		let uiRefreshHandle = setInterval(() => {
			if (!this.referenceSearching) {
				window.clearInterval(uiRefreshHandle);
				return;
			}

			// Progress bar update
			let fakeProgress = true;
			if (total > 0 && worked > 0) {
				let ratio = Math.round((worked / total) * progressTotal);
				if (ratio > progressWorked) { // never show less progress than what we have already
					progressRunner.worked(ratio - progressWorked);
					progressWorked = ratio;
					fakeProgress = false;
				}
			}

			// Fake progress up to 90%, or when actual progress beats it
			const fakeMax = 900;
			const fakeMultiplier = 12;
			if (fakeProgress && progressWorked < fakeMax) {
				// Linearly decrease the rate of fake progress.
				// 1 is the smallest allowed amount of progress.
				const fakeAmt = Math.round((fakeMax - progressWorked) / fakeMax * fakeMultiplier) || 1;
				progressWorked += fakeAmt;
				progressRunner.worked(fakeAmt);
			}

			// ReferenceSearch result tree update
			const fileCount = this.viewModel.referenceSearchResult.fileCount();
			if (visibleMatches !== fileCount) {
				visibleMatches = fileCount;
				this.tree.refresh().done(null, errors.onUnexpectedError);

				this.updateReferenceSearchResultCount();
			}
			if (fileCount > 0) {
				this.updateActions();
			}
		}, 100);

		this.viewModel.referenceSearch(queryInfo, onProgress).done(onComplete, onError);
	}

	private updateReferenceSearchResultCount(): void {
		const fileCount = this.viewModel.referenceSearchResult.fileCount();
		this.hasReferenceSearchResultsKey.set(fileCount > 0);

		const msgWasHidden = this.messages.isHidden();
		if (fileCount > 0) {
			const div = this.clearMessage();
			$(div).p({ text: this.buildResultCountMessage(this.viewModel.referenceSearchResult.count(), fileCount) });
			if (msgWasHidden) {
				this.reLayout();
			}
		} else if (!msgWasHidden) {
			this.messages.hide();
		}
	}

	private buildResultCountMessage(resultCount: number, fileCount: number): string {
		if (resultCount === 1 && fileCount === 1) {
			return nls.localize('referenceSearch.file.result', "{0} result in {1} file", resultCount, fileCount);
		} else if (resultCount === 1) {
			return nls.localize('referenceSearch.files.result', "{0} result in {1} files", resultCount, fileCount);
		} else if (fileCount === 1) {
			return nls.localize('referenceSearch.file.results', "{0} results in {1} file", resultCount, fileCount);
		} else {
			return nls.localize('referenceSearch.files.results', "{0} results in {1} files", resultCount, fileCount);
		}
	}

	private referenceSearchWithoutFolderMessage(div: Builder): void {
		this.referenceSearchWithoutFolderMessageBuilder = $(div);

		this.referenceSearchWithoutFolderMessageBuilder.p({ text: nls.localize('referenceSearchWithoutFolder', "You have not yet opened a folder. Only open files are currently referenceSearched - ") })
			.asContainer().a({
				'class': ['pointer', 'prominent'],
				'tabindex': '0',
				text: nls.localize('openFolder', "Open Folder")
			}).on(dom.EventType.CLICK, (e: MouseEvent) => {
				dom.EventHelper.stop(e, false);

				const actionClass = env.isMacintosh ? OpenFileFolderAction : OpenFolderAction;
				const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
				this.actionRunner.run(action).done(() => {
					action.dispose();
				}, err => {
					action.dispose();
					errors.onUnexpectedError(err);
				});
			});
	}

	private showEmptyStage(): void {

		// disable 'result'-actions
		this.referenceSearchSubmitted = false;
		this.updateActions();

		// clean up ui
		// this.replaceService.disposeAllReplacePreviews();
		this.messages.hide();
		this.results.show();
		this.tree.onVisible();
		this.currentSelectedFileMatch = null;
	}

	private onFocus(lineMatch: any, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		if (!(lineMatch instanceof Match)) {
			this.viewModel.referenceSearchResult.rangeHighlightDecorations.removeHighlightRange();
			return TPromise.as(true);
		}

		return this.open(lineMatch, preserveFocus, sideBySide, pinned);
	}

	public open(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		let selection = this.getSelectionFrom(element);
		let resource = element instanceof Match ? element.parent().resource() : (<FileMatch>element).resource();
		return this.editorService.openEditor({
			resource: resource,
			options: {
				preserveFocus,
				pinned,
				selection,
				revealIfVisible: true
			}
		}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => {
			if (editor && element instanceof Match && preserveFocus) {
				this.viewModel.referenceSearchResult.rangeHighlightDecorations.highlightRange(
					(<ICodeEditor>editor.getControl()).getModel(),
					element.range()
				);
			} else {
				this.viewModel.referenceSearchResult.rangeHighlightDecorations.removeHighlightRange();
			}
		}, errors.onUnexpectedError);
	}

	private getSelectionFrom(element: FileMatchOrMatch): any {
		let match: Match = null;
		if (element instanceof Match) {
			match = element;
		}
		if (element instanceof FileMatch && element.count() > 0) {
			match = element.matches()[element.matches().length - 1];
		}
		if (match) {
			let range = match.range();
			return range;
		}
		return void 0;
	}

	private onUntitledDidChangeDirty(resource: URI): void {
		if (!this.viewModel) {
			return;
		}

		// remove referenceSearch results from this resource as it got disposed
		if (!this.untitledEditorService.isDirty(resource)) {
			let matches = this.viewModel.referenceSearchResult.matches();
			for (let i = 0, len = matches.length; i < len; i++) {
				if (resource.toString() === matches[i].resource().toString()) {
					this.viewModel.referenceSearchResult.remove(matches[i]);
				}
			}
		}
	}

	private onFilesChanged(e: FileChangesEvent): void {
		if (!this.viewModel) {
			return;
		}

		let matches = this.viewModel.referenceSearchResult.matches();

		for (let i = 0, len = matches.length; i < len; i++) {
			if (e.contains(matches[i].resource(), FileChangeType.DELETED)) {
				this.viewModel.referenceSearchResult.remove(matches[i]);
			}
		}
	}

	public getActions(): IAction[] {
		return this.actions;
	}

	private changeActionAtPosition(index: number, newAction: ClearReferenceSearchResultsAction | CancelReferenceSearchAction | RefreshAction | CollapseDeepestExpandedLevelAction): void {
		this.actions.splice(index, 1, newAction);
		this.updateTitleArea();
	}

	public dispose(): void {
		this.isDisposed = true;

		super.dispose();
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const matchHighlightColor = theme.getColor(editorFindMatchHighlight);
	if (matchHighlightColor) {
		collector.addRule(`.monaco-workbench .referenceSearch-view .findInFileMatch { background-color: ${matchHighlightColor}; }`);
	}

	const diffInsertedColor = theme.getColor(diffInserted);
	if (diffInsertedColor) {
		collector.addRule(`.monaco-workbench .referenceSearch-view .replaceMatch { background-color: ${diffInsertedColor}; }`);
	}

	const diffRemovedColor = theme.getColor(diffRemoved);
	if (diffRemovedColor) {
		collector.addRule(`.monaco-workbench .referenceSearch-view .replace.findInFileMatch { background-color: ${diffRemovedColor}; }`);
	}

	const diffInsertedOutlineColor = theme.getColor(diffInsertedOutline);
	if (diffInsertedOutlineColor) {
		collector.addRule(`.monaco-workbench .referenceSearch-view .replaceMatch:not(:empty) { border: 1px ${theme.type === 'hc' ? 'dashed' : 'solid'} ${diffInsertedOutlineColor}; }`);
	}

	const diffRemovedOutlineColor = theme.getColor(diffRemovedOutline);
	if (diffRemovedOutlineColor) {
		collector.addRule(`.monaco-workbench .referenceSearch-view .replace.findInFileMatch { border: 1px ${theme.type === 'hc' ? 'dashed' : 'solid'} ${diffRemovedOutlineColor}; }`);
	}

	const findMatchHighlightBorder = theme.getColor(editorFindMatchHighlightBorder);
	if (findMatchHighlightBorder) {
		collector.addRule(`.monaco-workbench .referenceSearch-view .findInFileMatch { border: 1px ${theme.type === 'hc' ? 'dashed' : 'solid'} ${findMatchHighlightBorder}; }`);
	}
});