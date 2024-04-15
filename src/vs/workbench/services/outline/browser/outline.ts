/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IDataSource, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchDataTreeOptions } from 'vs/platform/list/browser/listService';
import { IEditorPane } from 'vs/workbench/common/editor';

export const IOutlineService = createDecorator<IOutlineService>('IOutlineService');

export const enum OutlineTarget {
	OutlinePane = 1,
	Breadcrumbs = 2,
	QuickPick = 4
}

export interface IOutlineService {
	_serviceBrand: undefined;
	onDidChange: Event<void>;
	canCreateOutline(editor: IEditorPane): boolean;
	createOutline(editor: IEditorPane, target: OutlineTarget, token: CancellationToken): Promise<IOutline<any> | undefined>;
	registerOutlineCreator(creator: IOutlineCreator<any, any>): IDisposable;
}

export interface IOutlineCreator<P extends IEditorPane, E> {
	matches(candidate: IEditorPane): candidate is P;
	createOutline(editor: P, target: OutlineTarget, token: CancellationToken): Promise<IOutline<E> | undefined>;
}

export interface IBreadcrumbsDataSource<E> {
	getBreadcrumbElements(): readonly E[];
}

export interface IOutlineComparator<E> {
	compareByPosition(a: E, b: E): number;
	compareByType(a: E, b: E): number;
	compareByName(a: E, b: E): number;
}

export interface IQuickPickOutlineElement<E> {
	readonly element: E;
	readonly label: string;
	readonly iconClasses?: string[];
	readonly ariaLabel?: string;
	readonly description?: string;
}

export interface IQuickPickDataSource<E> {
	getQuickPickElements(): IQuickPickOutlineElement<E>[];
}

export interface IOutlineListConfig<E> {
	readonly breadcrumbsDataSource: IBreadcrumbsDataSource<E>;
	readonly treeDataSource: IDataSource<IOutline<E>, E>;
	readonly delegate: IListVirtualDelegate<E>;
	readonly renderers: ITreeRenderer<E, FuzzyScore, any>[];
	readonly comparator: IOutlineComparator<E>;
	readonly options: IWorkbenchDataTreeOptions<E, FuzzyScore>;
	readonly quickPickDataSource: IQuickPickDataSource<E>;
}

export interface OutlineChangeEvent {
	affectOnlyActiveElement?: true;
}

export interface IOutline<E> {

	readonly uri: URI | undefined;

	readonly config: IOutlineListConfig<E>;
	readonly outlineKind: string;

	readonly isEmpty: boolean;
	readonly activeElement: E | undefined;
	readonly onDidChange: Event<OutlineChangeEvent>;

	reveal(entry: E, options: IEditorOptions, sideBySide: boolean, select: boolean): Promise<void> | void;
	preview(entry: E): IDisposable;
	captureViewState(): IDisposable;
	dispose(): void;
}


export const enum OutlineConfigKeys {
	'icons' = 'outline.icons',
	'collapseItems' = 'outline.collapseItems',
	'problemsEnabled' = 'outline.problems.enabled',
	'problemsColors' = 'outline.problems.colors',
	'problemsBadges' = 'outline.problems.badges'
}

export const enum OutlineConfigCollapseItemsValues {
	Collapsed = 'alwaysCollapse',
	Expanded = 'alwaysExpand'
}
