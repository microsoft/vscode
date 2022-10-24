/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { List } from 'vs/base/browser/ui/list/listWidget';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';

export class BaseActionWidget extends Disposable {

	private _widget: HTMLElement | undefined;
	private _actions = this._register(new MutableDisposable<Disposable>());
	private _actionList: List<any> | undefined;

	constructor() {
		super();
	}

	public render(): HTMLElement {
		this._widget = document.createElement('div');
		this._widget.classList.add('codeActionWidget');
		return this._widget;
	}

	public focusPrevious(filter: (arg: any) => boolean) {
		this._actionList?.focusPrevious();
	}

	public focusNext(filter?: (arg: any) => boolean) {
		this._actionList?.focusNext();
	}

	public acceptSelected(filter?: (arg: any) => boolean, preview?: boolean) {
		// this._actionList?.acceptSelected(undefined, preview);
	}

	public hide() {
		this._actions.clear();
	}

	public clear() {
		this._actions.clear();
	}

	public layout(minWidth: number, filter: (arg: any) => boolean) {
		this._actionList?.layout(minWidth);
	}
}

