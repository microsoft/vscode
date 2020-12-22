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
import { ContextKeyEqualsExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
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
import { OutlineViewFocused, OutlineViewFiltered, OutlineViewId } from 'vs/editor/contrib/documentSymbols/outline';
import { FuzzyScore } from 'vs/base/common/filters';
import { OutlineSortOrder } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { IDataTreeViewState } from 'vs/base/browser/ui/tree/dataTree';
import { basename } from 'vs/base/common/resources';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Codicon } from 'vs/base/common/codicons';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { OutlineViewState } from './outlineViewState';
import { IOutline, IOutlineService } from 'vs/workbench/services/outline/browser/outline';
import { EditorResourceAccessor, IEditorPane } from 'vs/workbench/common/editor';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';

export class OutlinePane extends ViewPane {

	private readonly _disposables = new DisposableStore();

	private readonly _editorDisposables = new DisposableStore();
	private readonly _outlineViewState = new OutlineViewState();

	private readonly _editorListener = new MutableDisposable();

	private _domNode!: HTMLElement;
	private _message!: HTMLDivElement;
	private _progressBar!: ProgressBar;
	private _treeContainer!: HTMLElement;
	private _tree?: WorkbenchDataTree<IOutline<any>, any, FuzzyScore>;
	private _treeStates = new LRUCache<string, IDataTreeViewState>(10);

	private readonly _ctxFocused: IContextKey<boolean>;
	private readonly _ctxFiltered: IContextKey<boolean>;
	private readonly _ctxFollowsCursor: IContextKey<boolean>;
	private readonly _ctxFilterOnType: IContextKey<boolean>;
	private readonly _ctxSortMode: IContextKey<OutlineSortOrder>;

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
		this._ctxFocused = OutlineViewFocused.bindTo(contextKeyService);
		this._ctxFiltered = OutlineViewFiltered.bindTo(contextKeyService);
		this._disposables.add(this.onDidFocus(_ => this._ctxFocused.set(true)));
		this._disposables.add(this.onDidBlur(_ => this._ctxFocused.set(false)));

