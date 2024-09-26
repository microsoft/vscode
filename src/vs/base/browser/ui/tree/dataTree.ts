/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIdentityProvider, IListVirtualDelegate } from '../list/list.js';
import { AbstractTree, AbstractTreeViewState, IAbstractTreeOptions } from './abstractTree.js';
import { ObjectTreeModel } from './objectTreeModel.js';
import { IDataSource, ITreeElement, ITreeModel, ITreeNode, ITreeRenderer, ITreeSorter, TreeError } from './tree.js';
import { Iterable } from '../../../common/iterator.js';

export interface IDataTreeOptions<T, TFilterData = void> extends IAbstractTreeOptions<T, TFilterData> {
	readonly sorter?: ITreeSorter<T>;
}

export class DataTree<TInput, T, TFilterData = void> extends AbstractTree<T | null, TFilterData, T | null> {

	protected declare model: ObjectTreeModel<T, TFilterData>;
	private input: TInput | undefined;

	private identityProvider: IIdentityProvider<T> | undefined;
	private nodesByIdentity = new Map<string, ITreeNode<T, TFilterData>>();

	constructor(
		private user: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<T>,
		renderers: ITreeRenderer<T, TFilterData, any>[],
		private dataSource: IDataSource<TInput, T>,
		options: IDataTreeOptions<T, TFilterData> = {}
	) {
		super(user, container, delegate, renderers, options as IDataTreeOptions<T | null, TFilterData>);
		this.identityProvider = options.identityProvider;
	}

	// Model

	getInput(): TInput | undefined {
		return this.input;
	}

	setInput(input: TInput | undefined, viewState?: AbstractTreeViewState): void {
		if (viewState && !this.identityProvider) {
			throw new TreeError(this.user, 'Can\'t restore tree view state without an identity provider');
		}

		this.input = input;

		if (!input) {
			this.nodesByIdentity.clear();
			this.model.setChildren(null, Iterable.empty());
			return;
		}

		if (!viewState) {
			this._refresh(input);
			return;
		}

		const focus: T[] = [];
		const selection: T[] = [];

		const isCollapsed = (element: T) => {
			const id = this.identityProvider!.getId(element).toString();
			return !viewState.expanded[id];
		};

		const onDidCreateNode = (node: ITreeNode<T, TFilterData>) => {
			const id = this.identityProvider!.getId(node.element).toString();

			if (viewState.focus.has(id)) {
				focus.push(node.element);
			}

			if (viewState.selection.has(id)) {
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
			throw new TreeError(this.user, 'Tree input not set');
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

				outerOnDidCreateNode?.(node);
			};

			onDidDeleteNode = (node: ITreeNode<T, TFilterData>) => {
				const id = this.identityProvider!.getId(node.element).toString();

				if (!insertedElements.has(id)) {
					this.nodesByIdentity.delete(id);
				}
			};
		}

		this.model.setChildren((element === this.input ? null : element) as T, this.iterate(element, isCollapsed).elements, { onDidCreateNode, onDidDeleteNode });
	}

	private iterate(element: TInput | T, isCollapsed?: (el: T) => boolean | undefined): { elements: Iterable<ITreeElement<T>>; size: number } {
		const children = [...this.dataSource.getChildren(element)];
		const elements = Iterable.map(children, element => {
			const { elements: children, size } = this.iterate(element, isCollapsed);
			const collapsible = this.dataSource.hasChildren ? this.dataSource.hasChildren(element) : undefined;
			const collapsed = size === 0 ? undefined : (isCollapsed && isCollapsed(element));

			return { element, children, collapsible, collapsed };
		});

		return { elements, size: children.length };
	}

	protected createModel(user: string, options: IDataTreeOptions<T, TFilterData>): ITreeModel<T | null, TFilterData, T | null> {
		return new ObjectTreeModel(user, options);
	}
}
