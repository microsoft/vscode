/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, clearNode, EventHelper, EventType, getWindow, hide, isActiveElement, isAncestor, show } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ButtonBar, ButtonWithDescription, IButtonStyles } from 'vs/base/browser/ui/button/button';
import { ICheckboxStyles, Checkbox } from 'vs/base/browser/ui/toggle/toggle';
import { IInputBoxStyles, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { Disposable } from 'vs/base/common/lifecycle';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import 'vs/css!./dialog';
import * as nls from 'vs/nls';

export interface IDialogInputOptions {
	readonly placeholder?: string;
	readonly type?: 'text' | 'password';
	readonly value?: string;
}

export interface IDialogOptions {
	readonly cancelId?: number;
	readonly detail?: string;
	readonly checkboxLabel?: string;
	readonly checkboxChecked?: boolean;
	readonly type?: 'none' | 'info' | 'error' | 'question' | 'warning' | 'pending';
	readonly inputs?: IDialogInputOptions[];
	readonly keyEventProcessor?: (event: StandardKeyboardEvent) => void;
	readonly renderBody?: (container: HTMLElement) => void;
	readonly icon?: ThemeIcon;
	readonly buttonDetails?: string[];
	readonly disableCloseAction?: boolean;
	readonly disableDefaultAction?: boolean;
	readonly buttonStyles: IButtonStyles;
	readonly checkboxStyles: ICheckboxStyles;
	readonly inputBoxStyles: IInputBoxStyles;
	readonly dialogStyles: IDialogStyles;
}

export interface IDialogResult {
	readonly button: number;
	readonly checkboxChecked?: boolean;
	readonly values?: string[];
}

export interface IDialogStyles {
	readonly dialogForeground: string | undefined;
	readonly dialogBackground: string | undefined;
	readonly dialogShadow: string | undefined;
	readonly dialogBorder: string | undefined;
	readonly errorIconForeground: string | undefined;
	readonly warningIconForeground: string | undefined;
	readonly infoIconForeground: string | undefined;
	readonly textLinkForeground: string | undefined;
}

interface ButtonMapEntry {
	readonly label: string;
	readonly index: number;
}

export class Dialog extends Disposable {
	private readonly element: HTMLElement;
	private readonly shadowElement: HTMLElement;
	private modalElement: HTMLElement | undefined;
	private readonly buttonsContainer: HTMLElement;
	private readonly messageDetailElement: HTMLElement;
	private readonly messageContainer: HTMLElement;
	private readonly iconElement: HTMLElement;
	private readonly checkbox: Checkbox | undefined;
	private readonly toolbarContainer: HTMLElement;
	private buttonBar: ButtonBar | undefined;
	private focusToReturn: HTMLElement | undefined;
	private readonly inputs: InputBox[];
	private readonly buttons: string[];
	private readonly buttonStyles: IButtonStyles;

	constructor(private container: HTMLElement, private message: string, buttons: string[] | undefined, private readonly options: IDialogOptions) {
		super();

		this.modalElement = this.container.appendChild($(`.monaco-dialog-modal-block.dimmed`));
		this.shadowElement = this.modalElement.appendChild($('.dialog-shadow'));
		this.element = this.shadowElement.appendChild($('.monaco-dialog-box'));
		this.element.setAttribute('role', 'dialog');
		this.element.tabIndex = -1;
		hide(this.element);

		this.buttonStyles = options.buttonStyles;

		if (Array.isArray(buttons) && buttons.length > 0) {
			this.buttons = buttons;
		} else if (!this.options.disableDefaultAction) {
			this.buttons = [nls.localize('ok', "OK")];
		} else {
			this.buttons = [];
		}
		const buttonsRowElement = this.element.appendChild($('.dialog-buttons-row'));
		this.buttonsContainer = buttonsRowElement.appendChild($('.dialog-buttons'));

		const messageRowElement = this.element.appendChild($('.dialog-message-row'));
		this.iconElement = messageRowElement.appendChild($('#monaco-dialog-icon.dialog-icon'));
		this.iconElement.setAttribute('aria-label', this.getIconAriaLabel());
		this.messageContainer = messageRowElement.appendChild($('.dialog-message-container'));

		if (this.options.detail || this.options.renderBody) {
			const messageElement = this.messageContainer.appendChild($('.dialog-message'));
			const messageTextElement = messageElement.appendChild($('#monaco-dialog-message-text.dialog-message-text'));
			messageTextElement.innerText = this.message;
		}

		this.messageDetailElement = this.messageContainer.appendChild($('#monaco-dialog-message-detail.dialog-message-detail'));
		if (this.options.detail || !this.options.renderBody) {
			this.messageDetailElement.innerText = this.options.detail ? this.options.detail : message;
		} else {
			this.messageDetailElement.style.display = 'none';
		}

		if (this.options.renderBody) {
			const customBody = this.messageContainer.appendChild($('#monaco-dialog-message-body.dialog-message-body'));
			this.options.renderBody(customBody);

			for (const el of this.messageContainer.querySelectorAll('a')) {
				el.tabIndex = 0;
			}
		}

		if (this.options.inputs) {
			this.inputs = this.options.inputs.map(input => {
				const inputRowElement = this.messageContainer.appendChild($('.dialog-message-input'));

				const inputBox = this._register(new InputBox(inputRowElement, undefined, {
					placeholder: input.placeholder,
					type: input.type ?? 'text',
					inputBoxStyles: options.inputBoxStyles
				}));

				if (input.value) {
					inputBox.value = input.value;
				}

				return inputBox;
			});
		} else {
			this.inputs = [];
		}

		if (this.options.checkboxLabel) {
			const checkboxRowElement = this.messageContainer.appendChild($('.dialog-checkbox-row'));

			const checkbox = this.checkbox = this._register(
				new Checkbox(this.options.checkboxLabel, !!this.options.checkboxChecked, options.checkboxStyles)
			);

			checkboxRowElement.appendChild(checkbox.domNode);

			const checkboxMessageElement = checkboxRowElement.appendChild($('.dialog-checkbox-message'));
			checkboxMessageElement.innerText = this.options.checkboxLabel;
			this._register(addDisposableListener(checkboxMessageElement, EventType.CLICK, () => checkbox.checked = !checkbox.checked));
		}

		const toolbarRowElement = this.element.appendChild($('.dialog-toolbar-row'));
		this.toolbarContainer = toolbarRowElement.appendChild($('.dialog-toolbar'));

		this.applyStyles();
	}

	private getIconAriaLabel(): string {
		let typeLabel = nls.localize('dialogInfoMessage', 'Info');
		switch (this.options.type) {
			case 'error':
				typeLabel = nls.localize('dialogErrorMessage', 'Error');
				break;
			case 'warning':
				typeLabel = nls.localize('dialogWarningMessage', 'Warning');
				break;
			case 'pending':
				typeLabel = nls.localize('dialogPendingMessage', 'In Progress');
				break;
			case 'none':
			case 'info':
			case 'question':
			default:
				break;
		}

		return typeLabel;
	}

	updateMessage(message: string): void {
		this.messageDetailElement.innerText = message;
	}

	async show(): Promise<IDialogResult> {
		this.focusToReturn = this.container.ownerDocument.activeElement as HTMLElement;

		return new Promise<IDialogResult>((resolve) => {
			clearNode(this.buttonsContainer);

			const buttonBar = this.buttonBar = this._register(new ButtonBar(this.buttonsContainer));
			const buttonMap = this.rearrangeButtons(this.buttons, this.options.cancelId);

			// Handle button clicks
			buttonMap.forEach((entry, index) => {
				const primary = buttonMap[index].index === 0;
				const button = this.options.buttonDetails ? this._register(buttonBar.addButtonWithDescription({ secondary: !primary, ...this.buttonStyles })) : this._register(buttonBar.addButton({ secondary: !primary, ...this.buttonStyles }));
				button.label = mnemonicButtonLabel(buttonMap[index].label, true);
				if (button instanceof ButtonWithDescription) {
					button.description = this.options.buttonDetails![buttonMap[index].index];
				}
				this._register(button.onDidClick(e => {
					if (e) {
						EventHelper.stop(e);
					}

					resolve({
						button: buttonMap[index].index,
						checkboxChecked: this.checkbox ? this.checkbox.checked : undefined,
						values: this.inputs.length > 0 ? this.inputs.map(input => input.value) : undefined
					});
				}));
			});

			// Handle keyboard events globally: Tab, Arrow-Left/Right
			const window = getWindow(this.container);
			this._register(addDisposableListener(window, 'keydown', e => {
				const evt = new StandardKeyboardEvent(e);

				if (evt.equals(KeyMod.Alt)) {
					evt.preventDefault();
				}

				if (evt.equals(KeyCode.Enter)) {

					// Enter in input field should OK the dialog
					if (this.inputs.some(input => input.hasFocus())) {
						EventHelper.stop(e);

						resolve({
							button: buttonMap.find(button => button.index !== this.options.cancelId)?.index ?? 0,
							checkboxChecked: this.checkbox ? this.checkbox.checked : undefined,
							values: this.inputs.length > 0 ? this.inputs.map(input => input.value) : undefined
						});
					}

					return; // leave default handling
				}

				if (evt.equals(KeyCode.Space)) {
					return; // leave default handling
				}

				let eventHandled = false;

				// Focus: Next / Previous
				if (evt.equals(KeyCode.Tab) || evt.equals(KeyCode.RightArrow) || evt.equals(KeyMod.Shift | KeyCode.Tab) || evt.equals(KeyCode.LeftArrow)) {

					// Build a list of focusable elements in their visual order
					const focusableElements: { focus: () => void }[] = [];
					let focusedIndex = -1;

					if (this.messageContainer) {
						const links = this.messageContainer.querySelectorAll('a');
						for (const link of links) {
							focusableElements.push(link);
							if (isActiveElement(link)) {
								focusedIndex = focusableElements.length - 1;
							}
						}
					}

					for (const input of this.inputs) {
						focusableElements.push(input);
						if (input.hasFocus()) {
							focusedIndex = focusableElements.length - 1;
						}
					}

					if (this.checkbox) {
						focusableElements.push(this.checkbox);
						if (this.checkbox.hasFocus()) {
							focusedIndex = focusableElements.length - 1;
						}
					}

					if (this.buttonBar) {
						for (const button of this.buttonBar.buttons) {
							focusableElements.push(button);
							if (button.hasFocus()) {
								focusedIndex = focusableElements.length - 1;
							}
						}
					}

					// Focus next element (with wrapping)
					if (evt.equals(KeyCode.Tab) || evt.equals(KeyCode.RightArrow)) {
						if (focusedIndex === -1) {
							focusedIndex = 0; // default to focus first element if none have focus
						}

						const newFocusedIndex = (focusedIndex + 1) % focusableElements.length;
						focusableElements[newFocusedIndex].focus();
					}

					// Focus previous element (with wrapping)
					else {
						if (focusedIndex === -1) {
							focusedIndex = focusableElements.length; // default to focus last element if none have focus
						}

						let newFocusedIndex = focusedIndex - 1;
						if (newFocusedIndex === -1) {
							newFocusedIndex = focusableElements.length - 1;
						}

						focusableElements[newFocusedIndex].focus();
					}

					eventHandled = true;
				}

				if (eventHandled) {
					EventHelper.stop(e, true);
				} else if (this.options.keyEventProcessor) {
					this.options.keyEventProcessor(evt);
				}
			}, true));

			this._register(addDisposableListener(window, 'keyup', e => {
				EventHelper.stop(e, true);
				const evt = new StandardKeyboardEvent(e);

				if (!this.options.disableCloseAction && evt.equals(KeyCode.Escape)) {
					resolve({
						button: this.options.cancelId || 0,
						checkboxChecked: this.checkbox ? this.checkbox.checked : undefined
					});
				}
			}, true));

			// Detect focus out
			this._register(addDisposableListener(this.element, 'focusout', e => {
				if (!!e.relatedTarget && !!this.element) {
					if (!isAncestor(e.relatedTarget as HTMLElement, this.element)) {
						this.focusToReturn = e.relatedTarget as HTMLElement;

						if (e.target) {
							(e.target as HTMLElement).focus();
							EventHelper.stop(e, true);
						}
					}
				}
			}, false));

			const spinModifierClassName = 'codicon-modifier-spin';

			this.iconElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.dialogError), ...ThemeIcon.asClassNameArray(Codicon.dialogWarning), ...ThemeIcon.asClassNameArray(Codicon.dialogInfo), ...ThemeIcon.asClassNameArray(Codicon.loading), spinModifierClassName);

			if (this.options.icon) {
				this.iconElement.classList.add(...ThemeIcon.asClassNameArray(this.options.icon));
			} else {
				switch (this.options.type) {
					case 'error':
						this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogError));
						break;
					case 'warning':
						this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogWarning));
						break;
					case 'pending':
						this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), spinModifierClassName);
						break;
					case 'none':
						this.iconElement.classList.add('no-codicon');
						break;
					case 'info':
					case 'question':
					default:
						this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogInfo));
						break;
				}
			}


			if (!this.options.disableCloseAction) {
				const actionBar = this._register(new ActionBar(this.toolbarContainer, {}));

				const action = this._register(new Action('dialog.close', nls.localize('dialogClose', "Close Dialog"), ThemeIcon.asClassName(Codicon.dialogClose), true, async () => {
					resolve({
						button: this.options.cancelId || 0,
						checkboxChecked: this.checkbox ? this.checkbox.checked : undefined
					});
				}));

				actionBar.push(action, { icon: true, label: false });
			}

			this.applyStyles();

			this.element.setAttribute('aria-modal', 'true');
			this.element.setAttribute('aria-labelledby', 'monaco-dialog-icon monaco-dialog-message-text');
			this.element.setAttribute('aria-describedby', 'monaco-dialog-icon monaco-dialog-message-text monaco-dialog-message-detail monaco-dialog-message-body');
			show(this.element);

			// Focus first element (input or button)
			if (this.inputs.length > 0) {
				this.inputs[0].focus();
				this.inputs[0].select();
			} else {
				buttonMap.forEach((value, index) => {
					if (value.index === 0) {
						buttonBar.buttons[index].focus();
					}
				});
			}
		});
	}

	private applyStyles() {
		const style = this.options.dialogStyles;

		const fgColor = style.dialogForeground;
		const bgColor = style.dialogBackground;
		const shadowColor = style.dialogShadow ? `0 0px 8px ${style.dialogShadow}` : '';
		const border = style.dialogBorder ? `1px solid ${style.dialogBorder}` : '';
		const linkFgColor = style.textLinkForeground;

		this.shadowElement.style.boxShadow = shadowColor;

		this.element.style.color = fgColor ?? '';
		this.element.style.backgroundColor = bgColor ?? '';
		this.element.style.border = border;

		// TODO fix
		// if (fgColor && bgColor) {
		// 	const messageDetailColor = fgColor.transparent(.9);
		// 	this.messageDetailElement.style.mixBlendMode = messageDetailColor.makeOpaque(bgColor).toString();
		// }

		if (linkFgColor) {
			for (const el of this.messageContainer.getElementsByTagName('a')) {
				el.style.color = linkFgColor;
			}
		}

		let color;
		switch (this.options.type) {
			case 'error':
				color = style.errorIconForeground;
				break;
			case 'warning':
				color = style.warningIconForeground;
				break;
			default:
				color = style.infoIconForeground;
				break;
		}
		if (color) {
			this.iconElement.style.color = color;
		}
	}

	override dispose(): void {
		super.dispose();

		if (this.modalElement) {
			this.modalElement.remove();
			this.modalElement = undefined;
		}

		if (this.focusToReturn && isAncestor(this.focusToReturn, this.container.ownerDocument.body)) {
			this.focusToReturn.focus();
			this.focusToReturn = undefined;
		}
	}

	private rearrangeButtons(buttons: Array<string>, cancelId: number | undefined): ButtonMapEntry[] {

		// Maps each button to its current label and old index
		// so that when we move them around it's not a problem
		const buttonMap: ButtonMapEntry[] = buttons.map((label, index) => ({ label, index }));

		if (buttons.length < 2) {
			return buttonMap; // only need to rearrange if there are 2+ buttons
		}

		if (isMacintosh || isLinux) {

			// Linux: the GNOME HIG (https://developer.gnome.org/hig/patterns/feedback/dialogs.html?highlight=dialog)
			// recommend the following:
			// "Always ensure that the cancel button appears first, before the affirmative button. In left-to-right
			//  locales, this is on the left. This button order ensures that users become aware of, and are reminded
			//  of, the ability to cancel prior to encountering the affirmative button."

			// macOS: the HIG (https://developer.apple.com/design/human-interface-guidelines/components/presentation/alerts)
			// recommend the following:
			// "Place buttons where people expect. In general, place the button people are most likely to choose on the trailing side in a
			//  row of buttons or at the top in a stack of buttons. Always place the default button on the trailing side of a row or at the
			//  top of a stack. Cancel buttons are typically on the leading side of a row or at the bottom of a stack."

			if (typeof cancelId === 'number' && buttonMap[cancelId]) {
				const cancelButton = buttonMap.splice(cancelId, 1)[0];
				buttonMap.splice(1, 0, cancelButton);
			}

			buttonMap.reverse();
		} else if (isWindows) {

			// Windows: the HIG (https://learn.microsoft.com/en-us/windows/win32/uxguide/win-dialog-box)
			// recommend the following:
			// "One of the following sets of concise commands: Yes/No, Yes/No/Cancel, [Do it]/Cancel,
			//  [Do it]/[Don't do it], [Do it]/[Don't do it]/Cancel."

			if (typeof cancelId === 'number' && buttonMap[cancelId]) {
				const cancelButton = buttonMap.splice(cancelId, 1)[0];
				buttonMap.push(cancelButton);
			}
		}

		return buttonMap;
	}
}
