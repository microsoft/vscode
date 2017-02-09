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

	register(tree: ITree): IDisposable;
	register(list: List<any>): IDisposable;

	getFocused(): ITree | List<any>;
}

export const ListFocusContext = new RawContextKey<boolean>('listFocus', false);

export class ListService implements IListService {

	public _serviceBrand: any;

	private focusedTreeOrList: ITree | List<any>;
	private lists: (ITree | List<any>)[];

	private listFocusContext: IContextKey<boolean>;

	private focusChangeScheduler: RunOnceScheduler;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.listFocusContext = ListFocusContext.bindTo(contextKeyService);
		this.lists = [];
		this.focusChangeScheduler = new RunOnceScheduler(() => this.onFocusChange(), 50 /* delay until the focus/blur dust settles */);
	}

	public register(tree: ITree): IDisposable;
	public register(list: List<any>): IDisposable;
	public register(widget: ITree | List<any>): IDisposable {
		if (this.lists.indexOf(widget) >= 0) {
			throw new Error('Cannot register the same widget multiple times');
		}

		// Keep in our lists list
		this.lists.push(widget);

		// Check for currently being focused
		if (widget.isDOMFocused()) {
			this.setFocusedList(widget);
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
			dispose: () => { this.lists.splice(this.lists.indexOf(widget), 1); }
		});

		return {
			dispose: () => dispose(toDispose)
		};
	}

	private onFocusChange(): void {
		let focusedList: ITree | List<any>;
		for (let i = 0; i < this.lists.length; i++) {
			const list = this.lists[i];
			if (document.activeElement === list.getHTMLElement()) {
				focusedList = list;
				break;
			}
		}

		this.setFocusedList(focusedList);
	}

	private setFocusedList(focusedList: ITree | List<any>): void {
		this.focusedTreeOrList = focusedList;
		this.listFocusContext.set(!!focusedList);
	}

	public getFocused(): ITree | List<any> {
		if (!(this.focusedTreeOrList instanceof List) && this.focusedTreeOrList.getHighlight()) {
			return null; // a tree in highlight mode is not focused
		}

		return this.focusedTreeOrList;
	}
}