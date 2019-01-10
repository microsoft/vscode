/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ComposedTreeDelegate, IAbstractTreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ObjectTree, IObjectTreeOptions } from 'vs/base/browser/ui/tree/objectTree';
import { IListVirtualDelegate, IIdentityProvider, IListDragAndDrop, IListDragOverReaction } from 'vs/base/browser/ui/list/list';
import { ITreeElement, ITreeNode, ITreeRenderer, ITreeEvent, ITreeMouseEvent, ITreeContextMenuEvent, ITreeSorter, ICollapseStateChangeEvent, IAsyncDataSource, ITreeDragAndDrop } from 'vs/base/browser/ui/tree/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { timeout, always } from 'vs/base/common/async';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { toggleClass } from 'vs/base/browser/dom';
import { Iterator } from 'vs/base/common/iterator';
import { IDragAndDropData } from 'vs/base/browser/dnd';
import { ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';

enum AsyncDataTreeNodeState {
	Uninitialized,
	Loaded,
	Loading,
	Slow
}

interface IAsyncDataTreeNode<TInput, T> {
	element: TInput | T;
	readonly parent: IAsyncDataTreeNode<TInput, T> | null;
	readonly id?: string | null;
	readonly children?: IAsyncDataTreeNode<TInput, T>[];
	state: AsyncDataTreeNodeState;
}

interface IDataTreeListTemplateData<T> {
	templateData: T;
}

class AsyncDataTreeNodeWrapper<TInput, T, TFilterData> implements ITreeNode<TInput | T, TFilterData> {

	get element(): T { return this.node.element!.element as T; }
	get parent(): ITreeNode<T, TFilterData> | undefined { return this.node.parent && new AsyncDataTreeNodeWrapper(this.node.parent); }
	get children(): ITreeNode<T, TFilterData>[] { return this.node.children.map(node => new AsyncDataTreeNodeWrapper(node)); }
	get depth(): number { return this.node.depth; }
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

	renderElement(node: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		this.renderer.renderElement(new AsyncDataTreeNodeWrapper(node), index, templateData.templateData);
	}

	renderTwistie(element: IAsyncDataTreeNode<TInput, T>, twistieElement: HTMLElement): boolean {
		toggleClass(twistieElement, 'loading', element.state === AsyncDataTreeNodeState.Slow);
		return false;
	}

	disposeElement(node: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>, index: number, templateData: IDataTreeListTemplateData<TTemplateData>): void {
		if (this.renderer.disposeElement) {
			this.renderer.disposeElement(new AsyncDataTreeNodeWrapper(node), index, templateData.templateData);
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
		element: e.element && e.element.element as T
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
			getKeyboardNavigationLabel(e) {
				return options.keyboardNavigationLabelProvider!.getKeyboardNavigationLabel(e.element as T);
			}
		},
		sorter: options.sorter && {
			compare(a, b) {
				return options.sorter!.compare(a.element as T, b.element as T);
			}
		}
	};
}

function asTreeElement<TInput, T>(node: IAsyncDataTreeNode<TInput, T>): ITreeElement<IAsyncDataTreeNode<TInput, T>> {
	return {
		element: node,
		children: Iterator.map(Iterator.fromArray(node.children!), asTreeElement)
	};
}

export interface IAsyncDataTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> {
	identityProvider?: IIdentityProvider<T>;
	sorter?: ITreeSorter<T>;
}

export class AsyncDataTree<TInput, T, TFilterData = void> implements IDisposable {

	private readonly tree: ObjectTree<IAsyncDataTreeNode<TInput, T>, TFilterData>;
	private readonly root: IAsyncDataTreeNode<TInput, T>;
	private readonly nodes = new Map<null | T, IAsyncDataTreeNode<TInput, T>>();
	private readonly refreshPromises = new Map<IAsyncDataTreeNode<TInput, T>, Promise<void>>();
	private readonly identityProvider?: IIdentityProvider<T>;

	private readonly _onDidChangeNodeState = new Emitter<IAsyncDataTreeNode<TInput, T>>();

	protected readonly disposables: IDisposable[] = [];

	get onDidChangeFocus(): Event<ITreeEvent<T>> { return Event.map(this.tree.onDidChangeFocus, asTreeEvent); }
	get onDidChangeSelection(): Event<ITreeEvent<T>> { return Event.map(this.tree.onDidChangeSelection, asTreeEvent); }
	get onDidOpen(): Event<ITreeEvent<T>> { return Event.map(this.tree.onDidOpen, asTreeEvent); }

	private readonly _onDidResolveChildren = new Emitter<IChildrenResolutionEvent<T>>();
	readonly onDidResolveChildren: Event<IChildrenResolutionEvent<T>> = this._onDidResolveChildren.event;

	get onMouseClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.tree.onMouseClick, asTreeMouseEvent); }
	get onMouseDblClick(): Event<ITreeMouseEvent<T>> { return Event.map(this.tree.onMouseDblClick, asTreeMouseEvent); }
	get onContextMenu(): Event<ITreeContextMenuEvent<T>> { return Event.map(this.tree.onContextMenu, asTreeContextMenuEvent); }
	get onDidFocus(): Event<void> { return this.tree.onDidFocus; }
	get onDidBlur(): Event<void> { return this.tree.onDidBlur; }

	get onDidDispose(): Event<void> { return this.tree.onDidDispose; }

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<any /* TODO@joao */, TFilterData, any>[],
		private dataSource: IAsyncDataSource<TInput, T>,
		options?: IAsyncDataTreeOptions<T, TFilterData>
	) {
		this.identityProvider = options && options.identityProvider;

		const objectTreeDelegate = new ComposedTreeDelegate<TInput | T, IAsyncDataTreeNode<TInput, T>>(delegate);
		const objectTreeRenderers = renderers.map(r => new DataTreeRenderer(r, this._onDidChangeNodeState.event));
		const objectTreeOptions = asObjectTreeOptions<TInput, T, TFilterData>(options) || {};
		objectTreeOptions.collapseByDefault = true;

		this.tree = new ObjectTree(container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);

		this.root = {
			element: undefined!,
			parent: null,
			state: AsyncDataTreeNodeState.Uninitialized,
		};

		if (this.identityProvider) {
			this.root = {
				...this.root,
				id: null,
				children: [],
			};
		}

		this.nodes.set(null, this.root);

		this.tree.onDidChangeCollapseState(this._onDidChangeCollapseState, this, this.disposables);
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

	domFocus(): void {
		this.tree.domFocus();
	}

	layout(height?: number): void {
		this.tree.layout(height);
	}

	style(styles: IListStyles): void {
		this.tree.style(styles);
	}

	// Data Tree

	getInput(): TInput | undefined {
		return this.root.element as TInput;
	}

	setInput(input: TInput): Promise<void> {
		this.root.element = input!;
		return this.refresh(input);
	}

	refresh(element: TInput | T = this.root.element, recursive = true): Promise<void> {
		if (typeof this.root.element === 'undefined') {
			throw new Error('Tree input not set');
		}

		return this.refreshNode(this.getDataNode(element), recursive, ChildrenResolutionReason.Refresh);
	}

	// Tree

	getNode(element: TInput | T): ITreeNode<TInput | T, TFilterData> {
		const dataNode = this.getDataNode(element);
		const node = this.tree.getNode(dataNode === this.root ? null : dataNode);
		return new AsyncDataTreeNodeWrapper<TInput, T, TFilterData>(node);
	}

	collapse(element: T, recursive: boolean = false): boolean {
		return this.tree.collapse(this.getDataNode(element), recursive);
	}

	async expand(element: T, recursive: boolean = false): Promise<boolean> {
		const node = this.getDataNode(element);

		if (!this.tree.isCollapsed(node)) {
			return false;
		}

		this.tree.expand(node, recursive);

		if (node.state !== AsyncDataTreeNodeState.Loaded) {
			await this.refreshNode(node, false, ChildrenResolutionReason.Expand);
		}

		return true;
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

	open(elements: T[]): void {
		const nodes = elements.map(e => this.getDataNode(e));
		this.tree.open(nodes);
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

	getLastElementAncestor(element: TInput | T = this.root.element): TInput | T | undefined {
		const dataNode = this.getDataNode(element);
		const node = this.tree.getLastElementAncestor(dataNode === this.root ? null : dataNode);
		return (node && node.element)!;
	}

	// List

	get visibleNodeCount(): number {
		return this.tree.visibleNodeCount;
	}

	// Implementation

	private getDataNode(element: TInput | T): IAsyncDataTreeNode<TInput, T> {
		const node: IAsyncDataTreeNode<TInput, T> | undefined = this.nodes.get((element === this.root.element ? null : element) as T);

		if (!node) {
			throw new Error(`Data tree node not found: ${element}`);
		}

		return node;
	}

	private async refreshNode(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, reason: ChildrenResolutionReason): Promise<void> {
		await this._refreshNode(node, recursive, reason);

		if (recursive && node.children) {
			await Promise.all(node.children.map(child => this.refreshNode(child, recursive, reason)));
		}
	}

	private _refreshNode(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, reason: ChildrenResolutionReason): Promise<void> {
		let result = this.refreshPromises.get(node);

		if (result) {
			return result;
		}

		result = this.doRefresh(node, recursive, reason);
		this.refreshPromises.set(node, result);
		return always(result, () => this.refreshPromises.delete(node));
	}

	private doRefresh(node: IAsyncDataTreeNode<TInput, T>, recursive: boolean, reason: ChildrenResolutionReason): Promise<void> {
		const hasChildren = !!this.dataSource.hasChildren(node.element!);

		if (!hasChildren) {
			this.setChildren(node, [], recursive);
			return Promise.resolve();
		} else if (node !== this.root && (!this.tree.isCollapsible(node) || this.tree.isCollapsed(node))) {
			return Promise.resolve();
		} else {
			node.state = AsyncDataTreeNodeState.Loading;
			this._onDidChangeNodeState.fire(node);

			const slowTimeout = timeout(800);

			slowTimeout.then(() => {
				node.state = AsyncDataTreeNodeState.Slow;
				this._onDidChangeNodeState.fire(node);
			}, _ => null);

			return Promise.resolve(this.dataSource.getChildren(node.element!))
				.then(children => {
					slowTimeout.cancel();
					node.state = AsyncDataTreeNodeState.Loaded;
					this._onDidChangeNodeState.fire(node);

					this.setChildren(node, children, recursive);
					this._onDidResolveChildren.fire({ element: node.element as T, reason });
				}, err => {
					slowTimeout.cancel();
					node.state = AsyncDataTreeNodeState.Uninitialized;
					this._onDidChangeNodeState.fire(node);

					if (node !== this.root) {
						this.tree.collapse(node);
					}

					return Promise.reject(err);
				});
		}
	}

	private _onDidChangeCollapseState({ node, deep }: ICollapseStateChangeEvent<IAsyncDataTreeNode<TInput, T>, any>): void {
		if (!node.collapsed && node.element.state === AsyncDataTreeNodeState.Uninitialized) {
			if (deep) {
				this.collapse(node.element.element as T);
			} else {
				this.refreshNode(node.element, false, ChildrenResolutionReason.Expand);
			}
		}
	}

	private setChildren(node: IAsyncDataTreeNode<TInput, T>, childrenElements: T[], recursive: boolean): void {
		let nodeChildren: Map<string, IAsyncDataTreeNode<TInput, T>> | undefined;

		if (this.identityProvider) {
			nodeChildren = new Map();

			for (const child of node.children!) {
				nodeChildren.set(child.id!, child);
			}
		}

		const children = childrenElements.map<ITreeElement<IAsyncDataTreeNode<TInput, T>>>(element => {
			if (!this.identityProvider) {
				return {
					element: {
						element,
						parent: node,
						state: AsyncDataTreeNodeState.Uninitialized
					},
					collapsible: !!this.dataSource.hasChildren(element),
					collapsed: true
				};
			}

			const id = this.identityProvider.getId(element).toString();
			const asyncDataTreeNode = nodeChildren!.get(id);

			if (!asyncDataTreeNode) {
				return {
					element: {
						element,
						parent: node,
						id,
						children: [],
						state: AsyncDataTreeNodeState.Uninitialized
					},
					collapsible: !!this.dataSource.hasChildren(element),
					collapsed: true
				};
			}

			asyncDataTreeNode.element = element;

			const collapsible = !!this.dataSource.hasChildren(element);
			const collapsed = !collapsible || this.tree.isCollapsed(asyncDataTreeNode);

			if (recursive) {
				asyncDataTreeNode.state = AsyncDataTreeNodeState.Uninitialized;

				if (this.tree.isCollapsed(asyncDataTreeNode)) {
					asyncDataTreeNode.children!.length = 0;

					return {
						element: asyncDataTreeNode,
						collapsible,
						collapsed
					};
				}
			}

			let children: Iterator<ITreeElement<IAsyncDataTreeNode<TInput, T>>> | undefined = undefined;

			if (collapsible) {
				children = Iterator.map(Iterator.fromArray(asyncDataTreeNode.children!), asTreeElement);
			}

			return {
				element: asyncDataTreeNode,
				children,
				collapsible,
				collapsed
			};
		});

		const insertedElements = new Set<T>();

		const onDidCreateNode = (treeNode: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>) => {
			if (treeNode.element.element) {
				insertedElements.add(treeNode.element.element as T);
				this.nodes.set(treeNode.element.element as T, treeNode.element);
			}
		};

		const onDidDeleteNode = (treeNode: ITreeNode<IAsyncDataTreeNode<TInput, T>, TFilterData>) => {
			if (treeNode.element.element) {
				if (!insertedElements.has(treeNode.element.element as T)) {
					this.nodes.delete(treeNode.element.element as T);
				}
			}
		};

		this.tree.setChildren(node === this.root ? null : node, children, onDidCreateNode, onDidDeleteNode);

		if (this.identityProvider) {
			node.children!.splice(0, node.children!.length, ...children.map(c => c.element));
		}
	}

	dispose(): void {
		dispose(this.disposables);
	}
}
