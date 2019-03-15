/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./dialog';
import { Disposable } from 'vs/base/common/lifecycle';
import { $, hide, show, EventHelper, clearNode, removeClasses, addClass } from 'vs/base/browser/dom';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Color } from 'vs/base/common/color';
import { ButtonGroup } from 'vs/base/browser/ui/button/button';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';

export interface IDialogOptions {
	cancelId?: number;
	detail?: string;
	type?: 'none' | 'info' | 'error' | 'question' | 'warning';
}

export interface IDialogStyles {
	foregroundColor?: Color;
	backgroundColor?: Color;
}

export class Dialog extends Disposable {
	private element: HTMLElement | undefined;
	private buttonsContainer: HTMLElement | undefined;
	private iconElement: HTMLElement | undefined;
	private toolbarContainer: HTMLElement | undefined;

	constructor(private container: HTMLElement, private message: string, private buttons: string[], private options: IDialogOptions) {
		super();
		this.element = this.container.appendChild($('.dialog-box'));
		hide(this.element);

		const buttonsRowElement = this.element.appendChild($('.dialog-buttons-row'));
		this.buttonsContainer = buttonsRowElement.appendChild($('.dialog-buttons'));

		const messageRowElement = this.element.appendChild($('.dialog-message-row'));
		this.iconElement = messageRowElement.appendChild($('.dialog-icon'));
		const messageContainer = messageRowElement.appendChild($('.dialog-message-container'));
		const messageElement = messageContainer.appendChild($('.dialog-message'));
		messageElement.innerText = this.message;
		if (this.options.detail) {
			const messageDetailElement = messageContainer.appendChild($('.dialog-message-detail'));
			messageDetailElement.innerText = this.options.detail;
		}

		const toolbarRowElement = this.element.appendChild($('.dialog-toolbar-row'));
		this.toolbarContainer = toolbarRowElement.appendChild($('.dialog-toolbar'));
	}

	async show(): Promise<number> {
		return new Promise<number>((resolve) => {
			clearNode(this.buttonsContainer);
			const buttonGroup = new ButtonGroup(this.buttonsContainer, this.buttons.length, { title: true });
			buttonGroup.buttons.forEach((button, index) => {
				button.label = this.buttons[index];

				this._register(button.onDidClick(e => {
					EventHelper.stop(e);
					resolve(index);
				}));
			});

			this._register(domEvent(this.element, 'keydown', true)((e: KeyboardEvent) => {
				EventHelper.stop(e, true);
			}));

			this._register(domEvent(this.element, 'keyup', true)((e: KeyboardEvent) => {
				EventHelper.stop(e, true);
				const evt = new StandardKeyboardEvent(e);

				if (evt.equals(KeyCode.Escape)) {
					resolve(this.options.cancelId || 0);
				}
			}));

			removeClasses(this.iconElement, 'icon-error', 'icon-warning', 'icon-info');

			switch (this.options.type) {
				case 'error':
					addClass(this.iconElement, 'icon-error');
					break;
				case 'warning':
					addClass(this.iconElement, 'icon-warning');
					break;
				case 'none':
				case 'info':
				case 'question':
				default:
					addClass(this.iconElement, 'icon-info');
					break;
			}

			const actionBar = new ActionBar(this.toolbarContainer, {});

			const action = new Action('dialog.close', 'Close Dialog', 'dialog-close-action', true, () => {
				resolve(this.options.cancelId || 0);
				return Promise.resolve();
			});

			actionBar.push(action, { icon: true, label: false, });

			show(this.element);

			// Focus first element
			buttonGroup.buttons[0].focus();
		});
	}

	style(style: IDialogStyles): void {
		const fgColor = style.foregroundColor ? `${style.foregroundColor}` : null;
		const bgColor = style.backgroundColor ? `${style.backgroundColor}` : null;

		this.element.style.color = fgColor;
		this.element.style.backgroundColor = bgColor;
	}

	dispose(): void {
		super.dispose();
		hide(this.element);
	}
}