		this._ctxFollowsCursor = _ctxFollowsCursor.bindTo(contextKeyService);
		this._ctxFilterOnType = _ctxFilterOnType.bindTo(contextKeyService);
		this._ctxSortMode = _ctxSortMode.bindTo(contextKeyService);
		const viewStateToContext = () => {
			this._ctxFollowsCursor.set(this._outlineViewState.followCursor);
			this._ctxFilterOnType.set(this._outlineViewState.filterOnType);
			this._ctxSortMode.set(this._outlineViewState.sortBy);
		};
		viewStateToContext();
		this._outlineViewState.onDidChange(viewStateToContext, this);
	}

	dispose(): void {
		this._disposables.dispose();
		this._editorDisposables.dispose();
		super.dispose();
	}

	focus(): void {
		this._tree?.domFocus();
	}

	protected renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._domNode = container;
		container.classList.add('outline-pane');

		let progressContainer = dom.$('.outline-progress');
		this._message = dom.$('.outline-message');

		this._progressBar = new ProgressBar(progressContainer);
		this._disposables.add(attachProgressBarStyler(this._progressBar, this._themeService));

		this._treeContainer = dom.$('.outline-tree');
		dom.append(container, progressContainer, this._message, this._treeContainer);

		this._disposables.add(this._outlineViewState.onDidChange(this._onDidChangeUserState, this));

		this._disposables.add(this.onDidChangeBodyVisibility(visible => {
			if (!visible) {
				// stop everything when not visible
				this._editorListener.clear();
			} else if (!this._editorListener.value) {
				this._editorListener.value = Event.any(this._editorService.onDidActiveEditorChange, this._outlineService.onDidChange)(() => {
					this._handleEditorChanged(this._editorService.activeEditorPane);
				});
			}
		}));
	}

	protected layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._tree?.layout(height, width);
	}

	collapseAll(): void {
		this._tree?.collapseAll();
	}

	get outlineViewState() {
		return this._outlineViewState;
	}

	private _onDidChangeUserState(e: { followCursor?: boolean, sortBy?: boolean, filterOnType?: boolean }) {
		this._outlineViewState.persist(this._storageService);

		if (e.sortBy) {
			// todo@jrieken
			// this._treeComparator.type = this._outlineViewState.sortBy;
			this._tree?.resort();
		}
		if (e.filterOnType) {
			this._tree?.updateOptions({
				filterOnType: this._outlineViewState.filterOnType
			});
		}
	}

	private _showMessage(message: string) {
		this._domNode.classList.add('message');
		this._progressBar.stop().hide();
		this._message.innerText = message;
	}

	private async _handleEditorChanged(pane: IEditorPane | undefined): Promise<void> {
		this._editorDisposables.clear();

		const oldOutline = this._tree?.getInput();
		const resource = EditorResourceAccessor.getOriginalUri(pane?.input);

		// persist state
		if (oldOutline) {
			this._treeStates.set(oldOutline.resource.toString(), this._tree!.getViewState());
		}

		if (!pane || !this._outlineService.canCreateOutline(pane) || !resource) {
			return this._showMessage(localize('no-editor', "The active editor cannot provide outline information."));
		}

		let loadingMessage: IDisposable | undefined;
		if (!oldOutline) {
			loadingMessage = new TimeoutTimer(() => {
				this._showMessage(localize('loading', "Loading document symbols for '{0}'...", basename(resource)));
			}, 100);
		}

		this._progressBar.infinite().show(500);

		const cts = new CancellationTokenSource();
		this._editorDisposables.add(toDisposable(() => cts.dispose(true)));

		const newOutline = await this._outlineService.createOutline(pane, cts.token);
		loadingMessage?.dispose();

		if (!newOutline) {
			return;
		}

		this._progressBar.stop().hide();

		const tree = <WorkbenchDataTree<IOutline<any>, any, FuzzyScore>>this._instantiationService.createInstance(
			WorkbenchDataTree,
			'OutlinePane',
			this._treeContainer,
			newOutline.treeConfig.delegate,
			newOutline.treeConfig.renderers,
			newOutline.treeConfig.treeDataSource,
			{
				...newOutline.treeConfig.options,
				openOnSingleClick: true,
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				hideTwistiesOfChildlessElements: true,
				filterOnType: this._outlineViewState.filterOnType,
				overrideStyles: { listBackground: this.getBackgroundColor() }
			}
		);

		// update tree, listen to changes
		const updateTree = () => {
			if (newOutline.isEmpty) {
				// no more elements
				this._showMessage(localize('no-symbols', "No symbols found in document '{0}'", basename(resource)));

			} else if (!tree.getInput()) {
				// first: init tree
				this._domNode.classList.remove('message');
				const state = this._treeStates.get(newOutline.resource.toString());
				tree.setInput(newOutline, state);
				tree.expandAll();

			} else {
				// update: refresh tree
				this._domNode.classList.remove('message');
				tree.updateChildren();
				tree.expandAll();
			}
		};
		updateTree();
		this._editorDisposables.add(newOutline.onDidChange(updateTree));

		// feature: apply panel background to tree
		this._editorDisposables.add(this.viewDescriptorService.onDidChangeLocation(({ views }) => {
			if (views.some(v => v.id === this.id)) {
				tree.updateOptions({ overrideStyles: { listBackground: this.getBackgroundColor() } });
			}
		}));

		// feature: filter on type - keep tree and menu in sync
		this._editorDisposables.add(tree.onDidUpdateOptions(e => this._outlineViewState.filterOnType = Boolean(e.filterOnType)));

		// feature: reset filter command when disposing
		this._editorDisposables.add(toDisposable(() => this._ctxFiltered.reset()));

		// feature: reveal outline selection in editor
		// on change -> reveal/select defining range
		this._editorDisposables.add(tree.onDidOpen(e => newOutline.reveal(e.element, e.editorOptions, e.sideBySide)));

		// feature: reveal editor selection in outline
		const revealActiveElement = () => {
			if (!this._outlineViewState.followCursor || !newOutline.activeElement) {
				return;
			}
			const item = newOutline.activeElement;
			const top = tree.getRelativeTop(item);
			if (top === null) {
				tree.reveal(item, 0.5);
			}
			tree.setFocus([item]);
			tree.setSelection([item]);
		};
		revealActiveElement();
		this._editorDisposables.add(newOutline.onDidChange(revealActiveElement));

		// feature: expand all nodes when filtering (not when finding)
		let viewState: IDataTreeViewState | undefined;
		this._editorDisposables.add(tree.onDidChangeTypeFilterPattern(pattern => {
			if (!tree.options.filterOnType) {
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
		this._tree = tree;
		this._editorDisposables.add(toDisposable(() => {
			tree.dispose();
			this._tree = undefined;
		}));
	}
}

const _ctxFollowsCursor = new RawContextKey('outlineFollowsCursor', false);
const _ctxFilterOnType = new RawContextKey('outlineFiltersOnType', false);
const _ctxSortMode = new RawContextKey<OutlineSortOrder>('outlineSortMode', OutlineSortOrder.ByPosition);

// --- commands

registerAction2(class Collapse extends ViewAction<OutlinePane> {
	constructor() {
		super({
			viewId: OutlineViewId,
			id: 'outline.collapse',
			title: localize('collapse', "Collapse All"),
			f1: false,
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyEqualsExpr.create('view', OutlineViewId)
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
			viewId: OutlineViewId,
			id: 'outline.followCursor',
			title: localize('followCur', "Follow Cursor"),
			f1: false,
			toggled: _ctxFollowsCursor,
			menu: {
				id: MenuId.ViewTitle,
				group: 'config',
				order: 1,
				when: ContextKeyEqualsExpr.create('view', OutlineViewId)
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
			viewId: OutlineViewId,
			id: 'outline.filterOnType',
			title: localize('filterOnType', "Filter on Type"),
			f1: false,
			toggled: _ctxFilterOnType,
			menu: {
				id: MenuId.ViewTitle,
				group: 'config',
				order: 2,
				when: ContextKeyEqualsExpr.create('view', OutlineViewId)
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
			viewId: OutlineViewId,
			id: 'outline.sortByPosition',
			title: localize('sortByPosition', "Sort By: Position"),
			f1: false,
			toggled: _ctxSortMode.isEqualTo(OutlineSortOrder.ByPosition),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 1,
				when: ContextKeyEqualsExpr.create('view', OutlineViewId)
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
			viewId: OutlineViewId,
			id: 'outline.sortByName',
			title: localize('sortByName', "Sort By: Name"),
			f1: false,
			toggled: _ctxSortMode.isEqualTo(OutlineSortOrder.ByName),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 2,
				when: ContextKeyEqualsExpr.create('view', OutlineViewId)
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
			viewId: OutlineViewId,
			id: 'outline.sortByKind',
			title: localize('sortByKind', "Sort By: Category"),
			f1: false,
			toggled: _ctxSortMode.isEqualTo(OutlineSortOrder.ByKind),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 3,
				when: ContextKeyEqualsExpr.create('view', OutlineViewId)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: OutlinePane) {
		view.outlineViewState.sortBy = OutlineSortOrder.ByKind;
	}
});
