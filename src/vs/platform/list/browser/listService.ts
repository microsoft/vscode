/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITree } from 'vs/base/parts/tree/browser/tree';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { RunOnceScheduler } from 'vs/base/common/async';

export const IListService = createDecorator<IListService>('listService');

export interface IListService {

	_serviceBrand: any;

	/**
	 * Makes a tree or list widget known to the list service. It will track the lists focus and
	 * blur events to update context keys based on the widget being focused or not.
	 *
	 * @param extraContextKeys an optional list of additional context keys to update based on
	 * the widget being focused or not.
	 */
	register(tree: ITree, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable;
	register(list: List<any>, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable;

	/**
	 * Returns the currently focused list widget if any.
	 */
	getFocused(): ITree | List<any>;
}

export const ListFocusContext = new RawContextKey<boolean>('listFocus', false);

interface IRegisteredList {
	widget: ITree | List<any>;
	extraContextKeys?: (IContextKey<boolean>)[];
}

export class ListService implements IListService {

	public _serviceBrand: any;

	private focusedTreeOrList: ITree | List<any>;
	private lists: IRegisteredList[];

	private listFocusContext: IContextKey<boolean>;

	private focusChangeScheduler: RunOnceScheduler;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.listFocusContext = ListFocusContext.bindTo(contextKeyService);
		this.lists = [];
		this.focusChangeScheduler = new RunOnceScheduler(() => this.onFocusChange(), 50 /* delay until the focus/blur dust settles */);
	}

	public register(tree: ITree, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable;
	public register(list: List<any>, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable;
	public register(widget: ITree | List<any>, extraContextKeys?: (IContextKey<boolean>)[]): IDisposable {
		if (this.indexOf(widget) >= 0) {
			throw new Error('Cannot register the same widget multiple times');
		}

		// Keep in our lists list
		const registeredList: IRegisteredList = { widget, extraContextKeys };
		this.lists.push(registeredList);

		// Check for currently being focused
		if (widget.isDOMFocused()) {
			this.setFocusedList(registeredList);
		}

		const toDispose = [
			widget.onDOMFocus(() => this.focusChangeScheduler.schedule()),
			widget.onDOMBlur(() => this.focusChangeScheduler.schedule())
		];

		// Special treatment for tree highlight mode
		if (!(widget instanceof List)) {
			const tree = widget;

			toDispose.push(tree.onHighlightChange(() => {
				this.focusChangeScheduler.schedule();
			}));
		}

		// Remove list once disposed
		toDispose.push({
			dispose: () => { this.lists.splice(this.lists.indexOf(registeredList), 1); }
		});

		return {
			dispose: () => dispose(toDispose)
		};
	}

	private indexOf(widget: ITree | List<any>): number {
		for (let i = 0; i < this.lists.length; i++) {
			const list = this.lists[i];
			if (list.widget === widget) {
				return i;
			}
		}

		return -1;
	}

	private onFocusChange(): void {
		let focusedList: IRegisteredList;
		for (let i = 0; i < this.lists.length; i++) {
			const list = this.lists[i];
			if (document.activeElement === list.widget.getHTMLElement()) {
				focusedList = list;
				break;
			}
		}

		this.setFocusedList(focusedList);
	}

	private setFocusedList(focusedList?: IRegisteredList): void {

		// First update our context
		if (focusedList) {
			this.focusedTreeOrList = focusedList.widget;
			this.listFocusContext.set(true);
		} else {
			this.focusedTreeOrList = void 0;
			this.listFocusContext.set(false);
		}

		// Then check for extra contexts to unset
		for (let i = 0; i < this.lists.length; i++) {
			const list = this.lists[i];
			if (list !== focusedList && list.extraContextKeys) {
				list.extraContextKeys.forEach(key => key.set(false));
			}
		}

		// Finally set context for focused list if there are any
		if (focusedList && focusedList.extraContextKeys) {
			focusedList.extraContextKeys.forEach(key => key.set(true));
		}
	}

	public getFocused(): ITree | List<any> {
		return this.focusedTreeOrList;
	}
}