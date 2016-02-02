/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./button';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import DOM = require('vs/base/browser/dom');
import {Builder, $} from 'vs/base/browser/builder';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {CommonKeybindings} from 'vs/base/common/keyCodes';

export class Button extends EventEmitter {

	private $el: Builder;

	constructor(container: Builder);
	constructor(container: HTMLElement);
	constructor(container: any) {
		super();

		this.$el = $('a.monaco-button').attr({
			'tabIndex': '0',
			'role': 'button'
		}).appendTo(container);

		this.$el.on(DOM.EventType.CLICK, (e) => {
			if (!this.enabled) {
				DOM.EventHelper.stop(e);
				return;
			}

			this.emit(DOM.EventType.CLICK, e);
		});

		this.$el.on(DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			let eventHandled = false;
			if (this.enabled && event.equals(CommonKeybindings.ENTER) || event.equals(CommonKeybindings.SPACE)) {
				this.emit(DOM.EventType.CLICK, e);
				eventHandled = true;
			} else if (event.equals(CommonKeybindings.ESCAPE)) {
				this.$el.domBlur();
				eventHandled = true;
			}

			if (eventHandled) {
				DOM.EventHelper.stop(event, true);
			}
		});
	}

	public getElement(): HTMLElement {
		return this.$el.getHTMLElement();
	}

	public set label(value: string) {
		this.$el.text(value);
	}

	public set enabled(value: boolean) {
		if (value) {
			this.$el.removeClass('disabled');
			this.$el.attr({
				'aria-disabled': 'false',
				'tabIndex': '0'
			});
		} else {
			this.$el.addClass('disabled');
			this.$el.attr('aria-disabled', String(true));
			DOM.removeTabIndexAndUpdateFocus(this.$el.getHTMLElement());
		}
	}

	public get enabled() {
		return !this.$el.hasClass('disabled');
	}

	public dispose(): void {
		if (this.$el) {
			this.$el.dispose();
			this.$el = null;
		}

		super.dispose();
	}
}