/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from '../../dnd.js';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListDragAndDrop, IListDragOverReaction, IListVirtualDelegate } from '../list/list.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../list/listView.js';
import { IListStyles } from '../list/listWidget.js';
import { ComposedTreeDelegate, TreeFindMode as TreeFindMode, IAbstractTreeOptions, IAbstractTreeOptionsUpdate, TreeFindMatchType, AbstractTreePart, LabelFuzzyScore, IFindFilter, AbstractFindController, ITreeFindToggleContribution, ITreeFindToggleChangeEvent } from './abstractTree.js';
import { ICompressedTreeElement, ICompressedTreeNode } from './compressedObjectTreeModel.js';
import { getVisibleState, isFilterResult } from './indexTreeModel.js';
import { CompressibleObjectTree, ICompressibleKeyboardNavigationLabelProvider, ICompressibleObjectTreeOptions, ICompressibleTreeRenderer, IObjectTreeOptions, IObjectTreeSetChildrenOptions, ObjectTree } from './objectTree.js';
import { IAsyncDataSource, ICollapseStateChangeEvent, IObjectTreeElement, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeEvent, ITreeFilter, ITreeModel, ITreeMouseEvent, ITreeNavigator, ITreeNode, ITreeRenderer, ITreeSorter, ObjectTreeElementCollapseState, TreeError, TreeFilterResult, TreeVisibility, WeakMapper } from './tree.js';
import { CancelablePromise, createCancelablePromise, Promises, timeout, TimeoutTimer } from '../../../common/async.js';
import { Codicon } from '../../../common/codicons.js';
import { ThemeIcon } from '../../../common/themables.js';
import { isCancellationError, onUnexpectedError } from '../../../common/errors.js';
import { Emitter, Event } from '../../../common/event.js';
import { Iterable } from '../../../common/iterator.js';
import { DisposableStore, dispose, IDisposable } from '../../../common/lifecycle.js';
import { ScrollEvent } from '../../../common/scrollable.js';
import { isIterable, isNumber } from '../../../common/types.js';
import { CancellationToken, CancellationTokenSource } from '../../../common/cancellation.js';
import { IObjectTreeModel } from './objectTreeModel.js';
import { IContextViewProvider } from '../contextview/contextview.js';
import { fuzzyScore, FuzzyScore } from '../../../common/filters.js';

interface IAsyncDataTreeNode<TInput, T> {
	element: TInput | T;
	readonly parent: IAsyncDataTreeNode<TInput, T> | null;
	readonly children: IAsyncDataTreeNode<TInput, T>[];
	readonly id?: string | null;
	refreshPromise: Promise<void> | undefined;
	hasChildren: boolean;
	stale: boolean;
	slow: boolean;
	readonly defaultCollapseState: undefined | ObjectTreeElementCollapseState.PreserveOrCollapsed | ObjectTreeElementCollapseState.PreserveOrExpanded;
	forceExpanded: boolean;
}

interface IAsyncDataTreeNodeRequiredProps<TInput, T> extends Partial<IAsyncDataTreeNode<TInput, T>> {
	readonly element: TInput | T;
	readonly parent: IAsyncDataTreeNode<TInput, T> | null;
	readonly hasChildren: boolean;
	readonly defaultCollapseState: undefined | ObjectTreeElementCollapseState.PreserveOrCollapsed | ObjectTreeElementCollapseState.PreserveOrExpanded;
}

function createAsyncDataTreeNode<TInput, T>(props: IAsyncDataTreeNodeRequiredProps<TInput, T>): IAsyncDataTreeNode<TInput, T> {
	return {
		...props,
		children: [],
		refreshPromise: undefined,
		stale: true,
		slow: false,
		forceExpanded: false
	};
}

function isAncestor<TInput, T>(ancestor: IAsyncDataTreeNode<TInput, T>, descendant: IAsyncDataTreeNode<TInput, T>): boolean {
	if (!descendant.parent) {
		return false;
	} else if (descendant.parent === ancestor) {
		return true;
	} else {
		return isAncestor(ancestor, descendant.parent);
	}
}

function intersects<TInput, T>(node: IAsyncDataTreeNode<TInput, T>, other: IAsyncDataTreeNode<TInput, T>): boolean {
	return node === other || isAncestor(node, other) || isAncestor(other, node);
}

interface IDataTreeListTemplateData<T> {
	templateData: T;
}

type AsyncDataTreeNodeMapper<TInput, T, TFilterData> = WeakMapper<ITreeNode<IAsyncDataTreeNode<TInput, T> | null, TFilterData>, ITreeNode<TInput | T, TFilterData>>;

class AsyncDataTreeNodeWrapper<TInput, T, TFilterData> implements ITreeNode<TInput | T, TFilterData> {

	get element(): T { return this.node.element!.element as T; }
	get children(): ITreeNode<T, TFilterData>[] { return this.node.children.map(node => new AsyncDataTreeNodeWrapper(node)); }
	get depth(): number { return this.node.depth; }
	get visibleChildrenCount(): number { return this.node.visibleChildrenCount; }
	get visibleChildIndex(): number { return this.node.visibleChildIndex; }
	get collapsible(): boolean { return this.node.collapsible; }
	get collapsed(): boolean { return this.node.collapsed; }
	get visible(): boolean { return this.node.visible; }
	get filterData(): TFilterData | undefined { return this.node.filterData; }

	constructor(private node: ITreeNode<IAsyncDataTreeNode<TInput, T> | null, TFilterData>) { }
}

class AsyncDataTreeRenderer<TInput, T, TFilterData, TTemplateData> implements ITreeRenderer<IAsyncDataTreeNode<TInput, T>, TFilterData, IDataTreeListTemplateData<TTemplateData>> {

	readonly templateId: string;
	private renderedNodes = new Map<IAsyncDataTreeNode<TInput, T>, IDataTreeListTemplateData<TTemplateData>>();

	constructor(
		protected renderer: ITreeRenderer<T, TFilterData, TTemplateData>,
		protected nodeMapper: AsyncDataTreeNodeMapper<TInput, T, TFilterData>,
		readonly onDidChangeTwistieState: Event<IAsyncDataTreeNode<TInput, T>>
	) {
		this.templateId = renderer.templateId;
	}

	renderTemplate(container: HTMLElement): IDataTreeListTemplateData<TTemplateData> {
		const templateData = this.renderer.renderTemplate(container);
		return { templateData };
	}

	renderElement(node: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>, height: number | undefined): void {
		this.renderer.renderElement(this.nodeMapper.map(node) as ITreeNode<T, TFilterData>, index, templateData.templateData, height);
	}

	renderTwistie(element: IAsyncDataTreeNode<TInput, T>, twistieElement: HTMLElement): boolean {
		if (element.slow) {
			twistieElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
			return true;
		} else {
			twistieElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
			return false;
		}
	}

	disposeElement(node: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>, height: number | undefined): void {
		this.renderer.disposeElement?.(this.nodeMapper.map(node) as ITreeNode<T, TFilterData>, index, templateData.templateData, height);
	}

	disposeTemplate(templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	dispose(): void {
		this.renderedNodes.clear();
	}
}

function asTreeEvent<TInput, T>(e: ITreeEvent<IAsyncDataTreeNode<TInput, T> | null>): ITreeEvent<T> {
	return {
		browserEvent: e.browserEvent,
		elements: e.elements.map(e => e!.element as T)
	};
}

function asTreeMouseEvent<TInput, T>(e: ITreeMouseEvent<IAsyncDataTreeNode<TInput, T> | null>): ITreeMouseEvent<T> {
	return {
		browserEvent: e.browserEvent,
		element: e.element && e.element.element as T,
		target: e.target
	};
}

function asTreeContextMenuEvent<TInput, T>(e: ITreeContextMenuEvent<IAsyncDataTreeNode<TInput, T> | null>): ITreeContextMenuEvent<T> {
	return {
		browserEvent: e.browserEvent,
		element: e.element && e.element.element as T,
		anchor: e.anchor,
		isStickyScroll: e.isStickyScroll
	};
}

class AsyncDataTreeElementsDragAndDropData<TInput, T, TContext> extends ElementsDragAndDropData<T, TContext> {

	override set context(context: TContext | undefined) {
		this.data.context = context;
	}

	override get context(): TContext | undefined {
		return this.data.context;
	}

