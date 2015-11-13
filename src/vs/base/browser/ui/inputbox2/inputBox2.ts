/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./inputBox2';
import Browser = require('vs/base/browser/browser');
import React = require('lib/react');

var DOM = React.DOM,
	div = DOM.div,
	input = DOM.input,
	label = DOM.label,
	span = DOM.span;

export interface InputBoxProps {
	type?: string;
	placeholder?: string;
	ariaLabel?: string;
	disabled?: boolean;
	message?: IMessage;

	value: string;

	onChange?: (newValue: string) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
}

export interface IMessage {
	content?: string;
	type?: MessageType;
}
export function messageEquals(a:IMessage, b:IMessage): boolean {
	if (!a || !b) {
		return !a && !b;
	}
	return (
		a.content === b.content
		&& a.type === b.type
	);
}

export enum MessageType {
	INFO = 1,
	WARNING = 2,
	ERROR = 3
}

export interface IRange {
	start: number;
	end: number;
}

export interface InputBoxState {}
export class InputBoxSpec extends React.BaseComponent<InputBoxProps, InputBoxState> {

	private refs: {
		input: React.DomReferencer2<HTMLInputElement>;
	};

	public getInitialState(): InputBoxState {
		return {};
	}

	public shouldComponentUpdate(nextProps:InputBoxProps, nextState:InputBoxState): boolean {
		return (
			this.props.type !== nextProps.type
			|| this.props.placeholder !== nextProps.placeholder
			|| this.props.ariaLabel !== nextProps.ariaLabel
			|| this.props.disabled !== nextProps.disabled
			|| !messageEquals(this.props.message, nextProps.message)
			|| this.props.value !== nextProps.value
		);
	}

	public render(): React.ReactElement<any, any> {
		var inputAttr = <React.DomAttributes>{
			ref: 'input',
			className: 'input',
			type: (this.props.type || 'text'),
			wrap: 'off',
			autoCorrect: 'off',
			autoCapitalize: 'off',
			spellCheck: 'false',
			value: this.props.value,
			onKeyDown: this._onKeyDown
		};
		if (this.props.ariaLabel) {
			inputAttr['aria-label'] = this.props.ariaLabel;
		}
		if (this.props.disabled) {
			inputAttr.disabled = this.props.disabled;
		}
		if (this.props.onChange) {
			inputAttr.onChange = this._onValueChange;
		}
		if (Browser.isIE9) {
			inputAttr.onKeyUp = this._onValueChange;
		}

		var extraWrapperChild: React.ReactDOMElement<React.DomAttributes> = null;
		if (this.props.placeholder) {
			if (!supportsInputPlaceholder()) {
				extraWrapperChild = label(<React.DomAttributes>{
					className: 'placeholder-shim' + (this.props.value ? ' hidden': ''),
					for: 'input',
					onClick: this._onPlaceholderShimClick,
					'aria-hidden': (this.props.value ? 'true' : 'false')
				}, this.props.placeholder);
			} else {
				inputAttr['placeholder'] = this.props.placeholder;
			}
		}

		var wrapperChildren:React.ReactElement<any, any>[] = [];
		if (extraWrapperChild) {
			wrapperChildren.push(extraWrapperChild);
		}
		wrapperChildren.push(input(inputAttr));
		if (this.props.message) {
			var messageChildren:React.ReactElement<any, any>[] = [];
			if (this.props.message.content) {
				messageChildren.push(span({
						className: 'monaco-inputbox-message ' + this._classForType(this.props.message.type)
					},
					this.props.message.content
				));
			}

			wrapperChildren.push(
				div({
					className: 'monaco-inputbox-container2',
					children: messageChildren
				})
			);
		}

		var topLevelClassName = 'monaco-inputbox2';
		if (this.props.message) {
			topLevelClassName += ' ' + this._classForType(this.props.message.type);
		}

		return (

			div({ className: topLevelClassName },
				div({
					className: 'wrapper',
					children: wrapperChildren
				})
			)

		);
	}

	private _getInputElement(): HTMLInputElement {
		return this.refs.input.getDOMNode();
	}

	public focus(): void {
		this._getInputElement().focus();
	}

	public select(range: IRange = null): void {
		var inputElement = this._getInputElement();
		inputElement.select();
		if (range) {
			inputElement.setSelectionRange(range.start, range.end);
		}
	}

	private _onKeyDown(e: React.KeyboardEvent): void {
		this.props.onKeyDown(e);
	}

	private _classForType(type: MessageType): string {
		switch (type) {
			case MessageType.INFO: return 'info';
			case MessageType.WARNING: return 'warning';
			default: return 'error';
		}
	}

	private _onValueChange(): void {
		this.props.onChange(this._getInputElement().value);
	}

	private _onPlaceholderShimClick(e:React.MouseEvent): void {
		e.preventDefault();
		e.stopPropagation();
		this._getInputElement().focus();
	}
}
export var InputBox = React.createFactoryForTS<InputBoxProps>(InputBoxSpec.prototype);

var supportsInputPlaceholder = (function() {
	var result: boolean;

	return function supportsInputPlaceholder() {
		if (typeof result === 'undefined') {
			// http://stackoverflow.com/questions/8245093/html5-placeholder-feature-detection-woes
			var input = document.createElement('input');
			result = (typeof input.placeholder !== 'undefined');
		}
		return result;
	};

})();