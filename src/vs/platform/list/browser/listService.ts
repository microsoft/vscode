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

	private listFocusContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.listFocusContext = ListFocusContext.bindTo(contextKeyService);
	}

	public register(tree: ITree): IDisposable;
	public register(list: List<any>): IDisposable;
	public register(widget: ITree | List<any>): IDisposable {

		// Check for currently being focused
		if (widget.isDOMFocused()) {
			this.onListDOMFocus(widget);
		}

		const toDispose = [
			widget.onDOMFocus(() => this.onListDOMFocus(widget)),
			widget.onDOMBlur(() => this.onListDOMBlur(widget))
		];

		// Special treatment for tree highlight mode
		if (!(widget instanceof List)) {
			toDispose.push(widget.onHighlightChange(() => {
				if (widget.getHighlight()) {
					this.onListDOMBlur(widget);
				} else if (widget.isDOMFocused()) {
					this.onListDOMFocus(widget);
				}
			}));
		}

		return {
			dispose: () => dispose(toDispose)
		};
	}

	private onListDOMFocus(list: ITree | List<any>): void {
		this.focusedTreeOrList = list;
		this.listFocusContext.set(true);
	}

	private onListDOMBlur(list: ITree | List<any>): void {
		this.focusedTreeOrList = void 0;
		this.listFocusContext.set(false);
	}

	public getFocused(): ITree | List<any> {
		if (!(this.focusedTreeOrList instanceof List) && this.focusedTreeOrList.getHighlight()) {
			return null; // a tree in highlight mode is not focused
		}

		return this.focusedTreeOrList;
	}
}