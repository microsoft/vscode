/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionItem, ActionMenuItem, IActionList } from 'vs/base/browser/ui/baseActionWidget/baseActionWidget';
import { IListEvent, IListMouseEvent, IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListOptions, List } from 'vs/base/browser/ui/list/listWidget';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';


export abstract class ActionList<T extends ActionMenuItem> extends Disposable implements IActionList {

	readonly codeActionLineHeight = 24;
	readonly headerLineHeight = 26;

	public readonly domNode: HTMLElement;

	private readonly allMenuItems: T[];

	public list: List<T>;

	constructor(
		listCtor: { user: string; virtualDelegate: IListVirtualDelegate<any>; renderers: IListRenderer<any, any>[]; options?: IListOptions<any> },
		codeActions: readonly ActionItem[],
		showHeaders: boolean,
		private readonly focusCondition: (element: T) => boolean,
		private readonly onDidSelect: (action: ActionItem, options: { readonly preview: boolean }) => void,
		@IContextViewService private readonly _contextViewService: IContextViewService
	) {
		super();
		this.domNode = document.createElement('div');
		this.domNode.classList.add('codeActionList');
		this.list = new List(listCtor.user, this.domNode, listCtor.virtualDelegate, listCtor.renderers, listCtor.options);


		this._register(this.list.onMouseClick(e => this.onListClick(e)));
		this._register(this.list.onMouseOver(e => this.onListHover(e)));
		this._register(this.list.onDidChangeFocus(() => this.list.domFocus()));
		this._register(this.list.onDidChangeSelection(e => this.onListSelection(e)));

		this.allMenuItems = this.toMenuItems(codeActions, showHeaders);
		this.list.splice(0, this.list.length, this.allMenuItems);

		this.focusNext();
	}

	public hide(): void {
		this._contextViewService.hideContextView();
	}

	public layout(minWidth: number): number {
		// Updating list height, depending on how many separators and headers there are.
		const numHeaders = this.allMenuItems.filter(item => item.isHeader).length;
		const height = this.allMenuItems.length * this.codeActionLineHeight;
		const heightWithHeaders = height + numHeaders * this.headerLineHeight - numHeaders * this.codeActionLineHeight;
		this.list.layout(heightWithHeaders);

		// For finding width dynamically (not using resize observer)
		const itemWidths: number[] = this.allMenuItems.map((_, index): number => {
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

	public focusPrevious() {
		this.list.focusPrevious(1, true, undefined, this.focusCondition);
	}

	public focusNext() {
		this.list.focusNext(1, true, undefined, this.focusCondition);
	}

	public acceptSelected(options?: { readonly preview?: boolean }) {
		const focused = this.list.getFocus();
		if (focused.length === 0) {
			return;
		}

		const focusIndex = focused[0];
		const element = this.list.element(focusIndex);
		if (this.focusCondition(element)) {
			return;
		}

		const event = new UIEvent(options?.preview ? 'previewSelectedEventType' : 'acceptSelectedCodeAction');
		this.list.setSelection([focusIndex], event);
	}

	private onListSelection(e: IListEvent<T>): void {
		if (!e.elements.length) {
			return;
		}

		const element = e.elements[0];
		if (element.action && this.focusCondition(element)) {
			this.onDidSelect(element.action, { preview: e.browserEvent?.type === 'previewSelectedEventType' });
		} else {
			this.list.setSelection([]);
		}
	}

	private onListHover(e: IListMouseEvent<T>): void {
		this.list.setFocus(typeof e.index === 'number' ? [e.index] : []);
	}

	private onListClick(e: IListMouseEvent<T>): void {
		if (e.element && this.focusCondition(e.element)) {
			this.list.setFocus([]);
		}
	}

	public abstract toMenuItems(inputCodeActions: readonly ActionItem[], showHeaders: boolean): T[];
}
