/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListEvent, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';

export class BaseActionWidget extends Disposable {

	private _widget: HTMLElement | undefined;
	private _actions = this._register(new MutableDisposable<ActionList>());
	private _actionList: ActionList | undefined;

	constructor() {
		super();
	}

	public render(): HTMLElement {
		this._widget = document.createElement('div');
		this._widget.classList.add('codeActionWidget');
		return this._widget;
	}

	public setQuickFixes(fixes: ActionList): void {
		this._actionList = fixes;
		this._widget?.appendChild(this._actionList.domNode);
	}

	public focusPrevious(filter: (arg: any) => boolean) {
		this._actionList?.focusPrevious(filter);
	}

	public focusNext(filter?: (arg: any) => boolean) {
		this._actionList?.focusNext(filter);
	}

	public acceptSelected(filter: (arg: any) => boolean, options?: any) {
		this._actionList?.acceptSelected(filter, options);
	}

	public hide() {
		this._actions.clear();
	}

	public clear() {
		this._actions.clear();
	}

	public layout(minWidth: number, filter: (arg: any) => boolean) {
		this._actionList?.layout(minWidth, filter);
	}

	public onListSelection(e: IListEvent<any>, condition: (arg: any) => boolean, secondaryCondition: (arg: any) => boolean): void {
		this._actionList?.onListSelection(e, condition, secondaryCondition);
	}

	public onListClick(e: IListMouseEvent<any>, condition: (arg: any) => boolean) {
		this._actionList?.onListClick(e, condition);
	}

	public onListHover(e: IListMouseEvent<any>) {
		const items = typeof e.index === 'number' ? [e.index] : [];
		this._actionList?.onListHover(items);
	}
}

export class ActionList extends Disposable {
	public readonly domNode: HTMLElement;
	private readonly list: List<any>;
	private readonly _actions: readonly any[];
	private readonly _actionLineHeight = 26;
	private readonly _headerLineHeight = 24;
	constructor(actions: readonly any[], _list: List<any>, private readonly _onDidSelect: (arg: any, arg2: any) => void) {
		super();
		this.list = _list;
		this._actions = actions;
		this.domNode = document.createElement('div');
		this.domNode.classList.add('codeActionList');
		this.list.splice(0, 0, this._actions as any);
		this.focusNext();
	}

	public layout(minWidth: number, filter: (item: any) => boolean): number {
		// Updating list height, depending on how many separators and headers there are.

		const numHeaders = this._actions.filter(item => filter(item)).length;
		const height = this.list.length * this._actionLineHeight;
		const heightWithHeaders = height + numHeaders * this._headerLineHeight - numHeaders * this._actionLineHeight;
		this.list.layout(heightWithHeaders);

		// For finding width dynamically (not using resize observer)
		const itemWidths: number[] = this._actions.map((_, index): number => {
			const element = document.getElementById(this.list.getElementID(index));
			if (element) {
				element.style.width = 'auto';
				const width = element.getBoundingClientRect().width;
				element.style.width = '';
				return width;
			}
			return 0;
		});

		// resize observer - can be used in the future since list widget supports dynamic height but not width
		const width = Math.max(...itemWidths, minWidth);
		this.list.layout(heightWithHeaders, width);

		this.domNode.style.height = `${heightWithHeaders}px`;

		this.list.domFocus();
		return width;
	}

	public focusPrevious(filter: (arg: any) => boolean) {
		this.list.focusPrevious(1, true, undefined, element => filter(element));
	}

	public focusNext(filter?: (arg: any) => boolean) {
		this.list.focusNext(1, true, undefined, element => filter ? filter(element) : true);
	}

	public acceptSelected(filter: (arg: any) => boolean, options?: any) {
		const focused = this.list.getFocus();
		if (focused.length === 0) {
			return;
		}

		const focusIndex = focused[0];
		const element = this.list.element(focusIndex);
		if (filter(element)) {
			return;
		}

		const event = new UIEvent(options?.preview);
		this.list.setSelection([focusIndex], event);
	}

	public onListSelection(e: IListEvent<any>, condition: (arg: any) => boolean, secondaryCondition: (arg: any) => boolean): void {
		if (!e.elements.length) {
			return;
		}
		const element = e.elements[0];
		if (condition(element)) {
			this._onDidSelect(element.action, { preview: secondaryCondition(element) });
		} else {
			this.list.setSelection([]);
		}
	}

	public onListHover(indices: number[]): void {
		this.list.setFocus(indices);
	}

	public onListClick(e: IListMouseEvent<any>, condition: (arg: any) => boolean): void {
		if (condition(e)) {
			this.list.setFocus([]);
		}
	}
}
