/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

const $ = dom.$;

export class HoverCopyButton extends Disposable {

	private readonly _button: HTMLElement;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _getContent: () => string,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IHoverService private readonly _hoverService: IHoverService
	) {
		super();

		this._button = dom.append(this._container, $('div.hover-copy-button'));
		this._button.setAttribute('role', 'button');
		this._button.setAttribute('tabindex', '0');
		this._button.setAttribute('aria-label', localize('hover.copy', "Copy"));

		dom.append(this._button, $(ThemeIcon.asCSSSelector(Codicon.copy)));

		this._register(dom.addDisposableListener(this._button, dom.EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._copyContent();
		}));

		this._register(dom.addDisposableListener(this._button, dom.EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				e.preventDefault();
				e.stopPropagation();
				this._copyContent();
			}
		}));

		const hoverDelegate = getDefaultHoverDelegate('element');
		this._register(this._hoverService.setupManagedHover(
			hoverDelegate,
			this._button,
			localize('hover.copyTooltip', "Copy to Clipboard")
		));
	}

	private async _copyContent(): Promise<void> {
		const content = this._getContent();
		if (content) {
			await this._clipboardService.writeText(content);
		}
	}
}
