/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITree, ITreeConfiguration, ITreeOptions } from 'vs/base/parts/tree/browser/tree';
import { List, IListOptions } from 'vs/base/browser/ui/list/listWidget';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, toDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { PagedList, IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export type ListWidget = List<any> | PagedList<any> | ITree;

export const IListService = createDecorator<IListService>('listService');

export interface IListService {

	_serviceBrand: any;

	/**
	 * Returns the currently focused list widget if any.
	 */
	readonly lastFocusedList: ListWidget | undefined;
}

interface IRegisteredList {
	widget: ListWidget;
	extraContextKeys?: (IContextKey<boolean>)[];
}

export class ListService implements IListService {

	_serviceBrand: any;

	private lists: IRegisteredList[] = [];
	private _lastFocusedWidget: ListWidget | undefined = undefined;

	get lastFocusedList(): ListWidget | undefined {
		return this._lastFocusedWidget;
	}

	constructor( @IContextKeyService contextKeyService: IContextKeyService) { }

	register(widget: ListWidget, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable {
		if (this.lists.some(l => l.widget === widget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		// Keep in our lists list
		const registeredList: IRegisteredList = { widget, extraContextKeys };
		this.lists.push(registeredList);

		// Check for currently being focused
		if (widget.isDOMFocused()) {
			this._lastFocusedWidget = widget;
		}

		const result = combinedDisposable([
			widget.onDidFocus(() => this._lastFocusedWidget = widget),
			toDisposable(() => this.lists.splice(this.lists.indexOf(registeredList), 1))
		]);

		return result;
	}
}


export const WorkbenchListFocusContextKey = new RawContextKey<boolean>('listFocus', true);

export type Widget = List<any> | PagedList<any> | ITree;

function createScopedContextKeyService(contextKeyService: IContextKeyService, widget: Widget): IContextKeyService {
	const result = contextKeyService.createScoped(widget.getHTMLElement());
	WorkbenchListFocusContextKey.bindTo(result);
	return result;
}

export class WorkbenchList<T> extends List<T> {

	readonly contextKeyService: IContextKeyService;
	private disposable: IDisposable;

	constructor(
		container: HTMLElement,
		delegate: IDelegate<T>,
		renderers: IRenderer<T, any>[],
		options: IListOptions<T>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService
	) {
		super(container, delegate, renderers, options);
		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		this.disposable = combinedDisposable([
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService)
		]);
	}

	dispose(): void {
		this.disposable.dispose();
	}
}

export class WorkbenchPagedList<T> extends PagedList<T> {

	readonly contextKeyService: IContextKeyService;
	private disposable: IDisposable;

	constructor(
		container: HTMLElement,
		delegate: IDelegate<number>,
		renderers: IPagedRenderer<T, any>[],
		options: IListOptions<any>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService
	) {
		super(container, delegate, renderers, options);
		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		this.disposable = combinedDisposable([
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService)
		]);
	}

	dispose(): void {
		this.disposable.dispose();
	}
}

export class WorkbenchTree extends Tree {

	readonly contextKeyService: IContextKeyService;
	private disposable: IDisposable;

	constructor(
		container: HTMLElement,
		configuration: ITreeConfiguration,
		options: ITreeOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService
	) {
		super(container, configuration, options);
		this.contextKeyService = createScopedContextKeyService(contextKeyService, this);

		this.disposable = combinedDisposable([
			this.contextKeyService,
			(listService as ListService).register(this),
			attachListStyler(this, themeService)
		]);
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
