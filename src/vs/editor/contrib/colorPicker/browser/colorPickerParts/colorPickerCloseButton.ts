/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../colorPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { Emitter } from '../../../../../base/common/event.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';

const $ = dom.$;

export class CloseButton extends Disposable {

	private _button: HTMLElement;
	private readonly _onClicked = this._register(new Emitter<void>());
	public readonly onClicked = this._onClicked.event;

	constructor(container: HTMLElement) {
		super();
		this._button = document.createElement('div');
		this._button.classList.add('close-button');
		dom.append(container, this._button);

		const innerDiv = document.createElement('div');
		innerDiv.classList.add('close-button-inner-div');
		dom.append(this._button, innerDiv);

		const closeButton = dom.append(innerDiv, $('.button' + ThemeIcon.asCSSSelector(registerIcon('color-picker-close', Codicon.close, localize('closeIcon', 'Icon to close the color picker')))));
		closeButton.classList.add('close-icon');
		this._register(dom.addDisposableListener(this._button, dom.EventType.CLICK, () => {
			this._onClicked.fire();
		}));
	}
}
