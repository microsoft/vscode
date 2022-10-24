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

	public focusPrevious() {
		this._actionList?.focusPrevious();
	}

	public focusNext() {
		this._actionList?.focusNext();
	}


	public hide() {
		this._actions.clear();
	}

	public clear() {
		this._actions.clear();
	}

	public layout(minWidth: number) {
		this._actionList?.layout(minWidth);
	}
}

