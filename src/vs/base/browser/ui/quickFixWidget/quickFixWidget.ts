/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListEvent, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';

export class QuickFixWidget extends Disposable {

	private _quickFixWidget: HTMLElement | undefined;
	private _quickFixes = this._register(new MutableDisposable<QuickFixList>());

	constructor() {
		super();
	}

	public render(): HTMLElement {
		this._quickFixWidget = document.createElement('div');
		this._quickFixWidget.classList.add('codeActionWidget');
		return this._quickFixWidget;
	}

	public setQuickFixes(fixes: QuickFixList): void {
		this._quickFixes.value = fixes;
		this._quickFixWidget!.appendChild(this._quickFixes.value.domNode);
	}

	public focusPrevious(filter: (arg: any) => boolean) {
		this._quickFixes?.value?.focusPrevious(filter);
	}

	public focusNext(filter: (arg: any) => boolean) {
		this._quickFixes?.value?.focusNext(filter);
	}

	public acceptSelected(filter: (arg: any) => boolean, options?: any) {
		this._quickFixes?.value?.acceptSelected(filter, options);
	}

	public hide() {
		this._quickFixes.clear();
		// this._quickFixes?.value?.hideContextView();
	}

	public clear() {
		this._quickFixes.clear();
	}

	public layout(minWidth: number, filter: (arg: any) => boolean) {
		this._quickFixes!.value!.layout(minWidth, filter);
	}

	public onListSelection(e: IListEvent<any>, condition: (arg: any) => boolean, secondaryCondition: (arg: any) => boolean): void {
		this._quickFixes!.value!.onListSelection(e, condition, secondaryCondition);
	}

	public onListClick(e: IListMouseEvent<any>, condition: (arg: any) => boolean) {
		this._quickFixes.value?.onListClick(e, condition);
	}

	public onListHover(e: IListMouseEvent<any>) {
		const items = typeof e.index === 'number' ? [e.index] : [];
		this._quickFixes.value?.onListHover(items);
	}
}

export class QuickFixList extends Disposable {
	public readonly domNode: HTMLElement;
	private readonly list: List<any>;
	private readonly _actions: readonly any[];
	private readonly _quickFixLineHeight = 26;
	private readonly _headerLineHeight = 24;
	constructor(actions: readonly any[], _list: List<any>, private readonly _onDidSelect: (arg: any, arg2: any) => void) {
		super();
		this.list = _list;
		this._actions = actions;
		this.domNode = document.createElement('div');
		this.domNode.classList.add('codeActionList');
	}

	public layout(minWidth: number, filter: (item: any) => boolean): number {
		// Updating list height, depending on how many separators and headers there are.

		const numHeaders = this._actions.filter(item => filter(item)).length;
		const height = this.list.length * this._quickFixLineHeight;
		const heightWithHeaders = height + numHeaders * this._headerLineHeight - numHeaders * this._quickFixLineHeight;
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

	public focusNext(filter: (arg: any) => boolean) {
		this.list.focusNext(1, true, undefined, element => filter(element));
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
