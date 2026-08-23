/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../colorPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

export class InsertButton extends Disposable {

	private _button: HTMLElement;
	private readonly _onClicked = this._register(new Emitter<void>());
	public readonly onClicked = this._onClicked.event;

	constructor(container: HTMLElement) {
		super();
		this._button = dom.append(container, document.createElement('button'));
		this._button.classList.add('insert-button');
		this._button.textContent = 'Insert';
		this._register(dom.addDisposableListener(this._button, dom.EventType.CLICK, () => {
			this._onClicked.fire();
		}));
	}

	public get button(): HTMLElement {
		return this._button;
	}
}
