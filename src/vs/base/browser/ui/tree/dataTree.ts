/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractTree, IAbstractTreeOptions } from 'vs/base/browser/ui/tree/abstractTree';
import { ISpliceable } from 'vs/base/common/sequence';
import { ITreeNode, ITreeModel, ITreeElement, ITreeRenderer, ITreeSorter, IDataSource } from 'vs/base/browser/ui/tree/tree';
import { ObjectTreeModel } from 'vs/base/browser/ui/tree/objectTreeModel';
import { IListVirtualDelegate, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { Iterator } from 'vs/base/common/iterator';

export interface IDataTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> {
	sorter?: ITreeSorter<T>;
}

export interface IDataTreeViewState {
	readonly focus: string[];
	readonly selection: string[];
	readonly expanded: string[];
	readonly scrollTop: number;
}

export class DataTree<TInput, T, TFilterData = void> extends AbstractTree<T | null, TFilterData, T | null> {

	protected model!: ObjectTreeModel<T, TFilterData>;
	private input: TInput | undefined;

	private identityProvider: IIdentityProvider<T> | undefined;
	private nodesByIdentity = new Map<string, ITreeNode<T, TFilterData>>();

	constructor(
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		private dataSource: IDataSource<TInput, T>,
		options: IDataTreeOptions<T, TFilterData> = {}
	) {
		super(container, delegate, renderers, options);
		this.identityProvider = options.identityProvider;
	}

	// Model

	getInput(): TInput | undefined {
		return this.input;
	}

	setInput(input: TInput, viewState?: IDataTreeViewState): void {
		if (viewState && !this.identityProvider) {
			throw new Error('Can\'t restore tree view state without an identity provider');
		}

		this.input = input;

		if (!viewState) {
			this._refresh(input);
			return;
		}

		const focus: T[] = [];
		const selection: T[] = [];

		const isCollapsed = (element: T) => {
			const id = this.identityProvider!.getId(element).toString();
			return viewState.expanded.indexOf(id) === -1;
		};

		const onDidCreateNode = (node: ITreeNode<T, TFilterData>) => {
			const id = this.identityProvider!.getId(node.element).toString();

			if (viewState.focus.indexOf(id) > -1) {
				focus.push(node.element);
			}

			if (viewState.selection.indexOf(id) > -1) {
				selection.push(node.element);
			}
		};

		this._refresh(input, isCollapsed, onDidCreateNode);
		this.setFocus(focus);
		this.setSelection(selection);

		if (viewState && typeof viewState.scrollTop === 'number') {
			this.scrollTop = viewState.scrollTop;
		}
	}

	updateChildren(element: TInput | T = this.input!): void {
		if (typeof this.input === 'undefined') {
			throw new Error('Tree input not set');
		}

		let isCollapsed: ((el: T) => boolean | undefined) | undefined;

		if (this.identityProvider) {
			isCollapsed = element => {
				const id = this.identityProvider!.getId(element).toString();
				const node = this.nodesByIdentity.get(id);

				if (!node) {
					return undefined;
				}

				return node.collapsed;
			};
		}

		this._refresh(element, isCollapsed);
	}

	resort(element: T | TInput = this.input!, recursive = true): void {
		this.model.resort((element === this.input ? null : element) as T, recursive);
	}

	// View

	refresh(element?: T): void {
		if (element === undefined) {
			this.view.rerender();
			return;
		}

		this.model.rerender(element);
	}

	// Implementation

	private _refresh(element: TInput | T, isCollapsed?: (el: T) => boolean | undefined, onDidCreateNode?: (node: ITreeNode<T, TFilterData>) => void): void {
		let onDidDeleteNode: ((node: ITreeNode<T, TFilterData>) => void) | undefined;

		if (this.identityProvider) {
			const insertedElements = new Set<string>();

			const outerOnDidCreateNode = onDidCreateNode;
			onDidCreateNode = (node: ITreeNode<T, TFilterData>) => {
				const id = this.identityProvider!.getId(node.element).toString();

				insertedElements.add(id);
				this.nodesByIdentity.set(id, node);

				if (outerOnDidCreateNode) {
					outerOnDidCreateNode(node);
				}
			};

			onDidDeleteNode = (node: ITreeNode<T, TFilterData>) => {
				const id = this.identityProvider!.getId(node.element).toString();

				if (!insertedElements.has(id)) {
					this.nodesByIdentity.delete(id);
				}
			};
		}

		this.model.setChildren((element === this.input ? null : element) as T, this.iterate(element, isCollapsed).elements, onDidCreateNode, onDidDeleteNode);
	}

	private iterate(element: TInput | T, isCollapsed?: (el: T) => boolean | undefined): { elements: Iterator<ITreeElement<T>>, size: number } {
		const children = this.dataSource.getChildren(element);
		const elements = Iterator.map<any, ITreeElement<T>>(Iterator.fromArray(children), element => {
			const { elements: children, size } = this.iterate(element, isCollapsed);
			const collapsed = size === 0 ? undefined : (isCollapsed && isCollapsed(element));

			return { element, children, collapsed };
		});

		return { elements, size: children.length };
	}

	protected createModel(view: ISpliceable<ITreeNode<T, TFilterData>>, options: IDataTreeOptions<T, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new ObjectTreeModel(view, options);
	}

	// view state

	getViewState(): IDataTreeViewState {
		if (!this.identityProvider) {
			throw new Error('Can\'t get tree view state without an identity provider');
		}

		const getId = (element: T) => this.identityProvider!.getId(element).toString();
		const focus = this.getFocus().map(getId);
		const selection = this.getSelection().map(getId);

		const expanded: string[] = [];
		const root = this.model.getNode();
		const queue = [root];

		while (queue.length > 0) {
			const node = queue.shift()!;

			if (node !== root && node.collapsible && !node.collapsed) {
				expanded.push(getId(node.element!));
			}

			queue.push(...node.children);
		}

		return { focus, selection, expanded, scrollTop: this.scrollTop };
	}
}