	constructor(private data: ElementsDragAndDropData<IAsyncDataTreeNode<TInput, T>, TContext>) {
		super(data.elements.map(node => node.element as T));
	}
}

function asAsyncDataTreeDragAndDropData<TInput, T>(data: IDragAndDropData): IDragAndDropData {
	if (data instanceof ElementsDragAndDropData) {
		return new AsyncDataTreeElementsDragAndDropData(data);
	}

	return data;
}

class AsyncDataTreeNodeListDragAndDrop<TInput, T> implements IListDragAndDrop<IAsyncDataTreeNode<TInput, T>> {

	constructor(private dnd: ITreeDragAndDrop<T>) { }

	getDragURI(node: IAsyncDataTreeNode<TInput, T>): string | null {
		return this.dnd.getDragURI(node.element as T);
	}

	getDragLabel(nodes: IAsyncDataTreeNode<TInput, T>[], originalEvent: DragEvent): string | undefined {
		if (this.dnd.getDragLabel) {
			return this.dnd.getDragLabel(nodes.map(node => node.element as T), originalEvent);
		}

		return undefined;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		this.dnd.onDragStart?.(asAsyncDataTreeDragAndDropData(data), originalEvent);
	}

	onDragOver(data: IDragAndDropData, targetNode: IAsyncDataTreeNode<TInput, T> | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent, raw = true): boolean | IListDragOverReaction {
		return this.dnd.onDragOver(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element as T, targetIndex, targetSector, originalEvent);
	}

	drop(data: IDragAndDropData, targetNode: IAsyncDataTreeNode<TInput, T> | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void {
		this.dnd.drop(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element as T, targetIndex, targetSector, originalEvent);
	}

	onDragEnd(originalEvent: DragEvent): void {
		this.dnd.onDragEnd?.(originalEvent);
	}

	dispose(): void {
		this.dnd.dispose();
	}
}

export interface IAsyncFindProvider<T> {
	toggles?: ITreeFindToggleContribution[];
	placeholder?: string;
	getFindResults(pattern: string, sessionId: number, token: CancellationToken, toggleStates: { id: string; isChecked: boolean }[]): AsyncIterable<T>;
	revealResultInTree?(findElement: T): void;
}

class AsyncFindTreeNode<T> {

	private _children: AsyncFindTreeNode<T>[] = [];
	get children(): Iterable<AsyncFindTreeNode<T>> {
		return this._children.values();
	}

	constructor(
		public element: T | undefined,
		public id: string,
		private readonly sorter: ITreeSorter<T> | undefined,
	) { }

	addChild(child: AsyncFindTreeNode<T>): void {
		if (!this.sorter) {
			this._children.push(child);
			return;
		}

		const index = this._children.findIndex(existingChild => this.sorter!.compare(child.element!, existingChild.element!) < 0);
		if (index !== -1) {
			this._children.splice(index, 0, child);
		} else {
			this._children.push(child);
		}
	}
}

class AsyncFindTree<TInput, T> {

	private cachedNodes = new Map<string, AsyncFindTreeNode<T>>();
	private readonly root = new AsyncFindTreeNode<T>(undefined, '_AsyncFindTreeRoot_', this.sorter);
	get rootNodes(): AsyncFindTreeNode<T>[] {
		return [...this.root.children];
	}

	private _totalLeafs: number = 0;
	get totalLeafs(): number {
		return this._totalLeafs;
	}

	get totalNodes(): number {
		return this.cachedNodes.size;
	}

	constructor(
		private readonly dataSource: IAsyncDataSource<TInput, T>,
		private readonly identityProvider: IIdentityProvider<T>,
		private readonly sorter?: ITreeSorter<T>,
	) {
		if (!dataSource.getParent) {
			throw new Error('Data source must implement `getParent`');
		}
	}

	add(element: T): void {
		const elementId = this.identityProvider.getId(element).toString();
		if (this.cachedNodes.has(elementId)) {
			return;
		}

		this._totalLeafs++;

		const node = new AsyncFindTreeNode(element, elementId, this.sorter);
		this.cachedNodes.set(elementId, node);

		// Set up parents up till root
		let currentNode = node;
		while (true) {
			let currentParentElement = this.dataSource.getParent!(currentNode.element!);

			// is root
			if (currentParentElement === currentNode.element) {
				this.root.addChild(currentNode);
				break;
			}
			currentParentElement = currentParentElement as T;

			// is already in the tree
			const parentId = this.identityProvider.getId(currentParentElement).toString();
			const parentNode = this.cachedNodes.get(parentId);
			if (parentNode) {
				parentNode.addChild(currentNode);
				break;
			}

			// create parent node
			const newParent = new AsyncFindTreeNode(currentParentElement, parentId, this.sorter);
			this.cachedNodes.set(parentId, newParent);
			newParent.addChild(currentNode);

			currentNode = newParent;
		}
	}
}

class AsyncFindFilter<TInput, T> implements IFindFilter<IAsyncDataTreeNode<TInput, T>>, IDisposable {
	private _pattern: string = '';
	private _lowercasePattern: string = '';
	private readonly disposables = new DisposableStore();

	get pattern(): string {
		return this._pattern;
	}
	set pattern(pattern: string) {
		this._pattern = pattern;
		this._lowercasePattern = pattern.toLowerCase();
	}

	constructor(
		private keyboardNavigationLabelProvider: IKeyboardNavigationLabelProvider<T>,
		private _filter?: ITreeFilter<IAsyncDataTreeNode<TInput, T>, FuzzyScore>,
	) { }

	filter(element: IAsyncDataTreeNode<TInput, T>, parentVisibility: TreeVisibility): TreeFilterResult<FuzzyScore | LabelFuzzyScore> {
		let visibility = TreeVisibility.Visible;

		if (this._filter) {
			const result = this._filter.filter(element, parentVisibility);

			if (typeof result === 'boolean') {
				visibility = result ? TreeVisibility.Visible : TreeVisibility.Hidden;
			} else if (isFilterResult(result)) {
				visibility = getVisibleState(result.visibility);
			} else {
				visibility = result;
			}

			if (visibility === TreeVisibility.Hidden) {
				return false;
			}
		}

		if (!this._pattern) {
			return { data: FuzzyScore.Default, visibility };
		}

		const label = this.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(element.element as T);
		const labels = Array.isArray(label) ? label : [label];

		for (const l of labels) {
			const labelStr: string = l && l.toString();
			if (typeof labelStr === 'undefined') {
				return { data: FuzzyScore.Default, visibility };
			}

			const score = fuzzyScore(this._pattern, this._lowercasePattern, 0, labelStr, labelStr.toLowerCase(), 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
			if (score) {
				return labels.length === 1 ?
					{ data: score, visibility } :
					{ data: { label: labelStr, score: score }, visibility };
			}
		}

		return { data: FuzzyScore.Default, visibility };
	}

	dispose(): void {
		dispose(this.disposables);
	}
}

class AsyncFindController<TInput, T, TFilterData> extends AbstractFindController<IAsyncDataTreeNode<TInput, T> | null, TFilterData> {

	declare protected readonly filter: AsyncFindFilter<TInput, T>;
	private readonly model: ITreeModel<IAsyncDataTreeNode<TInput, T> | null, TFilterData, IAsyncDataTreeNode<TInput, T> | null>;
	private readonly nodes = new Map<null | T, IAsyncDataTreeNode<TInput, T>>();

	private previousScrollTop: number | undefined;
	private previousFocus: (IAsyncDataTreeNode<TInput, T> | null)[] = [];
	private previousSelection: (IAsyncDataTreeNode<TInput, T> | null)[] = [];

	private sessionId: number = 0;
	private active: boolean = false;

	private activeTokenSource: CancellationTokenSource | undefined;
	private scheduler: TimeoutTimer;

	private readonly store = new DisposableStore();

	constructor(
		private readonly user: string,
		protected override readonly tree: ObjectTree<IAsyncDataTreeNode<TInput, T>, TFilterData>,
		private readonly findProvider: IAsyncFindProvider<T>,
		filter: AsyncFindFilter<TInput, T>,
		private readonly sorter: ITreeSorter<T> | undefined,
		private readonly dataSource: IAsyncDataSource<TInput, T>,
		private readonly identityProvider: IIdentityProvider<T>,
		contextViewProvider: IContextViewProvider,
		options: IAbstractTreeOptions<IAsyncDataTreeNode<TInput, T>, TFilterData>,
		private readonly asTreeElement: (node: IAsyncDataTreeNode<TInput, T>) => IObjectTreeElement<IAsyncDataTreeNode<TInput, T>>,
	) {
		super(tree as any, filter, contextViewProvider, { ...options, placeholder: findProvider.placeholder, toggles: findProvider.toggles });

		this.model = tree.getModel();
		this.scheduler = this.store.add(new TimeoutTimer());
	}

