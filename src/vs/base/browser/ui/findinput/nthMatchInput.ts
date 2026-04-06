/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import { IKeyboardEvent } from '../../keyboardEvent.js';
import { IMouseEvent } from '../../mouseEvent.js';
import { IToggleStyles } from '../toggle/toggle.js';
import { IContextViewProvider } from '../contextview/contextview.js';
import { InputBox, IInputBoxStyles, IInputValidator, IMessage as InputBoxMessage } from '../inputbox/inputBox.js';
import { Widget } from '../widget.js';
import { Emitter, Event } from '../../../common/event.js';
import { KeyCode } from '../../../common/keyCodes.js';
import './nthMatchInput.css';
import * as nls from '../../../../nls.js';

export interface INthMatchInputOptions {
	readonly placeholder?: string;
	readonly width?: number;
	readonly validation?: IInputValidator;
	readonly label: string;
	readonly type: 'text';
	readonly min?: number;
	readonly max?: number;
	readonly lastMatchLocation?: number;
	readonly flexibleHeight?: boolean;
	readonly flexibleWidth?: boolean;
	readonly flexibleMaxHeight?: number;

	readonly showCommonFindToggles?: boolean;
	readonly toggleStyles: IToggleStyles;
	readonly inputBoxStyles: IInputBoxStyles;
}

export interface IStepEvent {
	direction: 'up' | 'down';
}

export interface IJumpEvent {
	targetMatchPos: number;
}

const NLS_DEFAULT_LABEL = nls.localize('defaultLabel', "input");

export class NthMatchInput extends Widget {

	private placeholder: string;
	// private validation?: IInputValidator;
	private label: string;
	private type: string;
	private imeSessionInProgress = false;

	public readonly domNode: HTMLElement;
	public readonly inputBox: InputBox;
	public lastMatchLocation: number;
	public min: number;
	public max: number;

	private readonly _onDidOptionChange = this._register(new Emitter<boolean>());
	public readonly onDidOptionChange: Event<boolean /* via keyboard */> = this._onDidOptionChange.event;

	private readonly _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _onMouseDown = this._register(new Emitter<IMouseEvent>());
	public readonly onMouseDown: Event<IMouseEvent> = this._onMouseDown.event;

	private readonly _onInput = this._register(new Emitter<void>());
	public readonly onInput: Event<void> = this._onInput.event;

	private readonly _onKeyUp = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private readonly _onStep = this._register(new Emitter<IStepEvent>());
	public readonly onStep: Event<IStepEvent> = this._onStep.event;

	private readonly _onJump = this._register(new Emitter<IJumpEvent>());
	public readonly onJump: Event<IJumpEvent> = this._onJump.event;

	constructor(parent: HTMLElement | null, contextViewProvider: IContextViewProvider | undefined, options: INthMatchInputOptions) {
		super();
		this.placeholder = options.placeholder || '';
		// this.validation = options.validation;
		this.label = options.label || NLS_DEFAULT_LABEL;
		this.type = options.type || 'text';
		this.min = options.min || 0;
		this.max = options.max || 0;
		this.lastMatchLocation = options.lastMatchLocation || 0;
		const flexibleHeight = !!options.flexibleHeight;
		const flexibleWidth = !!options.flexibleWidth;
		const flexibleMaxHeight = options.flexibleMaxHeight;

		this.domNode = document.createElement('div');
		this.domNode.classList.add('monaco-findInput');

		this.inputBox = this._register(new InputBox(this.domNode, contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.label || '',
			flexibleHeight,
			flexibleWidth,
			flexibleMaxHeight,
			inputBoxStyles: options.inputBoxStyles,
			type: this.type
		}));

		this.onkeydown(this.domNode, (event: IKeyboardEvent) => {
			const currentValueAsInt = parseInt(this.inputBox.value);

			// Arrow-Key support to step the match position up or down
			if (event.equals(KeyCode.UpArrow)) {
				this._onStep.fire({ direction: 'down' });
			}
			else if (event.equals(KeyCode.DownArrow)) {
				this._onStep.fire({ direction: 'up' });
			}
			else if (event.equals(KeyCode.Enter)) {
				this._onJump.fire({ targetMatchPos: currentValueAsInt });
			}

		});

		parent?.appendChild(this.domNode);

		this._register(dom.addDisposableListener(this.inputBox.inputElement, 'compositionstart', (e: CompositionEvent) => {
			this.imeSessionInProgress = true;
		}));
		this._register(dom.addDisposableListener(this.inputBox.inputElement, 'compositionend', (e: CompositionEvent) => {
			this.imeSessionInProgress = false;
			this._onInput.fire();
		}));

		this.onkeydown(this.inputBox.inputElement, (e) => this._onKeyDown.fire(e));
		this.onkeyup(this.inputBox.inputElement, (e) => this._onKeyUp.fire(e));
		this.oninput(this.inputBox.inputElement, (e) => this._onInput.fire());
		this.onmousedown(this.inputBox.inputElement, (e) => this._onMouseDown.fire(e));
	}

	public get isImeSessionInProgress(): boolean {
		return this.imeSessionInProgress;
	}

	public get onDidChange(): Event<string> {
		return this.inputBox.onDidChange;
	}

	public layout(style: { collapsedFindWidget: boolean; narrowFindWidget: boolean; reducedFindWidget: boolean }) {
		this.inputBox.layout();
		this.updateInputBoxPadding(style.collapsedFindWidget);
	}

	public enable(): void {
		this.domNode.classList.remove('disabled');
		this.inputBox.enable();
	}

	public disable(): void {
		this.domNode.classList.add('disabled');
		this.inputBox.disable();
	}

	public setEnabled(enabled: boolean): void {
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	private updateInputBoxPadding(controlsHidden = false) {
		if (controlsHidden) {
			this.inputBox.paddingRight = 0;
		} else {
			this.inputBox.paddingRight = 0;
		}
	}

	public clear(): void {
		this.clearValidation();
		this.setValue('');
		this.focus();
	}

	public getValue(): string {
		return this.inputBox.value;
	}

	public setValue(value: string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}

	public select(): void {
		this.inputBox.select();
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public validate(): void {
		this.inputBox.validate();
	}

	public showMessage(message: InputBoxMessage): void {
		this.inputBox.showMessage(message);
	}

	public clearMessage(): void {
		this.inputBox.hideMessage();
	}

	private clearValidation(): void {
		this.inputBox.hideMessage();
	}
}
