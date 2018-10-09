/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Iterator } from 'vs/base/common/iterator';

export const enum TreeVisibility {
	Hidden,
	Visible,
	Recurse // TODO@joao come up with a better name
}

export interface ITreeFilterDataResult<TFilterData> {
	visibility: boolean | TreeVisibility;
	data: TFilterData;
}

export type TreeFilterResult<TFilterData> = boolean | TreeVisibility | ITreeFilterDataResult<TFilterData>;

export interface ITreeFilter<T, TFilterData = void> {
	filter(element: T): TreeFilterResult<TFilterData>;
}

export interface ITreeOptions<T, TFilterData = void> {
	filter?: ITreeFilter<T, TFilterData>;
}

export interface ITreeElement<T> {
	readonly element: T;
	readonly children?: Iterator<ITreeElement<T>> | ITreeElement<T>[];
	readonly collapsible?: boolean;
	readonly collapsed?: boolean;
}

export interface ITreeNode<T, TFilterData = void> {
	readonly parent: ITreeNode<T, TFilterData> | undefined;
	readonly element: T;
	readonly children: ITreeNode<T, TFilterData>[];
	readonly depth: number;
	readonly collapsible: boolean;
	readonly collapsed: boolean;
	readonly revealedCount: number;
	readonly filterData: TFilterData | undefined;
}

export interface ITreeModel<T, TFilterData, TRef> {
	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>>;

	getListIndex(ref: TRef): number;
	setCollapsed(ref: TRef, collapsed: boolean): boolean;
	toggleCollapsed(ref: TRef): void;
	isCollapsed(ref: TRef): boolean;
	refilter(): void;

	getNodeLocation(node: ITreeNode<T, any>): TRef;
	getParentNodeLocation(location: TRef): TRef | null;

	getParentElement(location: TRef): T | null;
	getFirstElementChild(location: TRef): T | null;
	getLastElementAncestor(location: TRef): T | null;
}