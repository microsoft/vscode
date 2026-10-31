/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditableData } from '../../../common/views.js';

export interface IInlineEditInputBoxOptions {
	/**
	 * The aria label of the input box.
	 */
	readonly ariaLabel: string;

	/**
	 * The initial value of the input box. Defaults to {@link IEditableData.startingValue}.
	 */
	readonly value?: string;

	/**
	 * The initially selected range of the value. Defaults to the whole value.
	 */
	readonly selection?: { readonly start: number; readonly end: number };
}

/**
 * An input box for editing an item inline, for example to rename an item of a list or tree.
 *
 * Errors reported by {@link IEditableData.validationMessage} block accepting the value, other
 * messages are shown as information. Pressing Enter accepts the value, pressing Escape cancels
 * editing and moving focus elsewhere accepts the value if it is valid. Losing window focus
 * (for example via Alt+Tab or an OS input-source switcher) keeps editing while the input remains
 * the active element of its document.
 *
 * Once editing finishes the input box is removed and {@link IEditableData.onFinish} is called.
 * Disposing the input box before editing finishes removes it without calling `onFinish`.
 */
export class InlineEditInputBox extends Disposable {

	readonly inputBox: InputBox;

	constructor(
		container: HTMLElement,
		private readonly _editableData: IEditableData,
		options: IInlineEditInputBoxOptions,
		@IContextViewService contextViewService: IContextViewService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super();

		const inputBox = this.inputBox = this._register(new InputBox(container, contextViewService, {
			validationOptions: {
				validation: value => {
					const message = _editableData.validationMessage(value);
					if (!message || message.severity !== Severity.Error) {
						return null;
					}

					return {
						content: message.content,
						formatContent: true,
						type: MessageType.ERROR
					};
				}
			},
			ariaLabel: options.ariaLabel,
			placeholder: _editableData.placeholder ?? undefined,
			inputBoxStyles: defaultInputBoxStyles,
		}));

		const value = options.value ?? _editableData.startingValue ?? '';
		inputBox.value = value;
		inputBox.focus();
		inputBox.select(options.selection ?? { start: 0, end: value.length });

		this._showMessage();

		// Enter and Escape are handled here and must not trigger keybindings of the containing view
		this._register(DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				e.stopPropagation();
				if (!inputBox.validate()) {
					this._finish(true);
				}
			} else if (e.equals(KeyCode.Escape)) {
				e.preventDefault();
				e.stopPropagation();
				this._finish(false);
			}
		}));

		// Refresh non-error messages on every value change, including paste, drop and IME input. This listener
		// is registered after the input box's own one so it runs after validation, which may hide the message.
		this._register(DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.INPUT, () => {
			this._showMessage();
		}));

		this._register(DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, async () => {
			while (true) {
				await timeout(0);
				if (this._store.isDisposed) {
					return;
				}

				const ownerDocument = inputBox.inputElement.ownerDocument;
				if (DOM.isHTMLElement(ownerDocument.activeElement) && DOM.hasParentWithClass(ownerDocument.activeElement, 'context-view')) {
					// Keep editing while a context menu of the input box is open
					await Event.toPromise(this._contextMenuService.onDidHideContextMenu, this._store);
				} else if (ownerDocument.activeElement === inputBox.inputElement) {
					if (ownerDocument.hasFocus()) {
						return;
					}
					// The window lost focus without moving DOM focus, e.g. a compositor grab. Blur is not dispatched
					// for focus changes while the window is unfocused, so check again once the window regains focus.
					await Event.toPromise(Event.fromDOMEventEmitter(DOM.getWindow(inputBox.inputElement), DOM.EventType.FOCUS), this._store);
				} else {
					break;
				}
			}

			this._finish(inputBox.isInputValid());
		}));
	}

	/**
	 * Shows non-error validation messages, errors are shown by the input box validation.
	 */
	private _showMessage(): void {
		if (!this.inputBox.isInputValid()) {
			return;
		}

		const message = this._editableData.validationMessage(this.inputBox.value);
		if (message) {
			this.inputBox.showMessage({
				content: message.content,
				formatContent: true,
				type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
			});
		} else {
			this.inputBox.hideMessage();
		}
	}

	private _finish(success: boolean): void {
		if (this._store.isDisposed) {
			return;
		}

		const value = this.inputBox.value;
		this.dispose();
		this._editableData.onFinish(value, success);
	}

	override dispose(): void {
		const element = this.inputBox.element;
		element.style.display = 'none';
		super.dispose();
		element.remove();
	}
}