	private setFindModeActive(active: boolean): void {
		if (this.active === active) {
			return;
		}

		if (active) {
			this.activateFindMode();
		} else {
			this.deactivateFindMode();
		}

		this.active = active;
	}

	private activateFindMode(): void {
		this.sessionId++;

		// store tree view state
		this.previousScrollTop = this.tree.scrollTop;
		this.previousFocus = this.tree.getFocus();
		this.previousSelection = this.tree.getSelection();

		this.tree.scrollTop = 0;
		const findModel = this.tree.createNewModel({ filter: this.filter as ITreeFilter<IAsyncDataTreeNode<TInput, T> | null, TFilterData> });
		this.tree.setModel(findModel);
	}

	private deactivateFindMode(): void {
		const focus = this.tree.getFocus()[0];
		this.tree.setModel(this.model);

		if (focus && focus.element && this.findProvider.revealResultInTree) {
			this.findProvider.revealResultInTree(focus.element as T);
		} else {
			this.tree.scrollTop = this.previousScrollTop ?? 0;
			this.tree.setFocus(this.previousFocus);
			this.tree.setSelection(this.previousSelection);
		}

		this.activeTokenSource = undefined;
		this.nodes.clear();
	}

	protected applyPattern(pattern: string): void {
		this.renderMessage(false);
		this.scheduler.cancel();
		this.activeTokenSource?.cancel();

		if (!pattern) {
			this.setFindModeActive(false);
			return;
		}

		this.activeTokenSource = new CancellationTokenSource();

		const results = this.findProvider.getFindResults(pattern, this.sessionId, this.activeTokenSource.token, this.toggles.states());
		this.pocessFindResults(results, this.activeTokenSource.token);
	}

	private async pocessFindResults(results: AsyncIterable<T>, token: CancellationToken): Promise<void> {
		if (!this.dataSource.getParent || !this.identityProvider) {
			return;
		}

		// Remove all nodes
		this.clearFindResults();

		const findTree = new AsyncFindTree<TInput, T>(this.dataSource, this.identityProvider, this.sorter);
		for await (const result of results) {
			if (token.isCancellationRequested) {
				return;
			}

			findTree.add(result);
		}

		if (token.isCancellationRequested) {
			return;
		}

		// Redraw at the end
		this.setFindResults(findTree);

		this.activeTokenSource?.dispose();
		this.activeTokenSource = undefined;
	}

	private clearFindResults(): void {
		this.schedule(() => {
			if (!this.active) {
				this.setFindModeActive(true);
				return;
			} else {
				this.tree.setChildren(null, []);
			}
		}, 600);
	}

	private setFindResults(findTree: AsyncFindTree<TInput, T>): void {
		const rootChildren: IObjectTreeElement<IAsyncDataTreeNode<TInput, T>>[] = [];
		for (const rootNodes of findTree.rootNodes) {
			rootChildren.push(this.asTreeElement(this.findNodeToAsyncNode(rootNodes, null)));
		}

		this.schedule(() => {
			this.setFindModeActive(true);
			this.tree.setChildren(null, rootChildren);
			this.renderMessage(rootChildren.length === 0);
			this.alertResults(findTree.totalLeafs);
		}, 0);
	}

	protected findNodeToAsyncNode(node: AsyncFindTreeNode<T>, parent: IAsyncDataTreeNode<TInput, T> | null): IAsyncDataTreeNode<TInput, T> {
		const children: IAsyncDataTreeNode<TInput, T>[] = [];

		if (node.element === undefined) {
			throw new TreeError(this.user, 'Found node without an element');
		}

		const asyncNode: IAsyncDataTreeNode<TInput, T> = {
			element: node.element,
			parent,
			children,
			hasChildren: false,
			defaultCollapseState: ObjectTreeElementCollapseState.PreserveOrExpanded,
			stale: false,
			refreshPromise: undefined,
			slow: false,
			forceExpanded: false
		};

		for (const child of node.children) {
			children.push(this.findNodeToAsyncNode(child, asyncNode));
		}

		asyncNode.hasChildren = !!children.length;

		this.nodes.set(node.element, asyncNode);

		return asyncNode;
	}

	private schedule(fn: () => void, delay: number) {
		if (delay === 0) {
			this.scheduler.cancel();
			fn();
			return;
		}
		this.scheduler.cancelAndSet(fn, delay);
	}

	protected override onDidToggleChange(e: ITreeFindToggleChangeEvent): void {
		super.onDidToggleChange(e);
		this.applyPattern(this.pattern);
	}

	getDataNode(element: TInput | T): IAsyncDataTreeNode<TInput, T> | undefined {
		return this.nodes.get(element as T);
	}

	override dispose(): void {
		super.dispose();
		this.store.dispose();
	}
}

function asObjectTreeOptions<TInput, T, TFilterData>(options?: IAsyncDataTreeOptions<T, TFilterData>): IObjectTreeOptions<IAsyncDataTreeNode<TInput, T>, TFilterData> | undefined {
	return options && {
		...options,
		collapseByDefault: true,
		identityProvider: options.identityProvider && {
			getId(el) {
				return options.identityProvider!.getId(el.element as T);
			}
		},
		dnd: options.dnd && new AsyncDataTreeNodeListDragAndDrop(options.dnd),
		multipleSelectionController: options.multipleSelectionController && {
			isSelectionSingleChangeEvent(e) {
				return options.multipleSelectionController!.isSelectionSingleChangeEvent({ ...e, element: e.element } as any);
			},
			isSelectionRangeChangeEvent(e) {
				return options.multipleSelectionController!.isSelectionRangeChangeEvent({ ...e, element: e.element } as any);
			}
		},
		accessibilityProvider: options.accessibilityProvider && {
			...options.accessibilityProvider,
			getPosInSet: undefined,
			getSetSize: undefined,
			getRole: options.accessibilityProvider.getRole ? (el) => {
				return options.accessibilityProvider!.getRole!(el.element as T);
			} : () => 'treeitem',
			isChecked: options.accessibilityProvider.isChecked ? (e) => {
				return !!(options.accessibilityProvider?.isChecked!(e.element as T));
			} : undefined,
			getAriaLabel(e) {
				return options.accessibilityProvider!.getAriaLabel(e.element as T);
			},
			getWidgetAriaLabel() {
				return options.accessibilityProvider!.getWidgetAriaLabel();
			},
			getWidgetRole: options.accessibilityProvider.getWidgetRole ? () => options.accessibilityProvider!.getWidgetRole!() : () => 'tree',
			getAriaLevel: options.accessibilityProvider.getAriaLevel && (node => {
				return options.accessibilityProvider!.getAriaLevel!(node.element as T);
			}),
			getActiveDescendantId: options.accessibilityProvider.getActiveDescendantId && (node => {
				return options.accessibilityProvider!.getActiveDescendantId!(node.element as T);
			})
		},
		filter: options.filter && {
			filter(e, parentVisibility) {
				return options.filter!.filter(e.element as T, parentVisibility);
			}
		},
		keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
			...options.keyboardNavigationLabelProvider,
			getKeyboardNavigationLabel(e) {
				return options.keyboardNavigationLabelProvider!.getKeyboardNavigationLabel(e.element as T);
			}
		},
		sorter: undefined,
		expandOnlyOnTwistieClick: typeof options.expandOnlyOnTwistieClick === 'undefined' ? undefined : (
			typeof options.expandOnlyOnTwistieClick !== 'function' ? options.expandOnlyOnTwistieClick : (
				e => (options.expandOnlyOnTwistieClick as ((e: T) => boolean))(e.element as T)
			)
		),
		defaultFindVisibility: e => {
			if (e.hasChildren && e.stale) {
				return TreeVisibility.Visible;
			} else if (typeof options.defaultFindVisibility === 'number') {
				return options.defaultFindVisibility;
			} else if (typeof options.defaultFindVisibility === 'undefined') {
				return TreeVisibility.Recurse;
			} else {
				return (options.defaultFindVisibility as ((e: T) => TreeVisibility))(e.element as T);
			}
		}
	};
}

export interface IAsyncDataTreeOptionsUpdate extends IAbstractTreeOptionsUpdate { }
export interface IAsyncDataTreeUpdateChildrenOptions<T> extends IObjectTreeSetChildrenOptions<T> { }

export interface IAsyncDataTreeOptions<T, TFilterData = void> extends IAsyncDataTreeOptionsUpdate, Pick<IAbstractTreeOptions<T, TFilterData>, Exclude<keyof IAbstractTreeOptions<T, TFilterData>, 'collapseByDefault'>> {
	readonly collapseByDefault?: { (e: T): boolean };
	readonly identityProvider?: IIdentityProvider<T>;
	readonly sorter?: ITreeSorter<T>;
	readonly autoExpandSingleChildren?: boolean;
	readonly findResultsProvider?: IAsyncFindProvider<T>;
}

export interface IAsyncDataTreeViewState {
	readonly focus?: string[];
	readonly selection?: string[];
	readonly expanded?: string[];
	readonly scrollTop?: number;
}

interface IAsyncDataTreeViewStateContext<TInput, T> {
	readonly viewState: IAsyncDataTreeViewState;
	readonly selection: IAsyncDataTreeNode<TInput, T>[];
	readonly focus: IAsyncDataTreeNode<TInput, T>[];
}

function dfs<TInput, T>(node: IAsyncDataTreeNode<TInput, T>, fn: (node: IAsyncDataTreeNode<TInput, T>) => void): void {
	fn(node);
	node.children.forEach(child => dfs(child, fn));
}

export class AsyncDataTree<TInput, T, TFilterData = void> implements IDisposable {

