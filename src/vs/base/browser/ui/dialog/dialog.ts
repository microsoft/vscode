/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./dialog';
import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { $, hide, show, EventHelper, clearNode, removeClasses, addClass, removeNode, isAncestor } from 'vs/base/browser/dom';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Color } from 'vs/base/common/color';
import { ButtonGroup, IButtonStyles } from 'vs/base/browser/ui/button/button';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import { SimpleCheckbox, ISimpleCheckboxStyles } from 'vs/base/browser/ui/checkbox/checkbox';

export interface IDialogOptions {
	cancelId?: number;
	detail?: string;
	checkboxLabel?: string;
	checkboxChecked?: boolean;
	type?: 'none' | 'info' | 'error' | 'question' | 'warning' | 'pending';
	keyEventProcessor?: (event: StandardKeyboardEvent) => void;
}

export interface IDialogResult {
	button: number;
	checkboxChecked?: boolean;
}

export interface IDialogStyles extends IButtonStyles, ISimpleCheckboxStyles {
	dialogForeground?: Color;
	dialogBackground?: Color;
	dialogShadow?: Color;
	dialogBorder?: Color;
}

interface ButtonMapEntry {
	label: string;
	index: number;
}

export class Dialog extends Disposable {
	private element: HTMLElement | undefined;
	private modal: HTMLElement | undefined;
	private buttonsContainer: HTMLElement | undefined;
	private messageDetailElement: HTMLElement | undefined;
	private iconElement: HTMLElement | undefined;
	private checkbox: SimpleCheckbox | undefined;
	private toolbarContainer: HTMLElement | undefined;
	private buttonGroup: ButtonGroup | undefined;
	private styles: IDialogStyles | undefined;
	private focusToReturn: HTMLElement | undefined;

	constructor(private container: HTMLElement, private message: string, private buttons: string[], private options: IDialogOptions) {
		super();
		this.modal = this.container.appendChild($(`.dialog-modal-block${options.type === 'pending' ? '.dimmed' : ''}`));
		this.element = this.modal.appendChild($('.dialog-box'));
		hide(this.element);

		const buttonsRowElement = this.element.appendChild($('.dialog-buttons-row'));
		this.buttonsContainer = buttonsRowElement.appendChild($('.dialog-buttons'));

		const messageRowElement = this.element.appendChild($('.dialog-message-row'));
		this.iconElement = messageRowElement.appendChild($('.dialog-icon'));
		const messageContainer = messageRowElement.appendChild($('.dialog-message-container'));

		if (this.options.detail) {
			const messageElement = messageContainer.appendChild($('.dialog-message'));
			messageElement.innerText = this.message;
		}

		this.messageDetailElement = messageContainer.appendChild($('.dialog-message-detail'));
		this.messageDetailElement.innerText = this.options.detail ? this.options.detail : message;

		if (this.options.checkboxLabel) {
			const checkboxRowElement = messageContainer.appendChild($('.dialog-checkbox-row'));

			this.checkbox = this._register(new SimpleCheckbox(this.options.checkboxLabel, !!this.options.checkboxChecked));

			checkboxRowElement.appendChild(this.checkbox.domNode);

			const checkboxMessageElement = checkboxRowElement.appendChild($('.dialog-checkbox-message'));
			checkboxMessageElement.innerText = this.options.checkboxLabel;
		}



		const toolbarRowElement = this.element.appendChild($('.dialog-toolbar-row'));
		this.toolbarContainer = toolbarRowElement.appendChild($('.dialog-toolbar'));
	}

	updateMessage(message: string): void {
		if (this.messageDetailElement) {
			this.messageDetailElement.innerText = message;
		}
	}

