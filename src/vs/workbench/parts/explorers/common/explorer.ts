/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IActionRunner } from 'vs/base/common/actions';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export const IExplorerViewsService = createDecorator<IExplorerViewsService>('explorerViewsService');

export interface IExplorerViewsService {
	_serviceBrand: any;

	readonly onViewCreated: Event<IExplorerView<any>>;

	createView<T>(id: string, name: string, dataProvider: IExplorerViewDataProvider<T>): IExplorerView<T>;
	getViews<T>(): IExplorerView<T>[];
}

export interface IExplorerView<T> extends IDisposable {
	refresh(element: T): void;
	instantiate(actionRunner: IActionRunner, viewletSetings: any, instantiationService: IInstantiationService): any;
}

export interface IExplorerViewDataProvider<T> {
	provideRoot(): TPromise<T>;
	resolveChildren(element: T): TPromise<T[]>;
	getId(element: T): string;
	getLabel(element: T): string;
	getContextKey(element: T): string;
	hasChildren(element: T): boolean;
	select(element: T): void;
}