	protected readonly tree: ObjectTree<IAsyncDataTreeNode<TInput, T>, TFilterData>;
	private readonly model: IObjectTreeModel<IAsyncDataTreeNode<TInput, T> | null, TFilterData>;
	protected readonly root: IAsyncDataTreeNode<TInput, T>;
	private readonly nodes = new Map<null | T, IAsyncDataTreeNode<TInput, T>>();
	private readonly sorter?: ITreeSorter<T>;
	private readonly findController?: AsyncFindController<TInput, T, TFilterData>;
	private readonly getDefaultCollapseState: { (e: T): undefined | ObjectTreeElementCollapseState.PreserveOrCollapsed | ObjectTreeElementCollapseState.PreserveOrExpanded };

	private readonly subTreeRefreshPromises = new Map<IAsyncDataTreeNode<TInput, T>, Promise<void>>();
	private readonly refreshPromises = new Map<IAsyncDataTreeNode<TInput, T>, CancelablePromise<Iterable<T>>>();

	protected readonly identityProvider?: IIdentityProvider<T>;
	private readonly autoExpandSingleChildren: boolean;

	private readonly _onDidRender = new Emitter<void>();
	protected readonly _onDidChangeNodeSlowState = new Emitter<IAsyncDataTreeNode<TInput, T>>();

	protected readonly nodeMapper: AsyncDataTreeNodeMapper<TInput, T, TFilterData> = new WeakMapper(node => new AsyncDataTreeNodeWrapper(node));

	protected readonly disposables = new DisposableStore();

	get onDidScroll(): Event<ScrollEvent> { return this.tree.onDidScroll; }

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return Event.map(this.tree.onDidChangeFocus, asTreeEvent); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return Event.map(this.tree.onDidChangeSelection, asTreeEvent); }

