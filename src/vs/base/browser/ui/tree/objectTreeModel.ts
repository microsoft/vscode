/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ISpliceable } from 'vs/base/common/sequence';
import { Iterator, ISequence } from 'vs/base/common/iterator';
import { TreeModel, ITreeNode, ITreeModelOptions, ITreeElement } from 'vs/base/browser/ui/tree/treeModel';
import { Event } from 'vs/base/common/event';

export class TreeObjectModel<T extends NonNullable<any>, TFilterData = void> {

	private model: TreeModel<T, TFilterData>;
	private nodes = new Map<T, ITreeNode<T, TFilterData>>();

	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>>;

	get size(): number { return this.nodes.size; }

	constructor(list: ISpliceable<ITreeNode<T, TFilterData>>, options: ITreeModelOptions<T, TFilterData> = {}) {
		this.model = new TreeModel(list, options);
		this.onDidChangeCollapseState = this.model.onDidChangeCollapseState;
	}

	setChildren(element: T | null, children?: ISequence<ITreeElement<T>>): Iterator<ITreeElement<T>> {
		const location = this.getLocation(element);
		const insertedElements = new Set<T>();

		const onDidCreateNode = (node: ITreeNode<T, TFilterData>) => {
			insertedElements.add(node.element);
			this.nodes.set(node.element, node);
		};

		const onDidDeleteNode = (node: ITreeNode<T, TFilterData>) => {
			if (!insertedElements.has(node.element)) {
				this.nodes.delete(node.element);
			}
		};

		return this.model.splice([...location, 0], Number.MAX_VALUE, children, onDidCreateNode, onDidDeleteNode);
	}

	getListIndex(element: T): number {
		const location = this.getLocation(element);
		return this.model.getListIndex(location);
	}

	setCollapsed(element: T, collapsed: boolean): boolean {
		const location = this.getLocation(element);
		return this.model.setCollapsed(location, collapsed);
	}

	toggleCollapsed(element: T): void {
		const location = this.getLocation(element);
		this.model.toggleCollapsed(location);
	}

	isCollapsed(element: T): boolean {
		const location = this.getLocation(element);
		return this.model.isCollapsed(location);
	}

	refilter(): void {
		this.model.refilter();
	}

	private getLocation(element: T | null): number[] {
		if (element === null) {
			return [];
		}

		const node = this.nodes.get(element);

		if (!node) {
			throw new Error(`Tree element not found: ${element}`);
		}

		return TreeModel.getNodeLocation(node);
	}
}