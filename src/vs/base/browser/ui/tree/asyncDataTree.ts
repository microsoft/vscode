/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ComposedTreeDelegate, IAbstractTreeOptions, IAbstractTreeOptionsUpdate } from 'vs/base/browser/ui/tree/abstractTree';
import { ObjectTree, IObjectTreeOptions } from 'vs/base/browser/ui/tree/objectTree';
import { IListVirtualDelegate, IIdentityProvider, IListDragAndDrop, IListDragOverReaction } from 'vs/base/browser/ui/list/list';
import { ITreeElement, ITreeNode, ITreeRenderer, ITreeEvent, ITreeMouseEvent, ITreeContextMenuEvent, ITreeSorter, ICollapseStateChangeEvent, IAsyncDataSource, ITreeDragAndDrop } from 'vs/base/browser/ui/tree/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { timeout, CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { Iterator } from 'vs/base/common/iterator';
import { IDragAndDropData } from 'vs/base/browser/dnd';
import { ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';
import { isPromiseCanceledError, onUnexpectedError } from 'vs/base/common/errors';
import { toggleClass } from 'vs/base/browser/dom';
import { values } from 'vs/base/common/map';
import { ScrollEvent } from 'vs/base/common/scrollable';

interface IAsyncDataTreeNode<TInput, T> {
	element: TInput | T;
	readonly parent: IAsyncDataTreeNode<TInput, T> | null;
	readonly children: IAsyncDataTreeNode<TInput, T>[];
	readonly id?: string | null;
	loading: boolean;
	hasChildren: boolean;
	stale: boolean;
	slow: boolean;
	collapsedByDefault: boolean | undefined;
}

interface IAsyncDataTreeNodeRequiredProps<TInput, T> extends Partial<IAsyncDataTreeNode<TInput, T>> {
	readonly element: TInput | T;
	readonly parent: IAsyncDataTreeNode<TInput, T> | null;
	readonly hasChildren: boolean;
}

function createAsyncDataTreeNode<TInput, T>(props: IAsyncDataTreeNodeRequiredProps<TInput, T>): IAsyncDataTreeNode<TInput, T> {
	return {
		...props,
		children: [],
		loading: false,
		stale: true,
		slow: false,
		collapsedByDefault: undefined
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

class AsyncDataTreeNodeWrapper<TInput, T, TFilterData> implements ITreeNode<TInput | T, TFilterData> {

	get element(): T { return this.node.element!.element as T; }
	get parent(): ITreeNode<T, TFilterData> | undefined { return this.node.parent && new AsyncDataTreeNodeWrapper(this.node.parent); }
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

class DataTreeRenderer<TInput, T, TFilterData, TTemplateData> implements ITreeRenderer<IAsyncDataTreeNode<TInput, T>, TFilterData, IDataTreeListTemplateData<TTemplateData>> {

	readonly templateId: string;
	private renderedNodes = new Map<IAsyncDataTreeNode<TInput, T>, IDataTreeListTemplateData<TTemplateData>>();
	private disposables: IDisposable[] = [];

	constructor(
		private renderer: ITreeRenderer<T, TFilterData, TTemplateData>,
		readonly onDidChangeTwistieState: Event<IAsyncDataTreeNode<TInput, T>>
	) {
		this.templateId = renderer.templateId;
	}

	renderTemplate(container: HTMLElement): IDataTreeListTemplateData<TTemplateData> {
		const templateData = this.renderer.renderTemplate(container);
		return { templateData };
	}

	renderElement(node: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>, height: number | undefined): void {
		this.renderer.renderElement(new AsyncDataTreeNodeWrapper(node), index, templateData.templateData, height);
	}

	renderTwistie(element: IAsyncDataTreeNode<TInput, T>, twistieElement: HTMLElement): boolean {
		toggleClass(twistieElement, 'loading', element.slow);
		return false;
	}

	disposeElement(node: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>, height: number | undefined): void {
		if (this.renderer.disposeElement) {
			this.renderer.disposeElement(new AsyncDataTreeNodeWrapper(node), index, templateData.templateData, height);
		}
	}

	disposeTemplate(templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.disposeTemplate(templateData.templateData);
	}

	dispose(): void {
		this.renderedNodes.clear();
		this.disposables = dispose(this.disposables);
	}
}

function asTreeEvent<TInput, T>(e: ITreeEvent<IAsyncDataTreeNode<TInput, T>>): ITreeEvent<T> {
	return {
		browserEvent: e.browserEvent,
		elements: e.elements.map(e => e.element as T)
	};
}

function asTreeMouseEvent<TInput, T>(e: ITreeMouseEvent<IAsyncDataTreeNode<TInput, T>>): ITreeMouseEvent<T> {
	return {
		browserEvent: e.browserEvent,
		element: e.element && e.element.element as T,
		target: e.target
	};
}

function asTreeContextMenuEvent<TInput, T>(e: ITreeContextMenuEvent<IAsyncDataTreeNode<TInput, T>>): ITreeContextMenuEvent<T> {
	return {
		browserEvent: e.browserEvent,
		element: e.element && e.element.element as T,
		anchor: e.anchor
	};
}

export enum ChildrenResolutionReason {
	Refresh,
	Expand
}

export interface IChildrenResolutionEvent<T> {
	readonly element: T | null;
	readonly reason: ChildrenResolutionReason;
}

function asAsyncDataTreeDragAndDropData<TInput, T>(data: IDragAndDropData): IDragAndDropData {
	if (data instanceof ElementsDragAndDropData) {
		const nodes = (data as ElementsDragAndDropData<IAsyncDataTreeNode<TInput, T>>).elements;
		return new ElementsDragAndDropData(nodes.map(node => node.element));
	}

	return data;
}

class AsyncDataTreeNodeListDragAndDrop<TInput, T> implements IListDragAndDrop<IAsyncDataTreeNode<TInput, T>> {

	constructor(private dnd: ITreeDragAndDrop<T>) { }

	getDragURI(node: IAsyncDataTreeNode<TInput, T>): string | null {
		return this.dnd.getDragURI(node.element as T);
	}

	getDragLabel(nodes: IAsyncDataTreeNode<TInput, T>[]): string | undefined {
		if (this.dnd.getDragLabel) {
			return this.dnd.getDragLabel(nodes.map(node => node.element as T));
		}

		return undefined;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		if (this.dnd.onDragStart) {
			this.dnd.onDragStart(asAsyncDataTreeDragAndDropData(data), originalEvent);
		}
	}

	onDragOver(data: IDragAndDropData, targetNode: IAsyncDataTreeNode<TInput, T> | undefined, targetIndex: number | undefined, originalEvent: DragEvent, raw = true): boolean | IListDragOverReaction {
		return this.dnd.onDragOver(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element as T, targetIndex, originalEvent);
	}

	drop(data: IDragAndDropData, targetNode: IAsyncDataTreeNode<TInput, T> | undefined, targetIndex: number | undefined, originalEvent: DragEvent): void {
		this.dnd.drop(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element as T, targetIndex, originalEvent);
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
			getAriaLabel(e) {
				return options.accessibilityProvider!.getAriaLabel(e.element as T);
			}
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
		ariaProvider: undefined,
		additionalScrollHeight: options.additionalScrollHeight
	};
}

function asTreeElement<TInput, T>(node: IAsyncDataTreeNode<TInput, T>, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): ITreeElement<IAsyncDataTreeNode<TInput, T>> {
	let collapsed: boolean | undefined;

	if (viewStateContext && viewStateContext.viewState.expanded && node.id && viewStateContext.viewState.expanded.indexOf(node.id) > -1) {
		collapsed = false;
	} else {
		collapsed = node.collapsedByDefault;
	}

	node.collapsedByDefault = undefined;

	return {
		element: node,
		children: node.hasChildren ? Iterator.map(Iterator.fromArray(node.children), child => asTreeElement(child, viewStateContext)) : [],
		collapsible: node.hasChildren,
		collapsed
	};
}

export interface IAsyncDataTreeOptionsUpdate extends IAbstractTreeOptionsUpdate { }

export interface IAsyncDataTreeOptions<T, TFilterData = void> extends IAsyncDataTreeOptionsUpdate, Pick<IAbstractTreeOptions<T, TFilterData>, Exclude<keyof IAbstractTreeOptions<T, TFilterData>, 'collapseByDefault'>> {
	readonly collapseByDefault?: { (e: T): boolean; };
	readonly identityProvider?: IIdentityProvider<T>;
	readonly sorter?: ITreeSorter<T>;
	readonly autoExpandSingleChildren?: boolean;
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

	private readonly tree: ObjectTree<IAsyncDataTreeNode<TInput, T>, TFilterData>;
	private readonly root: IAsyncDataTreeNode<TInput, T>;
	private readonly nodes = new Map<null | T, IAsyncDataTreeNode<TInput, T>>();
	private readonly sorter?: ITreeSorter<T>;
	private readonly collapseByDefault?: { (e: T): boolean; };

	private readonly subTreeRefreshPromises = new Map<IAsyncDataTreeNode<TInput, T>, Promise<void>>();
	private readonly refreshPromises = new Map<IAsyncDataTreeNode<TInput, T>, CancelablePromise<T[]>>();

	private readonly identityProvider?: IIdentityProvider<T>;
	private readonly autoExpandSingleChildren: boolean;

	private readonly _onDidRender = new Emitter<void>();
	private readonly _onDidChangeNodeSlowState = new Emitter<IAsyncDataTreeNode<TInput, T>>();

	protected readonly disposables: IDisposable[] = [];

	get onDidScroll(): Event<ScrollEvent> { return this.tree.onDidScroll; }

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return Event.map(this.tree.onDidChangeFocus, asTreeEvent); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return Event.map(this.tree.onDidChangeSelection, asTreeEvent); }
	get onDidOpen(): Event<ITreeEvent<T>> { return Event.map(this.tree.onDidOpen, asTreeEvent); }

	get onKeyDown(): Event<KeyboardEvent> { return this.tree.onKeyDown; }
	get onMouseClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.tree.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.tree.onMouseDblClick, asTreeMouseEvent); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return Event.map(this.tree.onContextMenu, asTreeContextMenuEvent); }
	get onDidFocus(): Event<void> { return this.tree.onDidFocus; }
	get onDidBlur(): Event<void> { return this.tree.onDidBlur; }

	get onDidChangeCollapseState(): Event<ICollapseStateChangeEvent<IAsyncDataTreeNode<TInput, T> | null, TFilterData>> { return this.tree.onDidChangeCollapseState; }

	get onDidUpdateOptions(): Event<IAsyncDataTreeOptionsUpdate> { return this.tree.onDidUpdateOptions; }

	get filterOnType(): boolean { return this.tree.filterOnType; }
	get openOnSingleClick(): boolean { return this.tree.openOnSingleClick; }
	get expandOnlyOnTwistieClick(): boolean | ((e: T) => boolean) {
		if (typeof this.tree.expandOnlyOnTwistieClick === 'boolean') {
			return this.tree.expandOnlyOnTwistieClick;
		}

		const fn = this.tree.expandOnlyOnTwistieClick;
		return element => fn(this.nodes.get((element === this.root.element ? null : element) as T) || null);
	}

	get onDidDispose(): Event<void> { return this.tree.onDidDispose; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		private dataSource: IAsyncDataSource<TInput, T>,
		options: IAsyncDataTreeOptions<T, TFilterData> = {}
	) {
		this.identityProvider = options.identityProvider;
		this.autoExpandSingleChildren = typeof options.autoExpandSingleChildren === 'undefined' ? false : options.autoExpandSingleChildren;
		this.sorter = options.sorter;
		this.collapseByDefault = options.collapseByDefault;

		const objectTreeDelegate = new ComposedTreeDelegate<TInput | T, IAsyncDataTreeNode<TInput, T>>(delegate);
		const objectTreeRenderers = renderers.map(r => new DataTreeRenderer(r, this._onDidChangeNodeSlowState.event));
		const objectTreeOptions = asObjectTreeOptions<TInput, T, TFilterData>(options) || {};

		this.tree = new ObjectTree(container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);

		this.root = createAsyncDataTreeNode({
			element: undefined!,
			parent: null,
			hasChildren: true
		});

		if (this.identityProvider) {
			this.root = {
				...this.root,
				id: null
			};
		}

		this.nodes.set(null, this.root);

		this.tree.onDidChangeCollapseState(this._onDidChangeCollapseState, this, this.disposables);
	}

	updateOptions(options: IAsyncDataTreeOptionsUpdate = {}): void {
		this.tree.updateOptions(options);
	}

	// Widget

	getHTMLElement(): HTMLElement {
		return this.tree.getHTMLElement();
	}

	get contentHeight(): number {
		return this.tree.contentHeight;
	}

	get onDidChangeContentHeight(): Event<number> {
		return this.tree.onDidChangeContentHeight;
	}

	get scrollTop(): number {
		return this.tree.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this.tree.scrollTop = scrollTop;
	}

	get scrollHeight(): number {
		return this.tree.scrollHeight;
	}

	get renderHeight(): number {
		return this.tree.renderHeight;
	}

	get firstVisibleElement(): T {
		return this.tree.firstVisibleElement!.element as T;
	}

	get lastVisibleElement(): T {
		return this.tree.lastVisibleElement!.element as T;
	}

	domFocus(): void {
		this.tree.domFocus();
	}

	layout(height?: number, width?: number): void {
		this.tree.layout(height, width);
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

		const viewStateContext = viewState && { viewState, focus: [], selection: [] } as IAsyncDataTreeViewStateContext<TInput, T>;

		await this.updateChildren(input, true, viewStateContext);

		if (viewStateContext) {
			this.tree.setFocus(viewStateContext.focus);
			this.tree.setSelection(viewStateContext.selection);
		}

		if (viewState && typeof viewState.scrollTop === 'number') {
			this.scrollTop = viewState.scrollTop;
		}
	}

	async updateChildren(element: TInput | T = this.root.element, recursive = true, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): Promise<void> {
		if (typeof this.root.element === 'undefined') {
			throw new Error('Tree input not set');
		}

		if (this.root.loading) {
			await this.subTreeRefreshPromises.get(this.root)!;
			await Event.toPromise(this._onDidRender.event);
		}

		await this.refreshAndRenderNode(this.getDataNode(element), recursive, ChildrenResolutionReason.Refresh, viewStateContext);
	}

	resort(element: TInput | T = this.root.element, recursive = true): void {
		this.tree.resort(this.getDataNode(element), recursive);
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

	updateWidth(element: T): void {
		const node = this.getDataNode(element);
		this.tree.updateWidth(node);
	}

	// Tree

	getNode(element: TInput | T = this.root.element): ITreeNode<TInput | T, TFilterData> {
		const dataNode = this.getDataNode(element);
		const node = this.tree.getNode(dataNode === this.root ? null : dataNode);
		return new AsyncDataTreeNodeWrapper<TInput, T, TFilterData>(node);
	}

	collapse(element: T, recursive: boolean = false): boolean {
		const node = this.getDataNode(element);
		return this.tree.collapse(node === this.root ? null : node, recursive);
	}

	async expand(element: T, recursive: boolean = false): Promise<boolean> {
		if (typeof this.root.element === 'undefined') {
			throw new Error('Tree input not set');
		}

		if (this.root.loading) {
			await this.subTreeRefreshPromises.get(this.root)!;
			await Event.toPromise(this._onDidRender.event);
		}

		const node = this.getDataNode(element);

		if (node !== this.root && !node.loading && !this.tree.isCollapsed(node)) {
			return false;
		}

		const result = this.tree.expand(node === this.root ? null : node, recursive);

		if (node.loading) {
			await this.subTreeRefreshPromises.get(node)!;
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

	collapseAll(): void {
		this.tree.collapseAll();
	}

	isCollapsible(element: T): boolean {
		return this.tree.isCollapsible(this.getDataNode(element));
	}

	isCollapsed(element: T): boolean {
		return this.tree.isCollapsed(this.getDataNode(element));
	}

	toggleKeyboardNavigation(): void {
		this.tree.toggleKeyboardNavigation();
	}

	refilter(): void {
		this.tree.refilter();
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

	focusNextPage(browserEvent?: UIEvent): void {
		this.tree.focusNextPage(browserEvent);
	}

	focusPreviousPage(browserEvent?: UIEvent): void {
		this.tree.focusPreviousPage(browserEvent);
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

	open(elements: T[], browserEvent?: UIEvent): void {
		const nodes = elements.map(e => this.getDataNode(e));
		this.tree.open(nodes, browserEvent);
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

	private getDataNode(element: TInput | T): IAsyncDataTreeNode<TInput, T> {
		const node: IAsyncDataTreeNode<TInput, T> | undefined = this.nodes.get((element === this.root.element ? null : element) as T);

		if (!node) {
			throw new Error(`Data tree node not found: ${element}`);
		}

		return node;
	}

	private async refreshAndRenderNode(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, reason: ChildrenResolutionReason, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): Promise<void> {
		await this.refreshNode(node, recursive, viewStateContext);
		this.render(node, viewStateContext);

		if (node !== this.root && this.autoExpandSingleChildren && reason === ChildrenResolutionReason.Expand) {
			const treeNode = this.tree.getNode(node);
			const visibleChildren = treeNode.children.filter(node => node.visible);

			if (visibleChildren.length === 1) {
				await this.tree.expand(visibleChildren[0].element, false);
			}
		}
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

		result = this.doRefreshSubTree(node, recursive, viewStateContext);
		this.subTreeRefreshPromises.set(node, result);

		try {
			await result;
		} finally {
			this.subTreeRefreshPromises.delete(node);
		}
	}

	private async doRefreshSubTree(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): Promise<void> {
		node.loading = true;

		try {
			const childrenToRefresh = await this.doRefreshNode(node, recursive, viewStateContext);
			node.stale = false;

			await Promise.all(childrenToRefresh.map(child => this.doRefreshSubTree(child, recursive, viewStateContext)));
		} finally {
			node.loading = false;
		}
	}

	private async doRefreshNode(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): Promise<IAsyncDataTreeNode<TInput, T>[]> {
		node.hasChildren = !!this.dataSource.hasChildren(node.element!);

		let childrenPromise: Promise<T[]>;

		if (!node.hasChildren) {
			childrenPromise = Promise.resolve([]);
		} else {
			const slowTimeout = timeout(800);

			slowTimeout.then(() => {
				node.slow = true;
				this._onDidChangeNodeSlowState.fire(node);
			}, _ => null);

			childrenPromise = this.doGetChildren(node)
				.finally(() => slowTimeout.cancel());
		}

		try {
			const children = await childrenPromise;
			return this.setChildren(node, children, recursive, viewStateContext);
		} catch (err) {
			if (node !== this.root) {
				this.tree.collapse(node === this.root ? null : node);
			}

			if (isPromiseCanceledError(err)) {
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

	private doGetChildren(node: IAsyncDataTreeNode<TInput, T>): Promise<T[]> {
		let result = this.refreshPromises.get(node);

		if (result) {
			return result;
		}

		result = createCancelablePromise(async () => {
			const children = await this.dataSource.getChildren(node.element!);

			if (this.sorter) {
				children.sort(this.sorter.compare.bind(this.sorter));
			}

			return children;
		});

		this.refreshPromises.set(node, result);

		return result.finally(() => this.refreshPromises.delete(node));
	}

	private _onDidChangeCollapseState({ node, deep }: ICollapseStateChangeEvent<IAsyncDataTreeNode<TInput, T>, any>): void {
		if (!node.collapsed && node.element.stale) {
			if (deep) {
				this.collapse(node.element.element as T);
			} else {
				this.refreshAndRenderNode(node.element, false, ChildrenResolutionReason.Expand)
					.catch(onUnexpectedError);
			}
		}
	}

	private setChildren(node: IAsyncDataTreeNode<TInput, T>, childrenElements: T[], recursive: boolean, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): IAsyncDataTreeNode<TInput, T>[] {
		// perf: if the node was and still is a leaf, avoid all this hassle
		if (node.children.length === 0 && childrenElements.length === 0) {
			return [];
		}

		const nodesToForget = new Map<T, IAsyncDataTreeNode<TInput, T>>();
		const childrenTreeNodesById = new Map<string, ITreeNode<IAsyncDataTreeNode<TInput, T> | null, TFilterData>>();

		for (const child of node.children) {
			nodesToForget.set(child.element as T, child);

			if (this.identityProvider) {
				childrenTreeNodesById.set(child.id!, this.tree.getNode(child));
			}
		}

		const childrenToRefresh: IAsyncDataTreeNode<TInput, T>[] = [];

		const children = childrenElements.map<IAsyncDataTreeNode<TInput, T>>(element => {
			const hasChildren = !!this.dataSource.hasChildren(element);

			if (!this.identityProvider) {
				const asyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, hasChildren });

				if (hasChildren && this.collapseByDefault && !this.collapseByDefault(element)) {
					asyncDataTreeNode.collapsedByDefault = false;
					childrenToRefresh.push(asyncDataTreeNode);
				}

				return asyncDataTreeNode;
			}

			const id = this.identityProvider.getId(element).toString();
			const childNode = childrenTreeNodesById.get(id);

			if (childNode) {
				const asyncDataTreeNode = childNode.element!;

				nodesToForget.delete(asyncDataTreeNode.element as T);
				this.nodes.delete(asyncDataTreeNode.element as T);
				this.nodes.set(element, asyncDataTreeNode);

				asyncDataTreeNode.element = element;
				asyncDataTreeNode.hasChildren = hasChildren;

				if (recursive) {
					if (childNode.collapsed) {
						dfs(asyncDataTreeNode, node => node.stale = true);
					} else {
						childrenToRefresh.push(asyncDataTreeNode);
					}
				} else if (hasChildren && this.collapseByDefault && !this.collapseByDefault(element)) {
					asyncDataTreeNode.collapsedByDefault = false;
					childrenToRefresh.push(asyncDataTreeNode);
				}

				return asyncDataTreeNode;
			}

			const childAsyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, id, hasChildren });

			if (viewStateContext && viewStateContext.viewState.focus && viewStateContext.viewState.focus.indexOf(id) > -1) {
				viewStateContext.focus.push(childAsyncDataTreeNode);
			}

			if (viewStateContext && viewStateContext.viewState.selection && viewStateContext.viewState.selection.indexOf(id) > -1) {
				viewStateContext.selection.push(childAsyncDataTreeNode);
			}

			if (viewStateContext && viewStateContext.viewState.expanded && viewStateContext.viewState.expanded.indexOf(id) > -1) {
				childrenToRefresh.push(childAsyncDataTreeNode);
			} else if (hasChildren && this.collapseByDefault && !this.collapseByDefault(element)) {
				childAsyncDataTreeNode.collapsedByDefault = false;
				childrenToRefresh.push(childAsyncDataTreeNode);
			}

			return childAsyncDataTreeNode;
		});

		for (const node of values(nodesToForget)) {
			dfs(node, node => this.nodes.delete(node.element as T));
		}

		for (const child of children) {
			this.nodes.set(child.element as T, child);
		}

		node.children.splice(0, node.children.length, ...children);

		return childrenToRefresh;
	}

	private render(node: IAsyncDataTreeNode<TInput, T>, viewStateContext?: IAsyncDataTreeViewStateContext<TInput, T>): void {
		const children = node.children.map(c => asTreeElement(c, viewStateContext));
		this.tree.setChildren(node === this.root ? null : node, children);
		this._onDidRender.fire();
	}

	// view state

	getViewState(): IAsyncDataTreeViewState {
		if (!this.identityProvider) {
			throw new Error('Can\'t get tree view state without an identity provider');
		}

		const getId = (element: T) => this.identityProvider!.getId(element).toString();
		const focus = this.getFocus().map(getId);
		const selection = this.getSelection().map(getId);

		const expanded: string[] = [];
		const root = this.tree.getNode();
		const queue = [root];

		while (queue.length > 0) {
			const node = queue.shift()!;

			if (node !== root && node.collapsible && !node.collapsed) {
				expanded.push(getId(node.element!.element as T));
			}

			queue.push(...node.children);
		}

		return { focus, selection, expanded, scrollTop: this.scrollTop };
	}

	dispose(): void {
		dispose(this.disposables);
	}
}
