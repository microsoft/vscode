/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./button';
import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Color } from 'vs/base/common/color';
import { mixin } from 'vs/base/common/objects';
import { Event as BaseEvent, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Gesture } from 'vs/base/browser/touch';

export interface IButtonOptions extends IButtonStyles {
	title?: boolean;
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

export class Button extends Disposable {

	private $el: HTMLElement;
	private options: IButtonOptions;

	private buttonBackground: Color;
	private buttonHoverBackground: Color;
	private buttonForeground: Color;
	private buttonBorder: Color;

	private _onDidClick = this._register(new Emitter<any>());
	get onDidClick(): BaseEvent<Event> { return this._onDidClick.event; }

	private focusTracker: DOM.IFocusTracker;

	constructor(container: HTMLElement, options?: IButtonOptions) {
		super();

		this.options = options || Object.create(null);
		mixin(this.options, defaultOptions, false);

		this.buttonBackground = this.options.buttonBackground;
		this.buttonHoverBackground = this.options.buttonHoverBackground;
		this.buttonForeground = this.options.buttonForeground;
		this.buttonBorder = this.options.buttonBorder;

		this.$el = document.createElement('a');
		DOM.addClass(this.$el, 'monaco-button');
		this.$el.tabIndex = 0;
		this.$el.setAttribute('role', 'button');

		container.appendChild(this.$el);

		Gesture.addTarget(this.$el);

		this._register(DOM.addDisposableListener(this.$el, DOM.EventType.CLICK, e => {
			if (!this.enabled) {
				DOM.EventHelper.stop(e);
				return;
			}

			this._onDidClick.fire(e);
		}));

		this._register(DOM.addDisposableListener(this.$el, DOM.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e as KeyboardEvent);
			let eventHandled = false;
			if (this.enabled && event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				this._onDidClick.fire(e);
				eventHandled = true;
			} else if (event.equals(KeyCode.Escape)) {
				this.$el.blur();
				eventHandled = true;
			}

			if (eventHandled) {
				DOM.EventHelper.stop(event, true);
			}
		}));

		this._register(DOM.addDisposableListener(this.$el, DOM.EventType.MOUSE_OVER, e => {
			if (!DOM.hasClass(this.$el, 'disabled')) {
				this.setHoverBackground();
			}
		}));

		this._register(DOM.addDisposableListener(this.$el, DOM.EventType.MOUSE_OUT, e => {
			this.applyStyles(); // restore standard styles
		}));

		// Also set hover background when button is focused for feedback
		this.focusTracker = this._register(DOM.trackFocus(this.$el));
		this._register(this.focusTracker.onDidFocus(() => this.setHoverBackground()));
		this._register(this.focusTracker.onDidBlur(() => this.applyStyles())); // restore standard styles

		this.applyStyles();
	}

	private setHoverBackground(): void {
		const hoverBackground = this.buttonHoverBackground ? this.buttonHoverBackground.toString() : null;
		if (hoverBackground) {
			this.$el.style.backgroundColor = hoverBackground;
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

			this.$el.style.color = foreground;
			this.$el.style.backgroundColor = background;

			this.$el.style.borderWidth = border ? '1px' : null;
			this.$el.style.borderStyle = border ? 'solid' : null;
			this.$el.style.borderColor = border;
		}
	}

	get element(): HTMLElement {
		return this.$el;
	}

	set label(value: string) {
		if (!DOM.hasClass(this.$el, 'monaco-text-button')) {
			DOM.addClass(this.$el, 'monaco-text-button');
		}
		this.$el.innerText = value;
		if (this.options.title) {
			this.$el.title = value;
		}
	}

	set icon(iconClassName: string) {
		DOM.addClass(this.$el, iconClassName);
	}

	set enabled(value: boolean) {
		if (value) {
			DOM.removeClass(this.$el, 'disabled');
			this.$el.setAttribute('aria-disabled', String(false));
			this.$el.tabIndex = 0;
		} else {
			DOM.addClass(this.$el, 'disabled');
			this.$el.setAttribute('aria-disabled', String(true));
			DOM.removeTabIndexAndUpdateFocus(this.$el);
		}
	}

	get enabled() {
		return !DOM.hasClass(this.$el, 'disabled');
	}

	focus(): void {
		this.$el.focus();
	}
}

export class ButtonGroup extends Disposable {
	private _buttons: Button[] = [];

	constructor(container: HTMLElement, count: number, options?: IButtonOptions) {
		super();

		this.create(container, count, options);
	}

	get buttons(): Button[] {
		return this._buttons;
	}

	private create(container: HTMLElement, count: number, options?: IButtonOptions): void {
		for (let index = 0; index < count; index++) {
			const button = this._register(new Button(container, options));
			this._buttons.push(button);

			// Implement keyboard access in buttons if there are multiple
			if (count > 1) {
				this._register(DOM.addDisposableListener(button.element, DOM.EventType.KEY_DOWN, e => {
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

				}));
			}
		}
	}
}