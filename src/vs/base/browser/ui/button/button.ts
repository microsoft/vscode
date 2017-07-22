/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./button';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import DOM = require('vs/base/browser/dom');
import { Builder, $ } from 'vs/base/browser/builder';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Color } from 'vs/base/common/color';
import { mixin } from 'vs/base/common/objects';

export interface IButtonOptions extends IButtonStyles {
}

export interface IButtonStyles {
	buttonBackground?: Color;
	buttonHoverBackground?: Color;
	buttonForeground?: Color;
	buttonBorder?: Color;
}

const defaultOptions: IButtonStyles = {
	buttonBackground: Color.fromHex('#0E639C'),
	buttonHoverBackground: Color.fromHex('#006BB3'),
	buttonForeground: Color.white
};

export class Button extends EventEmitter {

	private $el: Builder;
	private options: IButtonOptions;

	private buttonBackground: Color;
	private buttonHoverBackground: Color;
	private buttonForeground: Color;
	private buttonBorder: Color;

	constructor(container: Builder, options?: IButtonOptions);
	constructor(container: HTMLElement, options?: IButtonOptions);
	constructor(container: any, options?: IButtonOptions) {
		super();

		this.options = options || Object.create(null);
		mixin(this.options, defaultOptions, false);

		this.buttonBackground = this.options.buttonBackground;
		this.buttonHoverBackground = this.options.buttonHoverBackground;
		this.buttonForeground = this.options.buttonForeground;
		this.buttonBorder = this.options.buttonBorder;

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
			if (this.enabled && event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				this.emit(DOM.EventType.CLICK, e);
				eventHandled = true;
			} else if (event.equals(KeyCode.Escape)) {
				this.$el.domBlur();
				eventHandled = true;
			}

			if (eventHandled) {
				DOM.EventHelper.stop(event, true);
			}
		});

		this.$el.on(DOM.EventType.MOUSE_OVER, (e: MouseEvent) => {
			if (!this.$el.hasClass('disabled')) {
				const hoverBackground = this.buttonHoverBackground ? this.buttonHoverBackground.toString() : null;
				if (hoverBackground) {
					this.$el.style('background-color', hoverBackground);
				}
			}
		});

		this.$el.on(DOM.EventType.MOUSE_OUT, (e: MouseEvent) => {
			this.applyStyles(); // restore standard styles
		});

		this.applyStyles();
	}

	style(styles: IButtonStyles): void {
		this.buttonForeground = styles.buttonForeground;
		this.buttonBackground = styles.buttonBackground;
		this.buttonHoverBackground = styles.buttonHoverBackground;
		this.buttonBorder = styles.buttonBorder;

		this.applyStyles();
	}

	private applyStyles(): void {
		if (this.$el) {
			const background = this.buttonBackground ? this.buttonBackground.toString() : null;
			const foreground = this.buttonForeground ? this.buttonForeground.toString() : null;
			const border = this.buttonBorder ? this.buttonBorder.toString() : null;

			this.$el.style('color', foreground);
			this.$el.style('background-color', background);

			this.$el.style('border-width', border ? '1px' : null);
			this.$el.style('border-style', border ? 'solid' : null);
			this.$el.style('border-color', border);
		}
	}

	getElement(): HTMLElement {
		return this.$el.getHTMLElement();
	}

	set label(value: string) {
		if (!this.$el.hasClass('monaco-text-button')) {
			this.$el.addClass('monaco-text-button');
		}
		this.$el.text(value);
	}

	set icon(iconClassName: string) {
		this.$el.addClass(iconClassName);
	}

	set enabled(value: boolean) {
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

	get enabled() {
		return !this.$el.hasClass('disabled');
	}

	focus(): void {
		this.$el.domFocus();
	}

	dispose(): void {
		if (this.$el) {
			this.$el.dispose();
			this.$el = null;
		}

		super.dispose();
	}
}