	async show(): Promise<IDialogResult> {
		this.focusToReturn = document.activeElement as HTMLElement;

		return new Promise<IDialogResult>((resolve) => {
			if (!this.element || !this.buttonsContainer || !this.iconElement || !this.toolbarContainer) {
				resolve({ button: 0 });
				return;
			}

			if (this.modal) {
				this._register(domEvent(this.modal, 'mousedown')(e => {
					// Used to stop focusing of modal with mouse
					EventHelper.stop(e, true);
				}));
			}

			clearNode(this.buttonsContainer);

			let focusedButton = 0;
			const buttonGroup = this.buttonGroup = new ButtonGroup(this.buttonsContainer, this.buttons.length, { title: true });
			const buttonMap = this.rearrangeButtons(this.buttons, this.options.cancelId);

			// Set focused button to UI index
			buttonMap.forEach((value, index) => {
				if (value.index === 0) {
					focusedButton = index;
				}
			});

			buttonGroup.buttons.forEach((button, index) => {
				button.label = mnemonicButtonLabel(buttonMap[index].label, true);

				this._register(button.onDidClick(e => {
					EventHelper.stop(e);
					resolve({ button: buttonMap[index].index, checkboxChecked: this.checkbox ? this.checkbox.checked : undefined });
				}));
			});

			this._register(domEvent(window, 'keydown', true)((e: KeyboardEvent) => {
				const evt = new StandardKeyboardEvent(e);
				if (evt.equals(KeyCode.Enter) || evt.equals(KeyCode.Space)) {
					return;
				}

				let eventHandled = false;
				if (evt.equals(KeyMod.Shift | KeyCode.Tab) || evt.equals(KeyCode.LeftArrow)) {
					focusedButton = focusedButton + buttonGroup.buttons.length - 1;
					focusedButton = focusedButton % buttonGroup.buttons.length;
					buttonGroup.buttons[focusedButton].focus();
					eventHandled = true;
				} else if (evt.equals(KeyCode.Tab) || evt.equals(KeyCode.RightArrow)) {
					focusedButton++;
					focusedButton = focusedButton % buttonGroup.buttons.length;
					buttonGroup.buttons[focusedButton].focus();
					eventHandled = true;
				}

				if (eventHandled) {
					EventHelper.stop(e, true);
				} else if (this.options.keyEventProcessor) {
					this.options.keyEventProcessor(evt);
				}
			}));

			this._register(domEvent(window, 'keyup', true)((e: KeyboardEvent) => {
				EventHelper.stop(e, true);
				const evt = new StandardKeyboardEvent(e);

				if (evt.equals(KeyCode.Escape)) {
					resolve({ button: this.options.cancelId || 0, checkboxChecked: this.checkbox ? this.checkbox.checked : undefined });
				}
			}));

			this._register(domEvent(this.element, 'focusout', false)((e: FocusEvent) => {
				if (!!e.relatedTarget && !!this.element) {
					if (!isAncestor(e.relatedTarget as HTMLElement, this.element)) {
						this.focusToReturn = e.relatedTarget as HTMLElement;

						if (e.target) {
							(e.target as HTMLElement).focus();
							EventHelper.stop(e, true);
						}
					}
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
				case 'pending':
					addClass(this.iconElement, 'icon-pending');
					break;
				case 'none':
				case 'info':
				case 'question':
				default:
					addClass(this.iconElement, 'icon-info');
					break;
			}

			const actionBar = new ActionBar(this.toolbarContainer, {});

			const action = new Action('dialog.close', nls.localize('dialogClose', "Close Dialog"), 'dialog-close-action', true, () => {
				resolve({ button: this.options.cancelId || 0, checkboxChecked: this.checkbox ? this.checkbox.checked : undefined });
				return Promise.resolve();
			});

			actionBar.push(action, { icon: true, label: false, });

			this.applyStyles();

			this.element.setAttribute('aria-label', this.message);
			show(this.element);

			// Focus first element
			buttonGroup.buttons[focusedButton].focus();
		});
	}

	private applyStyles() {
		if (this.styles) {
			const style = this.styles;

			const fgColor = style.dialogForeground ? `${style.dialogForeground}` : null;
			const bgColor = style.dialogBackground ? `${style.dialogBackground}` : null;
			const shadowColor = style.dialogShadow ? `0 0px 8px ${style.dialogShadow}` : null;
			const border = style.dialogBorder ? `1px solid ${style.dialogBorder}` : null;

			if (this.element) {
				this.element.style.color = fgColor;
				this.element.style.backgroundColor = bgColor;
				this.element.style.boxShadow = shadowColor;
				this.element.style.border = border;

				if (this.buttonGroup) {
					this.buttonGroup.buttons.forEach(button => button.style(style));
				}

				if (this.checkbox) {
					this.checkbox.style(style);
				}
			}
		}
	}

	style(style: IDialogStyles): void {
		this.styles = style;
		this.applyStyles();
	}

	dispose(): void {
		super.dispose();
		if (this.modal) {
			removeNode(this.modal);
			this.modal = undefined;
		}

		if (this.focusToReturn && isAncestor(this.focusToReturn, document.body)) {
			this.focusToReturn.focus();
			this.focusToReturn = undefined;
		}
	}

	private rearrangeButtons(buttons: Array<string>, cancelId: number | undefined): ButtonMapEntry[] {
		const buttonMap: ButtonMapEntry[] = [];
		// Maps each button to its current label and old index so that when we move them around it's not a problem
		buttons.forEach((button, index) => {
			buttonMap.push({ label: button, index: index });
		});

		// macOS/linux: reverse button order
		if (isMacintosh || isLinux) {
			if (cancelId !== undefined) {
				const cancelButton = buttonMap.splice(cancelId, 1)[0];
				buttonMap.reverse();
				buttonMap.splice(buttonMap.length - 1, 0, cancelButton);
			}
		}

		return buttonMap;
	}
}
