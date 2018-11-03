/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Iterator } from 'vs/base/common/iterator';
import { IListRenderer } from 'vs/base/browser/ui/list/list';

export const enum TreeVisibility {

	/**
	 * The tree node should be hidden.
	 */
	Hidden,

	/**
	 * The tree node should be visible.
	 */
	Visible,

	/**
	 * The tree node should be visible if any of its descendants is visible.
	 */
	Recurse
}

/**
 * A composed filter result containing the visibility result as well as
 * metadata.
 */
export interface ITreeFilterDataResult<TFilterData> {

	/**
	 * Whether the node should be visibile.
	 */
	visibility: boolean | TreeVisibility;

	/**
	 * Metadata about the element's visibility which gets forwarded to the
	 * renderer once the element gets rendered.
	 */
	data: TFilterData;
}

/**
 * The result of a filter call can be a boolean value indicating whether
 * the element should be visible or not, a value of type `TreeVisibility` or
 * an object composed of the visibility result as well as additional metadata
 * which gets forwarded to the renderer once the element gets rendered.
 */
export type TreeFilterResult<TFilterData> = boolean | TreeVisibility | ITreeFilterDataResult<TFilterData>;

/**
 * A tree filter is responsible for controlling the visibility of
 * elements in a tree.
 */
export interface ITreeFilter<T, TFilterData = void> {

	/**
	 * Returns whether this elements should be visible and, if affirmative,
	 * additional metadata which gets forwarded to the renderer once the element
	 * gets rendered.
	 *
	 * @param element The tree element.
	 */
	filter(element: T, parentVisibility: TreeVisibility): TreeFilterResult<TFilterData>;
}

export interface ITreeElement<T> {
	readonly element: T;
	readonly children?: Iterator<ITreeElement<T>> | ITreeElement<T>[];
	readonly collapsible?: boolean;
	readonly collapsed?: boolean;
}

export interface ITreeNode<T, TFilterData = void> {
	readonly element: T;
	readonly parent: ITreeNode<T, TFilterData> | undefined;
	readonly children: ITreeNode<T, TFilterData>[];
	readonly depth: number;
	readonly collapsible: boolean;
	readonly collapsed: boolean;
	readonly visible: boolean;
	readonly filterData: TFilterData | undefined;
}

export interface ITreeModel<T, TFilterData, TRef> {
	readonly onDidChangeCollapseState: Event<ITreeNode<T, TFilterData>>;
	readonly onDidChangeRenderNodeCount: Event<ITreeNode<T, TFilterData>>;

	getListIndex(location: TRef): number;
	getNode(location?: TRef): ITreeNode<T, any>;
	getNodeLocation(node: ITreeNode<T, any>): TRef;
	getParentNodeLocation(location: TRef): TRef | null;

	getParentElement(location: TRef): T | null;
	getFirstChildElement(location: TRef): T | null;
	getLastAncestorElement(location: TRef): T | null;

	isCollapsed(location: TRef): boolean;
	setCollapsed(location: TRef, collapsed: boolean): boolean;
	toggleCollapsed(location: TRef): void;
	collapseAll(): void;

	refilter(): void;
}

export interface ITreeRenderer<T, TFilterData, TTemplateData> extends IListRenderer<ITreeNode<T, TFilterData>, TTemplateData> {
	renderTwistie?(element: T, twistieElement: HTMLElement): boolean;
	onDidChangeTwistieState?: Event<T>;
}