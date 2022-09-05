/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./outlinePane';
import * as dom from 'vs/base/browser/dom';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { TimeoutTimer } from 'vs/base/common/async';
import { IDisposable, toDisposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { LRUCache } from 'vs/base/common/map';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchDataTree } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { attachProgressBarStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewAction, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { FuzzyScore } from 'vs/base/common/filters';
import { basename } from 'vs/base/common/resources';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Codicon } from 'vs/base/common/codicons';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { OutlineSortOrder, OutlineViewState } from './outlineViewState';
import { IOutline, IOutlineComparator, IOutlineService, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';
import { EditorResourceAccessor, IEditorPane } from 'vs/workbench/common/editor';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { ITreeSorter } from 'vs/base/browser/ui/tree/tree';
import { AbstractTreeViewState, IAbstractTreeViewState, TreeFindMode } from 'vs/base/browser/ui/tree/abstractTree';

const _ctxFollowsCursor = new RawContextKey('outlineFollowsCursor', false);
const _ctxFilterOnType = new RawContextKey('outlineFiltersOnType', false);
const _ctxSortMode = new RawContextKey<OutlineSortOrder>('outlineSortMode', OutlineSortOrder.ByPosition);

class OutlineTreeSorter<E> implements ITreeSorter<E> {

	constructor(
		private _comparator: IOutlineComparator<E>,
		public order: OutlineSortOrder
	) { }

	compare(a: E, b: E): number {
		if (this.order === OutlineSortOrder.ByKind) {
			return this._comparator.compareByType(a, b);
		} else if (this.order === OutlineSortOrder.ByName) {
			return this._comparator.compareByName(a, b);
		} else {
			return this._comparator.compareByPosition(a, b);
		}
	}
}

export class OutlinePane extends ViewPane {

	static readonly Id = 'outline';

	private readonly _disposables = new DisposableStore();

	private readonly _editorControlDisposables = new DisposableStore();
	private readonly _editorPaneDisposables = new DisposableStore();
	private readonly _outlineViewState = new OutlineViewState();

	private readonly _editorListener = new MutableDisposable();

	private _domNode!: HTMLElement;
	private _message!: HTMLDivElement;
	private _progressBar!: ProgressBar;
	private _treeContainer!: HTMLElement;
	private _tree?: WorkbenchDataTree<IOutline<any> | undefined, any, FuzzyScore>;
	private _treeDimensions?: dom.Dimension;
	private _treeStates = new LRUCache<string, IAbstractTreeViewState>(10);

	private _ctxFollowsCursor!: IContextKey<boolean>;
	private _ctxFilterOnType!: IContextKey<boolean>;
	private _ctxSortMode!: IContextKey<OutlineSortOrder>;

	constructor(
		options: IViewletViewOptions,
		@IOutlineService private readonly _outlineService: IOutlineService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IThemeService private readonly _themeService: IThemeService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, telemetryService);
		this._outlineViewState.restore(this._storageService);
		this._disposables.add(this._outlineViewState);

		this._ctxFollowsCursor = _ctxFollowsCursor.bindTo(contextKeyService);
		this._ctxFilterOnType = _ctxFilterOnType.bindTo(contextKeyService);
		this._ctxSortMode = _ctxSortMode.bindTo(contextKeyService);

		const updateContext = () => {
			this._ctxFollowsCursor.set(this._outlineViewState.followCursor);
			this._ctxFilterOnType.set(this._outlineViewState.filterOnType);
			this._ctxSortMode.set(this._outlineViewState.sortBy);
		};
		updateContext();
		this._disposables.add(this._outlineViewState.onDidChange(updateContext));
	}

	override dispose(): void {
		this._disposables.dispose();
		this._editorPaneDisposables.dispose();
		this._editorControlDisposables.dispose();
		this._editorListener.dispose();
		super.dispose();
	}

	override focus(): void {
		this._tree?.domFocus();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._domNode = container;
		container.classList.add('outline-pane');

		const progressContainer = dom.$('.outline-progress');
		this._message = dom.$('.outline-message');

		this._progressBar = new ProgressBar(progressContainer);
		this._disposables.add(attachProgressBarStyler(this._progressBar, this._themeService));

		this._treeContainer = dom.$('.outline-tree');
		dom.append(container, progressContainer, this._message, this._treeContainer);

		this._disposables.add(this.onDidChangeBodyVisibility(visible => {
			if (!visible) {
				// stop everything when not visible
				this._editorListener.clear();
				this._editorPaneDisposables.clear();
				this._editorControlDisposables.clear();

			} else if (!this._editorListener.value) {
				const event = Event.any(this._editorService.onDidActiveEditorChange, this._outlineService.onDidChange);
				this._editorListener.value = event(() => this._handleEditorChanged(this._editorService.activeEditorPane));
				this._handleEditorChanged(this._editorService.activeEditorPane);
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._tree?.layout(height, width);
		this._treeDimensions = new dom.Dimension(width, height);
	}

	collapseAll(): void {
		this._tree?.collapseAll();
	}

	get outlineViewState() {
		return this._outlineViewState;
	}

	private _showMessage(message: string) {
		this._domNode.classList.add('message');
		this._progressBar.stop().hide();
		this._message.innerText = message;
	}

	private _captureViewState(): boolean {
		if (this._tree) {
			const oldOutline = this._tree.getInput();
			if (oldOutline && oldOutline.uri) {
				this._treeStates.set(`${oldOutline.outlineKind}/${oldOutline.uri}`, this._tree.getViewState());
				return true;
			}
		}
		return false;
	}

	private _handleEditorChanged(pane: IEditorPane | undefined): void {
		this._editorPaneDisposables.clear();

		if (pane) {
			// react to control changes from within pane (https://github.com/microsoft/vscode/issues/134008)
			this._editorPaneDisposables.add(pane.onDidChangeControl(() => {
				this._handleEditorControlChanged(pane);
			}));
		}

		this._handleEditorControlChanged(pane);
	}

	private async _handleEditorControlChanged(pane: IEditorPane | undefined): Promise<void> {

		// persist state
		const resource = EditorResourceAccessor.getOriginalUri(pane?.input);
		const didCapture = this._captureViewState();

		this._editorControlDisposables.clear();

		if (!pane || !this._outlineService.canCreateOutline(pane) || !resource) {
			return this._showMessage(localize('no-editor', "The active editor cannot provide outline information."));
		}

		let loadingMessage: IDisposable | undefined;
		if (!didCapture) {
			loadingMessage = new TimeoutTimer(() => {
				this._showMessage(localize('loading', "Loading document symbols for '{0}'...", basename(resource)));
			}, 100);
		}

		this._progressBar.infinite().show(500);

		const cts = new CancellationTokenSource();
		this._editorControlDisposables.add(toDisposable(() => cts.dispose(true)));

		const newOutline = await this._outlineService.createOutline(pane, OutlineTarget.OutlinePane, cts.token);
		loadingMessage?.dispose();

		if (!newOutline) {
			return;
		}

		if (cts.token.isCancellationRequested) {
			newOutline?.dispose();
			return;
		}

		this._editorControlDisposables.add(newOutline);
		this._progressBar.stop().hide();

		const sorter = new OutlineTreeSorter(newOutline.config.comparator, this._outlineViewState.sortBy);

		const tree = <WorkbenchDataTree<IOutline<any> | undefined, any, FuzzyScore>>this._instantiationService.createInstance(
			WorkbenchDataTree,
			'OutlinePane',
			this._treeContainer,
			newOutline.config.delegate,
			newOutline.config.renderers,
			newOutline.config.treeDataSource,
			{
				...newOutline.config.options,
				sorter,
				expandOnDoubleClick: false,
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				hideTwistiesOfChildlessElements: true,
				defaultFindMode: this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight,
				overrideStyles: { listBackground: this.getBackgroundColor() }
			}
		);

		// update tree, listen to changes
		const updateTree = () => {
			if (newOutline.isEmpty) {
				// no more elements
				this._showMessage(localize('no-symbols', "No symbols found in document '{0}'", basename(resource)));
				this._captureViewState();
				tree.setInput(undefined);

			} else if (!tree.getInput()) {
				// first: init tree
				this._domNode.classList.remove('message');
				const state = this._treeStates.get(`${newOutline.outlineKind}/${resource}`);
				tree.setInput(newOutline, state && AbstractTreeViewState.lift(state));

			} else {
				// update: refresh tree
				this._domNode.classList.remove('message');
				tree.updateChildren();
			}
		};
		updateTree();
		this._editorControlDisposables.add(newOutline.onDidChange(updateTree));
		tree.findMode = this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight;

		// feature: apply panel background to tree
		this._editorControlDisposables.add(this.viewDescriptorService.onDidChangeLocation(({ views }) => {
			if (views.some(v => v.id === this.id)) {
				tree.updateOptions({ overrideStyles: { listBackground: this.getBackgroundColor() } });
			}
		}));

		// feature: filter on type - keep tree and menu in sync
		this._editorControlDisposables.add(tree.onDidChangeFindMode(mode => this._outlineViewState.filterOnType = mode === TreeFindMode.Filter));

		// feature: reveal outline selection in editor
		// on change -> reveal/select defining range
		this._editorControlDisposables.add(tree.onDidOpen(e => newOutline.reveal(e.element, e.editorOptions, e.sideBySide)));
		// feature: reveal editor selection in outline
		const revealActiveElement = () => {
			if (!this._outlineViewState.followCursor || !newOutline.activeElement) {
				return;
			}
			let item = newOutline.activeElement;
			while (item) {
				const top = tree.getRelativeTop(item);
				if (top === null) {
					// not visible -> reveal
					tree.reveal(item, 0.5);
				}
				if (tree.getRelativeTop(item) !== null) {
					tree.setFocus([item]);
					tree.setSelection([item]);
					break;
				}
				// STILL not visible -> try parent
				item = tree.getParentElement(item);
			}
		};
		revealActiveElement();
		this._editorControlDisposables.add(newOutline.onDidChange(revealActiveElement));

		// feature: update view when user state changes
		this._editorControlDisposables.add(this._outlineViewState.onDidChange((e: { followCursor?: boolean; sortBy?: boolean; filterOnType?: boolean }) => {
			this._outlineViewState.persist(this._storageService);
			if (e.filterOnType) {
				tree.findMode = this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight;
			}
			if (e.followCursor) {
				revealActiveElement();
			}
			if (e.sortBy) {
				sorter.order = this._outlineViewState.sortBy;
				tree.resort();
			}
		}));

		// feature: expand all nodes when filtering (not when finding)
		let viewState: AbstractTreeViewState | undefined;
		this._editorControlDisposables.add(tree.onDidChangeFindPattern(pattern => {
			if (tree.findMode === TreeFindMode.Highlight) {
				return;
			}
			if (!viewState && pattern) {
				viewState = tree.getViewState();
				tree.expandAll();
			} else if (!pattern && viewState) {
				tree.setInput(tree.getInput()!, viewState);
				viewState = undefined;
			}
		}));

		// last: set tree property
		tree.layout(this._treeDimensions?.height, this._treeDimensions?.width);
		this._tree = tree;
		this._editorControlDisposables.add(toDisposable(() => {
			tree.dispose();
			this._tree = undefined;
		}));
	}
}


// --- commands

registerAction2(class Collapse extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: 'outline.collapse',
			title: localize('collapse', "Collapse All"),
			f1: false,
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', OutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: OutlinePane) {
		view.collapseAll();
	}
});

registerAction2(class FollowCursor extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: 'outline.followCursor',
			title: localize('followCur', "Follow Cursor"),
			f1: false,
			toggled: _ctxFollowsCursor,
			menu: {
				id: MenuId.ViewTitle,
				group: 'config',
				order: 1,
				when: ContextKeyExpr.equals('view', OutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: OutlinePane) {
		view.outlineViewState.followCursor = !view.outlineViewState.followCursor;
	}
});

registerAction2(class FilterOnType extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: 'outline.filterOnType',
			title: localize('filterOnType', "Filter on Type"),
			f1: false,
			toggled: _ctxFilterOnType,
			menu: {
				id: MenuId.ViewTitle,
				group: 'config',
				order: 2,
				when: ContextKeyExpr.equals('view', OutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: OutlinePane) {
		view.outlineViewState.filterOnType = !view.outlineViewState.filterOnType;
	}
});


registerAction2(class SortByPosition extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: 'outline.sortByPosition',
			title: localize('sortByPosition', "Sort By: Position"),
			f1: false,
			toggled: _ctxSortMode.isEqualTo(OutlineSortOrder.ByPosition),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 1,
				when: ContextKeyExpr.equals('view', OutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: OutlinePane) {
		view.outlineViewState.sortBy = OutlineSortOrder.ByPosition;
	}
});

registerAction2(class SortByName extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: 'outline.sortByName',
			title: localize('sortByName', "Sort By: Name"),
			f1: false,
			toggled: _ctxSortMode.isEqualTo(OutlineSortOrder.ByName),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 2,
				when: ContextKeyExpr.equals('view', OutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: OutlinePane) {
		view.outlineViewState.sortBy = OutlineSortOrder.ByName;
	}
});

registerAction2(class SortByKind extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlinePane.Id,
			id: 'outline.sortByKind',
			title: localize('sortByKind', "Sort By: Category"),
			f1: false,
			toggled: _ctxSortMode.isEqualTo(OutlineSortOrder.ByKind),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 3,
				when: ContextKeyExpr.equals('view', OutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: OutlinePane) {
		view.outlineViewState.sortBy = OutlineSortOrder.ByKind;
	}
});