	get onKeyDown(): Event<KeyboardEvent> { return this.tree.onKeyDown; }
	get onMouseClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.tree.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.tree.onMouseDblClick, asTreeMouseEvent); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return Event.map(this.tree.onContextMenu, asTreeContextMenuEvent); }
	get onTap(): Event<ITreeMouseEvent<T>> { return Event.map(this.tree.onTap, asTreeMouseEvent); }
	get onPointer(): Event<ITreeMouseEvent<T>> { return Event.map(this.tree.onPointer, asTreeMouseEvent); }
	get onDidFocus(): Event<void> { return this.tree.onDidFocus; }
	get onDidBlur(): Event<void> { return this.tree.onDidBlur; }

	/**
	 * To be used internally only!
	 * @deprecated
	 */
	get onDidChangeModel(): Event<void> { return this.tree.onDidChangeModel; }
	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<IAsyncDataTreeNode<TInput, T> | null, TFilterData>> { return this.tree.onDidChangeCollapseState; }

	get onDidUpdateOptions(): Event<IAsyncDataTreeOptionsUpdate> { return this.tree.onDidUpdateOptions; }

	readonly onDidChangeFindOpenState: Event<boolean>;
	get onDidChangeStickyScrollFocused(): Event<boolean> { return this.tree.onDidChangeStickyScrollFocused; }

	get findMode(): TreeFindMode { return this.tree.findMode; }
	set findMode(mode: TreeFindMode) { this.tree.findMode = mode; }
	readonly onDidChangeFindMode: Event<TreeFindMode>;

	get findMatchType(): TreeFindMatchType { return this.tree.findMatchType; }
	set findMatchType(matchType: TreeFindMatchType) { this.tree.findMatchType = matchType; }
	readonly onDidChangeFindMatchType: Event<TreeFindMatchType>;

	get expandOnlyOnTwistieClick(): boolean | ((e: T) => boolean) {
		if (typeof this.tree.expandOnlyOnTwistieClick === 'boolean') {
			return this.tree.expandOnlyOnTwistieClick;
		}

		const fn = this.tree.expandOnlyOnTwistieClick;
		return element => fn(this.nodes.get((element === this.root.element ? null : element) as T) || null);
	}

	get onDidDispose(): Event<void> { return this.tree.onDidDispose; }

	constructor(
		protected user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		private dataSource: IAsyncDataSource<TInput, T>,
		options: IAsyncDataTreeOptions<T, TFilterData> = {}
	) {
		this.identityProvider = options.identityProvider;
		this.autoExpandSingleChildren = typeof options.autoExpandSingleChildren === 'undefined' ? false : options.autoExpandSingleChildren;
		this.sorter = options.sorter;
		this.getDefaultCollapseState = e => options.collapseByDefault ? (options.collapseByDefault(e) ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded) : undefined;

		let asyncFindEnabled = false;
		if (options.findResultsProvider && (options.findWidgetEnabled ?? true) && options.keyboardNavigationLabelProvider && options.contextViewProvider) {
			if (!this.dataSource.getParent || !this.identityProvider) {
				throw new TreeError(this.user, 'Find Provider requires `getParent` and `identityProvider`');
			}
			asyncFindEnabled = true;
		}

		this.tree = this.createTree(user, container, delegate, renderers, { ...options, findWidgetEnabled: !asyncFindEnabled });
		this.model = this.tree.getModel() as IObjectTreeModel<IAsyncDataTreeNode<TInput, T> | null, TFilterData>;

		this.root = createAsyncDataTreeNode({
			element: undefined!,
			parent: null,
			hasChildren: true,
			defaultCollapseState: undefined
		});

		if (this.identityProvider) {
			this.root = {
				...this.root,
				id: null
			};
		}

		this.nodes.set(null, this.root);

		this.tree.onDidChangeCollapseState(this._onDidChangeCollapseState, this, this.disposables);

		if (asyncFindEnabled) {
			const findFilter = this.disposables.add(new AsyncFindFilter<TInput, T>(options.keyboardNavigationLabelProvider as any, this.tree.options.filter as ITreeFilter<IAsyncDataTreeNode<TInput, T>, FuzzyScore>));
			const findOptions = { styles: options.findWidgetStyles, showNotFoundMessage: options.showNotFoundMessage };
			this.findController = this.disposables.add(new AsyncFindController(user, this.tree, options.findResultsProvider!, findFilter!, this.sorter, this.dataSource, this.identityProvider!, options.contextViewProvider!, findOptions, node => this.asTreeElement(node)));

			this.onDidChangeFindOpenState = this.findController!.onDidChangeOpenState;
			this.onDidChangeFindMode = Event.None;
			this.onDidChangeFindMatchType = Event.None;
		} else {
			this.onDidChangeFindOpenState = this.tree.onDidChangeFindOpenState;
			this.onDidChangeFindMode = this.tree.onDidChangeFindMode;
			this.onDidChangeFindMatchType = this.tree.onDidChangeFindMatchType;
		}
	}

	protected createTree(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		options: IAsyncDataTreeOptions<T, TFilterData>
	): ObjectTree<IAsyncDataTreeNode<TInput, T>, TFilterData> {
		const objectTreeDelegate = new ComposedTreeDelegate<TInput | T, IAsyncDataTreeNode<TInput, T>>(delegate);
		const objectTreeRenderers = renderers.map(r => new AsyncDataTreeRenderer(r, this.nodeMapper, this._onDidChangeNodeSlowState.event));
		const objectTreeOptions = asObjectTreeOptions<TInput, T, TFilterData>(options) || {};

		return new ObjectTree(user, container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
	}

	updateOptions(options: IAsyncDataTreeOptionsUpdate = {}): void {
		this.tree.updateOptions(options);
	}

	get options(): IAsyncDataTreeOptions<T, TFilterData> {
		return this.tree.options as IAsyncDataTreeOptions<T, TFilterData>;
	}

	// Widget

	getHTMLElement(): HTMLElement {
		return this.tree.getHTMLElement();
	}

	get contentHeight(): number {
		return this.tree.contentHeight;
	}

	get contentWidth(): number {
		return this.tree.contentWidth;
	}

	get onDidChangeContentHeight(): Event<number> {
		return this.tree.onDidChangeContentHeight;
	}

	get onDidChangeContentWidth(): Event<number> {
		return this.tree.onDidChangeContentWidth;
	}

	get scrollTop(): number {
		return this.tree.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this.tree.scrollTop = scrollTop;
	}

	get scrollLeft(): number {
		return this.tree.scrollLeft;
	}

	set scrollLeft(scrollLeft: number) {
		this.tree.scrollLeft = scrollLeft;
	}

	get scrollHeight(): number {
		return this.tree.scrollHeight;
	}

	get renderHeight(): number {
		return this.tree.renderHeight;
	}

	get lastVisibleElement(): T {
		return this.tree.lastVisibleElement!.element as T;
	}

	get ariaLabel(): string {
		return this.tree.ariaLabel;
	}

	set ariaLabel(value: string) {
		this.tree.ariaLabel = value;
	}

	domFocus(): void {
		this.tree.domFocus();
	}

	isDOMFocused(): boolean {
		return this.tree.isDOMFocused();
	}

	navigate(start?: T) {
		let startNode;
		if (start) {
			startNode = this.getDataNode(start);
		}
		return new AsyncDataTreeNavigator(this.tree.navigate(startNode));
	}

	layout(height?: number, width?: number): void {
		this.tree.layout(height, width);

		if (isNumber(width)) {
			this.findController?.layout(width);
		}
	}

	style(styles: IListStyles): void {
		this.tree.style(styles);
	}

	// Model

	getInput(): TInput | undefined {
		return this.root.element as TInput;
	}

	async setInput(input: TInput, viewState?: IAsyncDataTreeViewState): Promise<void> {
		this.refreshPromises.forEach(promise => promise.cancel());
		this.refreshPromises.clear();

		this.root.element = input!;

		const viewStateContext: IAsyncDataTreeViewStateContext<TInput, T> | undefined = viewState && { viewState, focus: [], selection: [] };

		await this._updateChildren(input, true, false, viewStateContext);

		if (viewStateContext) {
			this.tree.setFocus(viewStateContext.focus);
			this.tree.setSelection(viewStateContext.selection);
		}

		if (viewState && typeof viewState.scrollTop === 'number') {
			this.scrollTop = viewState.scrollTop;
		}
	}

	async updateChildren(element: TInput | T = this.root.element, recursive = true, rerender = false, options?: IAsyncDataTreeUpdateChildrenOptions<T>): Promise<void> {
		await this._updateChildren(element, recursive, rerender, undefined, options);
	}

	private async _updateChildren(element: TInput | T = this.root.element, recursive = true, rerender = false, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>, options?: IAsyncDataTreeUpdateChildrenOptions<T>): Promise<void> {
		if (typeof this.root.element === 'undefined') {
			throw new TreeError(this.user, 'Tree input not set');
		}

		if (this.root.refreshPromise) {
			await this.root.refreshPromise;
			await Event.toPromise(this._onDidRender.event);
		}

		const node = this.getDataNode(element);
		await this.refreshAndRenderNode(node, recursive, viewStateContext, options);

		if (rerender) {
			try {
				this.tree.rerender(node);
			} catch {
				// missing nodes are fine, this could've resulted from
				// parallel refresh calls, removing `node` altogether
			}
		}
	}

	resort(element: TInput | T = this.root.element, recursive = true): void {
		this.model.resort(this.getDataNode(element), recursive);
	}

	hasNode(element: TInput | T): boolean {
		return element === this.root.element || this.nodes.has(element as T);
	}

	// View

	rerender(element?: T): void {
		if (element === undefined || element === this.root.element) {
			this.tree.rerender();
			return;
		}

		const node = this.getDataNode(element);
		this.tree.rerender(node);
	}

	updateElementHeight(element: T, height: number | undefined): void {
		const node = this.getDataNode(element);
		this.tree.updateElementHeight(node, height);
	}

	updateWidth(element: T): void {
		const node = this.getDataNode(element);
		this.tree.updateWidth(node);
	}

	// Tree

	getNode(element: TInput | T = this.root.element): ITreeNode<TInput | T, TFilterData> {
		const dataNode = this.getDataNode(element);
		const node = this.tree.getNode(dataNode === this.root ? null : dataNode);
		return this.nodeMapper.map(node);
	}

	collapse(element: T, recursive: boolean = false): boolean {
		const node = this.getDataNode(element);
		return this.tree.collapse(node === this.root ? null : node, recursive);
	}

	async expand(element: T, recursive: boolean = false): Promise<boolean> {
		if (typeof this.root.element === 'undefined') {
			throw new TreeError(this.user, 'Tree input not set');
		}

		if (this.root.refreshPromise) {
			await this.root.refreshPromise;
			await Event.toPromise(this._onDidRender.event);
		}

		const node = this.getDataNode(element);

		if (this.tree.hasElement(node) && !this.tree.isCollapsible(node)) {
			return false;
		}

		if (node.refreshPromise) {
			await this.root.refreshPromise;
			await Event.toPromise(this._onDidRender.event);
		}

		if (node !== this.root && !node.refreshPromise && !this.tree.isCollapsed(node)) {
			return false;
		}

		const result = this.tree.expand(node === this.root ? null : node, recursive);

		if (node.refreshPromise) {
			await this.root.refreshPromise;
			await Event.toPromise(this._onDidRender.event);
		}

		return result;
	}

	toggleCollapsed(element: T, recursive: boolean = false): boolean {
		return this.tree.toggleCollapsed(this.getDataNode(element), recursive);
	}

	expandAll(): void {
		this.tree.expandAll();
	}

	async expandTo(element: T): Promise<void> {
		if (!this.dataSource.getParent) {
			throw new Error('Can\'t expand to element without getParent method');
		}

		const elements: T[] = [];

		while (!this.hasNode(element)) {
			element = this.dataSource.getParent(element) as T;

			if (element !== this.root.element) {
				elements.push(element);
			}
		}

		for (const element of Iterable.reverse(elements)) {
			await this.expand(element);
		}

		this.tree.expandTo(this.getDataNode(element));
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	isCollapsible(element: T): boolean {
		return this.tree.isCollapsible(this.getDataNode(element));
	}

	isCollapsed(element: TInput | T): boolean {
		return this.tree.isCollapsed(this.getDataNode(element));
	}

	triggerTypeNavigation(): void {
		this.tree.triggerTypeNavigation();
	}

	openFind(): void {
		if (this.findController) {
			this.findController.open();
		} else {
			this.tree.openFind();
		}
	}

	closeFind(): void {
		if (this.findController) {
			this.findController.close();
		} else {
			this.tree.closeFind();
		}
	}

	refilter(): void {
		this.tree.refilter();
	}

	setAnchor(element: T | undefined): void {
		this.tree.setAnchor(typeof element === 'undefined' ? undefined : this.getDataNode(element));
	}

	getAnchor(): T | undefined {
		const node = this.tree.getAnchor();
		return node?.element as T;
	}

	setSelection(elements: T[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.getDataNode(e));
		this.tree.setSelection(nodes, browserEvent);
	}

	getSelection(): T[] {
		const nodes = this.tree.getSelection();
		return nodes.map(n => n!.element as T);
	}

	setFocus(elements: T[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.getDataNode(e));
		this.tree.setFocus(nodes, browserEvent);
	}

	focusNext(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.tree.focusNext(n, loop, browserEvent);
	}

	focusPrevious(n = 1, loop = false, browserEvent?: UIEvent): void {
		this.tree.focusPrevious(n, loop, browserEvent);
	}

	focusNextPage(browserEvent?: UIEvent): Promise<void> {
		return this.tree.focusNextPage(browserEvent);
	}

	focusPreviousPage(browserEvent?: UIEvent): Promise<void> {
		return this.tree.focusPreviousPage(browserEvent);
	}

	focusLast(browserEvent?: UIEvent): void {
		this.tree.focusLast(browserEvent);
	}

	focusFirst(browserEvent?: UIEvent): void {
		this.tree.focusFirst(browserEvent);
	}

	getFocus(): T[] {
		const nodes = this.tree.getFocus();
		return nodes.map(n => n!.element as T);
	}

	getStickyScrollFocus(): T[] {
		const nodes = this.tree.getStickyScrollFocus();
		return nodes.map(n => n!.element as T);
	}

	getFocusedPart(): AbstractTreePart {
		return this.tree.getFocusedPart();
	}

	reveal(element: T, relativeTop?: number): void {
		this.tree.reveal(this.getDataNode(element), relativeTop);
	}

	getRelativeTop(element: T): number | null {
		return this.tree.getRelativeTop(this.getDataNode(element));
	}

	// Tree navigation

	getParentElement(element: T): TInput | T {
		const node = this.tree.getParentElement(this.getDataNode(element));
		return (node && node.element)!;
	}

	getFirstElementChild(element: TInput | T = this.root.element): TInput | T | undefined {
		const dataNode = this.getDataNode(element);
		const node = this.tree.getFirstElementChild(dataNode === this.root ? null : dataNode);
		return (node && node.element)!;
	}

	// Implementation

	protected getDataNode(element: TInput | T): IAsyncDataTreeNode<TInput, T> {
		const asyncFindNode: IAsyncDataTreeNode<TInput, T> | undefined = this.findController?.getDataNode(element);

		if (asyncFindNode) {
			return asyncFindNode;
		}

		const node: IAsyncDataTreeNode<TInput, T> | undefined = this.nodes.get((element === this.root.element ? null : element) as T);

		if (!node) {
			throw new TreeError(this.user, `Data tree node not found: ${element}`);
		}

		return node;
	}

	private async refreshAndRenderNode(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>, options?: IAsyncDataTreeUpdateChildrenOptions<T>): Promise<void> {
		await this.refreshNode(node, recursive, viewStateContext);
		if (this.disposables.isDisposed) {
			return; // tree disposed during refresh (#199264)
		}
		this.render(node, viewStateContext, options);
	}

	private async refreshNode(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): Promise<void> {
		let result: Promise<void> | undefined;

		this.subTreeRefreshPromises.forEach((refreshPromise, refreshNode) => {
			if (!result && intersects(refreshNode, node)) {
				result = refreshPromise.then(() => this.refreshNode(node, recursive, viewStateContext));
			}
		});

		if (result) {
			return result;
		}

		if (node !== this.root) {
			const treeNode = this.tree.getNode(node);

			if (treeNode.collapsed) {
				node.hasChildren = !!this.dataSource.hasChildren(node.element);
				node.stale = true;
				this.setChildren(node, [], recursive, viewStateContext);
				return;
			}
		}

		return this.doRefreshSubTree(node, recursive, viewStateContext);
	}

	private async doRefreshSubTree(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): Promise<void> {
		let done: () => void;
		node.refreshPromise = new Promise(c => done = c);
		this.subTreeRefreshPromises.set(node, node.refreshPromise);

		node.refreshPromise.finally(() => {
			node.refreshPromise = undefined;
			this.subTreeRefreshPromises.delete(node);
		});

		try {
			const childrenToRefresh = await this.doRefreshNode(node, recursive, viewStateContext);
			node.stale = false;

			await Promises.settled(childrenToRefresh.map(child => this.doRefreshSubTree(child, recursive, viewStateContext)));
		} finally {
			done!();
		}
	}

	private async doRefreshNode(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): Promise<IAsyncDataTreeNode<TInput, T>[]> {
		node.hasChildren = !!this.dataSource.hasChildren(node.element);

		let childrenPromise: Promise<Iterable<T>>;

		if (!node.hasChildren) {
			childrenPromise = Promise.resolve(Iterable.empty());
		} else {
			const children = this.doGetChildren(node);
			if (isIterable(children)) {
				childrenPromise = Promise.resolve(children);
			} else {
				const slowTimeout = timeout(800);

				slowTimeout.then(() => {
					node.slow = true;
					this._onDidChangeNodeSlowState.fire(node);
				}, _ => null);

				childrenPromise = children.finally(() => slowTimeout.cancel());
			}
		}

		try {
			const children = await childrenPromise;
			return this.setChildren(node, children, recursive, viewStateContext);
		} catch (err) {
			if (node !== this.root && this.model.has(node)) {
				this.model.setCollapsed(node);
			}

			if (isCancellationError(err)) {
				return [];
			}

			throw err;
		} finally {
			if (node.slow) {
				node.slow = false;
				this._onDidChangeNodeSlowState.fire(node);
			}
		}
	}

	private doGetChildren(node: IAsyncDataTreeNode<TInput, T>): Promise<Iterable<T>> | Iterable<T> {
		let result = this.refreshPromises.get(node);

		if (result) {
			return result;
		}
		const children = this.dataSource.getChildren(node.element);
		if (isIterable(children)) {
			return this.processChildren(children);
		} else {
			result = createCancelablePromise(async () => this.processChildren(await children));
			this.refreshPromises.set(node, result);
			return result.finally(() => { this.refreshPromises.delete(node); });
		}
	}

	private _onDidChangeCollapseState({ node, deep }: ICollapseStateChangeEvent<IAsyncDataTreeNode<TInput, T> | null, any>): void {
		if (node.element === null) {
			return;
		}

		if (!node.collapsed && node.element.stale) {
			if (deep) {
				this.collapse(node.element.element as T);
			} else {
				this.refreshAndRenderNode(node.element, false)
					.catch(onUnexpectedError);
			}
		}
	}

	private setChildren(node: IAsyncDataTreeNode<TInput, T>, childrenElementsIterable: Iterable<T>, recursive: boolean, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): IAsyncDataTreeNode<TInput, T>[] {
		const childrenElements = [...childrenElementsIterable];

		// perf: if the node was and still is a leaf, avoid all this hassle
		if (node.children.length === 0 && childrenElements.length === 0) {
			return [];
		}

		const nodesToForget = new Map<T, IAsyncDataTreeNode<TInput, T>>();
		const childrenTreeNodesById = new Map<string, { node: IAsyncDataTreeNode<TInput, T>; collapsed: boolean }>();

		for (const child of node.children) {
			nodesToForget.set(child.element as T, child);

			if (this.identityProvider) {
				childrenTreeNodesById.set(child.id!, { node: child, collapsed: this.model.has(child) && this.model.isCollapsed(child) });
			}
		}

		const childrenToRefresh: IAsyncDataTreeNode<TInput, T>[] = [];

		const children = childrenElements.map<IAsyncDataTreeNode<TInput, T>>(element => {
			const hasChildren = !!this.dataSource.hasChildren(element);

			if (!this.identityProvider) {
				const asyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, hasChildren, defaultCollapseState: this.getDefaultCollapseState(element) });

				if (hasChildren && asyncDataTreeNode.defaultCollapseState === ObjectTreeElementCollapseState.PreserveOrExpanded) {
					childrenToRefresh.push(asyncDataTreeNode);
				}

				return asyncDataTreeNode;
			}

			const id = this.identityProvider.getId(element).toString();
			const result = childrenTreeNodesById.get(id);

			if (result) {
				const asyncDataTreeNode = result.node;

				nodesToForget.delete(asyncDataTreeNode.element as T);
				this.nodes.delete(asyncDataTreeNode.element as T);
				this.nodes.set(element, asyncDataTreeNode);

				asyncDataTreeNode.element = element;
				asyncDataTreeNode.hasChildren = hasChildren;

				if (recursive) {
					if (result.collapsed) {
						asyncDataTreeNode.children.forEach(node => dfs(node, node => this.nodes.delete(node.element as T)));
						asyncDataTreeNode.children.splice(0, asyncDataTreeNode.children.length);
						asyncDataTreeNode.stale = true;
					} else {
						childrenToRefresh.push(asyncDataTreeNode);
					}
				} else if (hasChildren && !result.collapsed) {
					childrenToRefresh.push(asyncDataTreeNode);
				}

				return asyncDataTreeNode;
			}

			const childAsyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, id, hasChildren, defaultCollapseState: this.getDefaultCollapseState(element) });

			if (viewStateContext && viewStateContext.viewState.focus && viewStateContext.viewState.focus.indexOf(id) > -1) {
				viewStateContext.focus.push(childAsyncDataTreeNode);
			}

			if (viewStateContext && viewStateContext.viewState.selection && viewStateContext.viewState.selection.indexOf(id) > -1) {
				viewStateContext.selection.push(childAsyncDataTreeNode);
			}

			if (viewStateContext && viewStateContext.viewState.expanded && viewStateContext.viewState.expanded.indexOf(id) > -1) {
				childrenToRefresh.push(childAsyncDataTreeNode);
			} else if (hasChildren && childAsyncDataTreeNode.defaultCollapseState === ObjectTreeElementCollapseState.PreserveOrExpanded) {
				childrenToRefresh.push(childAsyncDataTreeNode);
			}

			return childAsyncDataTreeNode;
		});

		for (const node of nodesToForget.values()) {
			dfs(node, node => this.nodes.delete(node.element as T));
		}

		for (const child of children) {
			this.nodes.set(child.element as T, child);
		}

		node.children.splice(0, node.children.length, ...children);

		// TODO@joao this doesn't take filter into account
		if (node !== this.root && this.autoExpandSingleChildren && children.length === 1 && childrenToRefresh.length === 0) {
			children[0].forceExpanded = true;
			childrenToRefresh.push(children[0]);
		}

		return childrenToRefresh;
	}

	protected render(node: IAsyncDataTreeNode<TInput, T>, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>, options?: IAsyncDataTreeUpdateChildrenOptions<T>): void {
		const children = node.children.map(node => this.asTreeElement(node, viewStateContext));
		const objectTreeOptions: IObjectTreeSetChildrenOptions<IAsyncDataTreeNode<TInput, T>> | undefined = options && {
			...options,
			diffIdentityProvider: options.diffIdentityProvider && {
				getId(node: IAsyncDataTreeNode<TInput, T>): { toString(): string } {
					return options.diffIdentityProvider!.getId(node.element as T);
				}
			}
		};

		this.model.setChildren(node === this.root ? null : node, children, objectTreeOptions);

		if (node !== this.root) {
			this.model.setCollapsible(node, node.hasChildren);
		}

		this._onDidRender.fire();
	}

	protected asTreeElement(node: IAsyncDataTreeNode<TInput, T>, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): IObjectTreeElement<IAsyncDataTreeNode<TInput, T>> {
		if (node.stale) {
			return {
				element: node,
				collapsible: node.hasChildren,
				collapsed: true
			};
		}

		let collapsed: boolean | ObjectTreeElementCollapseState.PreserveOrCollapsed | ObjectTreeElementCollapseState.PreserveOrExpanded | undefined;

		if (viewStateContext && viewStateContext.viewState.expanded && node.id && viewStateContext.viewState.expanded.indexOf(node.id) > -1) {
			collapsed = false;
		} else if (node.forceExpanded) {
			collapsed = false;
			node.forceExpanded = false;
		} else {
			collapsed = node.defaultCollapseState;
		}

		return {
			element: node,
			children: node.hasChildren ? Iterable.map(node.children, child => this.asTreeElement(child, viewStateContext)) : [],
			collapsible: node.hasChildren,
			collapsed
		};
	}

	protected processChildren(children: Iterable<T>): Iterable<T> {
		if (this.sorter) {
			children = [...children].sort(this.sorter.compare.bind(this.sorter));
		}

		return children;
	}

	// view state

	getViewState(): IAsyncDataTreeViewState {
		if (!this.identityProvider) {
			throw new TreeError(this.user, 'Can\'t get tree view state without an identity provider');
		}

		const getId = (element: T) => this.identityProvider!.getId(element).toString();
		const focus = this.getFocus().map(getId);
		const selection = this.getSelection().map(getId);

		const expanded: string[] = [];
		const root = this.tree.getNode();
		const stack = [root];

		while (stack.length > 0) {
			const node = stack.pop()!;

			if (node !== root && node.collapsible && !node.collapsed) {
				expanded.push(getId(node.element!.element as T));
			}

			stack.push(...node.children);
		}

		return { focus, selection, expanded, scrollTop: this.scrollTop };
	}

	dispose(): void {
		this.disposables.dispose();
		this.tree.dispose();
	}
}

