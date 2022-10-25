/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
export interface ActionList extends Disposable {
	focusPrevious(): void;
	focusNext(): void;
	layout(minWidth: number): number;
	toMenuItems(inputCodeActions: readonly ActionItem[], showHeaders: boolean): ActionMenuItem[];
	acceptSelected(options?: { readonly preview?: boolean }): void;
	domNode: HTMLElement;
}
export interface ActionItem extends Disposable { }

export interface ActionMenuItem {
	action?: ActionItem;
}

export abstract class BaseActionWidget<T extends ActionItem> extends Disposable {

	list = this._register(new MutableDisposable<ActionList>());

	constructor() {
		super();
	}

	public focusPrevious() {
		this.list?.value?.focusPrevious();
	}

	public focusNext() {
		this.list?.value?.focusNext();
	}

	public hide() {
		this.list.clear();
	}

	public clear() {
		this.list.clear();
	}

	public layout(minWidth: number) {
		this.list?.value?.layout(minWidth);
	}

	public abstract show(trigger: any, codeActions: any, anchor: IAnchor, container: HTMLElement | undefined, options: any, delegate: any): Promise<void>;
	public abstract toMenuItems(actions: readonly T[], showHeaders: boolean): ActionMenuItem[];
}

