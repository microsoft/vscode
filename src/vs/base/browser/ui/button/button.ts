/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./button';
import DOM = require('vs/base/browser/dom');
import { Builder, $ } from 'vs/base/browser/builder';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Color } from 'vs/base/common/color';
import { mixin } from 'vs/base/common/objects';
import Event, { Emitter } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';

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

export class Button {

	private $el: Builder;
	private options: IButtonOptions;

	private buttonBackground: Color;
	private buttonHoverBackground: Color;
	private buttonForeground: Color;
	private buttonBorder: Color;

	private _onDidClick = new Emitter<any>();
	readonly onDidClick: Event<any> = this._onDidClick.event;

	private focusTracker: DOM.IFocusTracker;

	constructor(container: Builder, options?: IButtonOptions);
	constructor(container: HTMLElement, options?: IButtonOptions);
	constructor(container: any, options?: IButtonOptions) {
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

		this.$el.on(DOM.EventType.CLICK, e => {
			if (!this.enabled) {
				DOM.EventHelper.stop(e);
				return;
			}

			this._onDidClick.fire(e);
		});

		this.$el.on(DOM.EventType.KEY_DOWN, e => {
			let event = new StandardKeyboardEvent(e as KeyboardEvent);
			let eventHandled = false;
			if (this.enabled && event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				this._onDidClick.fire(e);
				eventHandled = true;
			} else if (event.equals(KeyCode.Escape)) {
				this.$el.domBlur();
				eventHandled = true;
			}

			if (eventHandled) {
				DOM.EventHelper.stop(event, true);
			}
		});

		this.$el.on(DOM.EventType.MOUSE_OVER, e => {
			if (!this.$el.hasClass('disabled')) {
				this.setHoverBackground();
			}
		});

		this.$el.on(DOM.EventType.MOUSE_OUT, e => {
			this.applyStyles(); // restore standard styles
		});

		// Also set hover background when button is focused for feedback
		this.focusTracker = DOM.trackFocus(this.$el.getHTMLElement());
		this.focusTracker.onDidFocus(() => this.setHoverBackground());
		this.focusTracker.onDidBlur(() => this.applyStyles()); // restore standard styles

		this.applyStyles();
	}

	private setHoverBackground(): void {
		const hoverBackground = this.buttonHoverBackground ? this.buttonHoverBackground.toString() : null;
		if (hoverBackground) {
			this.$el.style('background-color', hoverBackground);
		}
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

	get element(): HTMLElement {
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

			this.focusTracker.dispose();
			this.focusTracker = null;
		}

		this._onDidClick.dispose();
	}
}

export class ButtonGroup {
	private _buttons: Button[];
	private toDispose: IDisposable[];

	constructor(container: Builder, count: number, options?: IButtonOptions);
	constructor(container: HTMLElement, count: number, options?: IButtonOptions);
	constructor(container: any, count: number, options?: IButtonOptions) {
		this._buttons = [];
		this.toDispose = [];

		this.create(container, count, options);
	}

	get buttons(): Button[] {
		return this._buttons;
	}

	private create(container: Builder, count: number, options?: IButtonOptions): void;
	private create(container: HTMLElement, count: number, options?: IButtonOptions): void;
	private create(container: any, count: number, options?: IButtonOptions): void {
		for (let index = 0; index < count; index++) {
			const button = new Button(container, options);
			this._buttons.push(button);
			this.toDispose.push(button);

			// Implement keyboard access in buttons if there are multiple
			if (count > 1) {
				$(button.element).on(DOM.EventType.KEY_DOWN, e => {
					const event = new StandardKeyboardEvent(e as KeyboardEvent);
					let eventHandled = true;

					// Next / Previous Button
					let buttonIndexToFocus: number;
					if (event.equals(KeyCode.LeftArrow)) {
						buttonIndexToFocus = index > 0 ? index - 1 : this._buttons.length - 1;
					} else if (event.equals(KeyCode.RightArrow)) {
						buttonIndexToFocus = index === this._buttons.length - 1 ? 0 : index + 1;
					} else {
						eventHandled = false;
					}

					if (eventHandled) {
						this._buttons[buttonIndexToFocus].focus();
						DOM.EventHelper.stop(e, true);
					}
				}, this.toDispose);
			}
		}
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}