type CompressibleAsyncDataTreeNodeMapper<TInput, T, TFilterData> = WeakMapper<ITreeNode<ICompressedTreeNode<IAsyncDataTreeNode<TInput, T>>, TFilterData>, ITreeNode<ICompressedTreeNode<TInput | T>, TFilterData>>;

class CompressibleAsyncDataTreeNodeWrapper<TInput, T, TFilterData> implements ITreeNode<ICompressedTreeNode<TInput | T>, TFilterData> {

	get element(): ICompressedTreeNode<TInput | T> {
		return {
			elements: this.node.element.elements.map(e => e.element),
			incompressible: this.node.element.incompressible
		};
	}

	get children(): ITreeNode<ICompressedTreeNode<TInput | T>, TFilterData>[] { return this.node.children.map(node => new CompressibleAsyncDataTreeNodeWrapper(node)); }
	get depth(): number { return this.node.depth; }
	get visibleChildrenCount(): number { return this.node.visibleChildrenCount; }
	get visibleChildIndex(): number { return this.node.visibleChildIndex; }
	get collapsible(): boolean { return this.node.collapsible; }
	get collapsed(): boolean { return this.node.collapsed; }
	get visible(): boolean { return this.node.visible; }
	get filterData(): TFilterData | undefined { return this.node.filterData; }

