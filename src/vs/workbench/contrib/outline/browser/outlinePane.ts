/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './outlinePane.css';
import * as dom from '../../../../base/browser/dom.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { TimeoutTimer, timeout } from '../../../../base/common/async.js';
import { IDisposable, toDisposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchDataTree } from '../../../../platform/list/browser/listService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { basename } from '../../../../base/common/resources.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { OutlineViewState } from './outlineViewState.js';
import { IOutline, IOutlineComparator, IOutlineService, OutlineTarget } from '../../../services/outline/browser/outline.js';
import { EditorResourceAccessor, IEditorPane } from '../../../common/editor.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { AbstractTreeViewState, IAbstractTreeViewState, TreeFindMode } from '../../../../base/browser/ui/tree/abstractTree.js';
import { URI } from '../../../../base/common/uri.js';
import { ctxAllCollapsed, ctxFilterOnType, ctxFocused, ctxFollowsCursor, ctxSortMode, IOutlinePane, OutlineSortOrder } from './outline.js';
import { defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

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

export class OutlinePane extends ViewPane implements IOutlinePane {

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
	private _tree?: WorkbenchDataTree<IOutline<unknown> | undefined, unknown, FuzzyScore>;
	private _treeDimensions?: dom.Dimension;
	private _treeStates = new LRUCache<string, IAbstractTreeViewState>(10);

	private _ctxFollowsCursor!: IContextKey<boolean>;
	private _ctxFilterOnType!: IContextKey<boolean>;
	private _ctxSortMode!: IContextKey<OutlineSortOrder>;
	private _ctxAllCollapsed!: IContextKey<boolean>;

	constructor(
		options: IViewletViewOptions,
		@IOutlineService private readonly _outlineService: IOutlineService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IStorageService private readonly _storageService: IStorageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, hoverService);
		this._outlineViewState.restore(this._storageService);
		this._disposables.add(this._outlineViewState);

		contextKeyService.bufferChangeEvents(() => {
			this._ctxFollowsCursor = ctxFollowsCursor.bindTo(contextKeyService);
			this._ctxFilterOnType = ctxFilterOnType.bindTo(contextKeyService);
			this._ctxSortMode = ctxSortMode.bindTo(contextKeyService);
			this._ctxAllCollapsed = ctxAllCollapsed.bindTo(contextKeyService);
		});

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
		this._editorControlChangePromise.then(() => {
			super.focus();
			this._tree?.domFocus();
		});
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._domNode = container;
		container.classList.add('outline-pane');

		const progressContainer = dom.$('.outline-progress');
		this._message = dom.$('.outline-message');

		this._progressBar = new ProgressBar(progressContainer, defaultProgressBarStyles);

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

	expandAll(): void {
		this._tree?.expandAll();
	}

	get outlineViewState() {
		return this._outlineViewState;
	}

	private _showMessage(message: string) {
		this._domNode.classList.add('message');
		this._progressBar.stop().hide();
		this._message.textContent = message;
	}

	private _captureViewState(uri?: URI): boolean {
		if (this._tree) {
			const oldOutline = this._tree.getInput();
			if (!uri) {
				uri = oldOutline?.uri;
			}
			if (oldOutline && uri) {
				this._treeStates.set(`${oldOutline.outlineKind}/${uri}`, this._tree.getViewState());
				return true;
			}
		}
		return false;
	}

	private _editorControlChangePromise: Promise<void> = Promise.resolve();
	private _handleEditorChanged(pane: IEditorPane | undefined): void {
		this._editorPaneDisposables.clear();

		if (pane) {
			// react to control changes from within pane (https://github.com/microsoft/vscode/issues/134008)
			this._editorPaneDisposables.add(pane.onDidChangeControl(() => {
				this._editorControlChangePromise = this._handleEditorControlChanged(pane);
			}));
		}

		this._editorControlChangePromise = this._handleEditorControlChanged(pane);
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

		const tree = this._instantiationService.createInstance(
			WorkbenchDataTree<IOutline<unknown> | undefined, unknown, FuzzyScore>,
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
				overrideStyles: this.getLocationBasedColors().listOverrideStyles
			}
		);

		ctxFocused.bindTo(tree.contextKeyService);

		// update tree, listen to changes
		const updateTree = () => {
			if (newOutline.isEmpty) {
				// no more elements
				this._showMessage(localize('no-symbols', "No symbols found in document '{0}'", basename(resource)));
				this._captureViewState(resource);
				tree.setInput(undefined);

			} else if (!tree.getInput()) {
				// first: init tree
				this._domNode.classList.remove('message');
				const state = this._treeStates.get(`${newOutline.outlineKind}/${newOutline.uri}`);
				tree.setInput(newOutline, state && AbstractTreeViewState.lift(state));

			} else {
				// update: refresh tree
				this._domNode.classList.remove('message');
				tree.updateChildren();
			}
		};
		updateTree();
		this._editorControlDisposables.add(newOutline.onDidChange(updateTree));

		// feature: apply panel background to tree
		this._editorControlDisposables.add(this.viewDescriptorService.onDidChangeLocation(({ views }) => {
			if (views.some(v => v.id === this.id)) {
				tree.updateOptions({ overrideStyles: this.getLocationBasedColors().listOverrideStyles });
			}
		}));

		// feature: filter on type - keep tree and menu in sync
		this._editorControlDisposables.add(tree.onDidChangeFindMode(mode => this._outlineViewState.filterOnType = mode === TreeFindMode.Filter));

		// feature: reveal outline selection in editor
		// on change -> reveal/select defining range
		let idPool = 0;
		this._editorControlDisposables.add(tree.onDidOpen(async e => {
			const myId = ++idPool;
			const isDoubleClick = e.browserEvent?.type === 'dblclick';
			if (!isDoubleClick) {
				// workaround for https://github.com/microsoft/vscode/issues/206424
				await timeout(150);
				if (myId !== idPool) {
					return;
				}
			}
			await newOutline.reveal(e.element, e.editorOptions, e.sideBySide, isDoubleClick);
		}));
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

		// feature: update all-collapsed context key
		const updateAllCollapsedCtx = () => {
			this._ctxAllCollapsed.set(tree.getNode(null).children.every(node => !node.collapsible || node.collapsed));
		};
		this._editorControlDisposables.add(tree.onDidChangeCollapseState(updateAllCollapsedCtx));
		this._editorControlDisposables.add(tree.onDidChangeModel(updateAllCollapsedCtx));
		updateAllCollapsedCtx();

		// last: set tree property and wire it up to one of our context keys
		tree.layout(this._treeDimensions?.height, this._treeDimensions?.width);
		this._tree = tree;
		this._editorControlDisposables.add(toDisposable(() => {
			tree.dispose();
			this._tree = undefined;
		}));
	}
}