	constructor(private node: ITreeNode<ICompressedTreeNode<IAsyncDataTreeNode<TInput, T>>, TFilterData>) { }
}

class CompressibleAsyncDataTreeRenderer<TInput, T, TFilterData, TTemplateData> implements ICompressibleTreeRenderer<IAsyncDataTreeNode<TInput, T>, TFilterData, IDataTreeListTemplateData<TTemplateData>> {

	readonly templateId: string;
	private renderedNodes = new Map<IAsyncDataTreeNode<TInput, T>, IDataTreeListTemplateData<TTemplateData>>();
	private disposables: IDisposable[] = [];

	constructor(
		protected renderer: ICompressibleTreeRenderer<T, TFilterData, TTemplateData>,
		protected nodeMapper: AsyncDataTreeNodeMapper<TInput, T, TFilterData>,
		private compressibleNodeMapperProvider: () => CompressibleAsyncDataTreeNodeMapper<TInput, T, TFilterData>,
		readonly onDidChangeTwistieState: Event<IAsyncDataTreeNode<TInput, T>>
	) {
		this.templateId = renderer.templateId;
	}

	renderTemplate(container: HTMLElement): IDataTreeListTemplateData<TTemplateData> {
		const templateData = this.renderer.renderTemplate(container);
		return { templateData };
	}

	renderElement(node: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>, height: number | undefined): void {
		this.renderer.renderElement(this.nodeMapper.map(node) as ITreeNode<T, TFilterData>, index, templateData.templateData, height);
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IAsyncDataTreeNode<TInput, T>>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>, height: number | undefined): void {
		this.renderer.renderCompressedElements(this.compressibleNodeMapperProvider().map(node) as ITreeNode<ICompressedTreeNode<T>, TFilterData>, index, templateData.templateData, height);
	}

	renderTwistie(element: IAsyncDataTreeNode<TInput, T>, twistieElement: HTMLElement): boolean {
		if (element.slow) {
			twistieElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
			return true;
		} else {
			twistieElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
			return false;
		}
	}

	disposeElement(node: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>, height: number | undefined): void {
		this.renderer.disposeElement?.(this.nodeMapper.map(node) as ITreeNode<T, TFilterData>, index, templateData.templateData, height);
	}

	disposeCompressedElements(node: ITreeNode<ICompressedTreeNode<IAsyncDataTreeNode<TInput, T>>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>, height: number | undefined): void {
		this.renderer.disposeCompressedElements?.(this.compressibleNodeMapperProvider().map(node) as ITreeNode<ICompressedTreeNode<T>, TFilterData>, index, templateData.templateData, height);
	}

	disposeTemplate(templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.disposables = dispose(this.disposables);
	}
}

export interface ITreeCompressionDelegate<T> {
	isIncompressible(element: T): boolean;
}

function asCompressibleObjectTreeOptions<TInput, T, TFilterData>(options?: ICompressibleAsyncDataTreeOptions<T, TFilterData>): ICompressibleObjectTreeOptions<IAsyncDataTreeNode<TInput, T>, TFilterData> | undefined {
	const objectTreeOptions = options && asObjectTreeOptions(options);

	return objectTreeOptions && {
		...objectTreeOptions,
		keyboardNavigationLabelProvider: objectTreeOptions.keyboardNavigationLabelProvider && {
			...objectTreeOptions.keyboardNavigationLabelProvider,
			getCompressedNodeKeyboardNavigationLabel(els) {
				return options.keyboardNavigationLabelProvider!.getCompressedNodeKeyboardNavigationLabel(els.map(e => e.element as T));
			}
		}
	};
}

export interface ICompressibleAsyncDataTreeOptions<T, TFilterData = void> extends IAsyncDataTreeOptions<T, TFilterData> {
	readonly compressionEnabled?: boolean;
	readonly keyboardNavigationLabelProvider?: ICompressibleKeyboardNavigationLabelProvider<T>;
}

export interface ICompressibleAsyncDataTreeOptionsUpdate extends IAsyncDataTreeOptionsUpdate {
	readonly compressionEnabled?: boolean;
}

export class CompressibleAsyncDataTree<TInput, T, TFilterData = void> extends AsyncDataTree<TInput, T, TFilterData> {

	protected declare readonly tree: CompressibleObjectTree<IAsyncDataTreeNode<TInput, T>, TFilterData>;
	protected readonly compressibleNodeMapper: CompressibleAsyncDataTreeNodeMapper<TInput, T, TFilterData> = new WeakMapper(node => new CompressibleAsyncDataTreeNodeWrapper(node));
	private filter?: ITreeFilter<T, TFilterData>;

	constructor(
		user: string,
		container: HTMLElement,
		virtualDelegate: IListVirtualDelegate<T>,
		private compressionDelegate: ITreeCompressionDelegate<T>,
		renderers: ICompressibleTreeRenderer<T, TFilterData, any>[],
		dataSource: IAsyncDataSource<TInput, T>,
		options: ICompressibleAsyncDataTreeOptions<T, TFilterData> = {}
	) {
		super(user, container, virtualDelegate, renderers, dataSource, options);
		this.filter = options.filter;
	}

	getCompressedTreeNode(e: T | TInput) {
		const node = this.getDataNode(e);
		return this.tree.getCompressedTreeNode(node).element;
	}

	protected override createTree(
		user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ICompressibleTreeRenderer<T, TFilterData, any>[],
		options: ICompressibleAsyncDataTreeOptions<T, TFilterData>
	): ObjectTree<IAsyncDataTreeNode<TInput, T>, TFilterData> {
		const objectTreeDelegate = new ComposedTreeDelegate<TInput | T, IAsyncDataTreeNode<TInput, T>>(delegate);
		const objectTreeRenderers = renderers.map(r => new CompressibleAsyncDataTreeRenderer(r, this.nodeMapper, () => this.compressibleNodeMapper, this._onDidChangeNodeSlowState.event));
		const objectTreeOptions = asCompressibleObjectTreeOptions<TInput, T, TFilterData>(options) || {};

		return new CompressibleObjectTree(user, container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
	}

	protected override asTreeElement(node: IAsyncDataTreeNode<TInput, T>, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): ICompressedTreeElement<IAsyncDataTreeNode<TInput, T>> {
		return {
			incompressible: this.compressionDelegate.isIncompressible(node.element as T),
			...super.asTreeElement(node, viewStateContext)
		};
	}

	override updateOptions(options: ICompressibleAsyncDataTreeOptionsUpdate = {}): void {
		this.tree.updateOptions(options);
	}

	override getViewState(): IAsyncDataTreeViewState {
		if (!this.identityProvider) {
			throw new TreeError(this.user, 'Can\'t get tree view state without an identity provider');
		}

		const getId = (element: T) => this.identityProvider!.getId(element).toString();
		const focus = this.getFocus().map(getId);
		const selection = this.getSelection().map(getId);

		const expanded: string[] = [];
		const root = this.tree.getCompressedTreeNode();
		const stack = [root];

		while (stack.length > 0) {
			const node = stack.pop()!;

			if (node !== root && node.collapsible && !node.collapsed) {
				for (const asyncNode of node.element!.elements) {
					expanded.push(getId(asyncNode.element as T));
				}
			}

			stack.push(...node.children);
		}

		return { focus, selection, expanded, scrollTop: this.scrollTop };
	}

	protected override render(node: IAsyncDataTreeNode<TInput, T>, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>, options?: IAsyncDataTreeUpdateChildrenOptions<T>): void {
		if (!this.identityProvider) {
			return super.render(node, viewStateContext);
		}

		// Preserve traits across compressions. Hacky but does the trick.
		// This is hard to fix properly since it requires rewriting the traits
		// across trees and lists. Let's just keep it this way for now.
		const getId = (element: T) => this.identityProvider!.getId(element).toString();
		const getUncompressedIds = (nodes: IAsyncDataTreeNode<TInput, T>[]): Set<string> => {
			const result = new Set<string>();

			for (const node of nodes) {
				const compressedNode = this.tree.getCompressedTreeNode(node === this.root ? null : node);

				if (!compressedNode.element) {
					continue;
				}

				for (const node of compressedNode.element.elements) {
					result.add(getId(node.element as T));
				}
			}

			return result;
		};

		const oldSelection = getUncompressedIds(this.tree.getSelection() as IAsyncDataTreeNode<TInput, T>[]);
		const oldFocus = getUncompressedIds(this.tree.getFocus() as IAsyncDataTreeNode<TInput, T>[]);

		super.render(node, viewStateContext, options);

		const selection = this.getSelection();
		let didChangeSelection = false;

		const focus = this.getFocus();
		let didChangeFocus = false;

		const visit = (node: ITreeNode<ICompressedTreeNode<IAsyncDataTreeNode<TInput, T>> | null, TFilterData>) => {
			const compressedNode = node.element;

			if (compressedNode) {
				for (let i = 0; i < compressedNode.elements.length; i++) {
					const id = getId(compressedNode.elements[i].element as T);
					const element = compressedNode.elements[compressedNode.elements.length - 1].element as T;

					// github.com/microsoft/vscode/issues/85938
					if (oldSelection.has(id) && selection.indexOf(element) === -1) {
						selection.push(element);
						didChangeSelection = true;
					}

					if (oldFocus.has(id) && focus.indexOf(element) === -1) {
						focus.push(element);
						didChangeFocus = true;
					}
				}
			}

			node.children.forEach(visit);
		};

		visit(this.tree.getCompressedTreeNode(node === this.root ? null : node));

		if (didChangeSelection) {
			this.setSelection(selection);
		}

		if (didChangeFocus) {
			this.setFocus(focus);
		}
	}

	// For compressed async data trees, `TreeVisibility.Recurse` doesn't currently work
	// and we have to filter everything beforehand
	// Related to #85193 and #85835
	protected override processChildren(children: Iterable<T>): Iterable<T> {
		if (this.filter) {
			children = Iterable.filter(children, e => {
				const result = this.filter!.filter(e, TreeVisibility.Visible);
				const visibility = getVisibility(result);

				if (visibility === TreeVisibility.Recurse) {
					throw new Error('Recursive tree visibility not supported in async data compressed trees');
				}

				return visibility === TreeVisibility.Visible;
			});
		}

		return super.processChildren(children);
	}

	override navigate(start?: T): AsyncDataTreeNavigator<TInput, T> {
		// Assumptions are made about how tree navigation works in compressed trees
		// These assumptions may be wrong and we should revisit this when needed

		// Example:	[a, b/ba, ba.txt]
		// - previous(ba) => a
		// - previous(b) => a
		// - next(a) => ba
		// - next(b) => ba
		// - next(ba) => ba.txt
		return super.navigate(start);
	}
}

function getVisibility<TFilterData>(filterResult: TreeFilterResult<TFilterData>): TreeVisibility {
	if (typeof filterResult === 'boolean') {
		return filterResult ? TreeVisibility.Visible : TreeVisibility.Hidden;
	} else if (isFilterResult(filterResult)) {
		return getVisibleState(filterResult.visibility);
	} else {
		return getVisibleState(filterResult);
	}
}

class AsyncDataTreeNavigator<TInput, T> implements ITreeNavigator<T> {

	constructor(private navigator: ITreeNavigator<IAsyncDataTreeNode<TInput, T> | null>) { }

	current(): T | null {
		const current = this.navigator.current();
		if (current === null) {
			return null;
		}

		return current.element as T;
	}

	previous(): T | null {
		this.navigator.previous();
		return this.current();
	}

	first(): T | null {
		this.navigator.first();
		return this.current();
	}

	last(): T | null {
		this.navigator.last();
		return this.current();
	}

	next(): T | null {
		this.navigator.next();
		return this.current();
	}
}
