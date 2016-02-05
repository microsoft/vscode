/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Strings = require('vs/base/common/strings');
import {NullState, nullTokenize} from 'vs/editor/common/modes/nullMode';
import Modes = require('vs/editor/common/modes');
import {IHTMLContentElement} from 'vs/base/common/htmlContent';

export function tokenizeToHtmlContent(text: string, mode: Modes.IMode): IHTMLContentElement {
	return _tokenizeToHtmlContent(text, _getSafeTokenizationSupport(mode));
}

export function tokenizeToString(text: string, mode: Modes.IMode, extraTokenClass?: string): string {
	return _tokenizeToString(text, _getSafeTokenizationSupport(mode), extraTokenClass);
}

function _getSafeTokenizationSupport(mode: Modes.IMode): Modes.ITokenizationSupport {
	if (mode && mode.tokenizationSupport) {
		return mode.tokenizationSupport;
	}
	return {
		shouldGenerateEmbeddedModels: false,
		getInitialState: () => new NullState(null, null),
		tokenize: (buffer:string, state: Modes.IState, deltaOffset:number = 0, stopAtOffset?:number) => nullTokenize(null, buffer, state, deltaOffset, stopAtOffset)
	};
}

function _tokenizeToHtmlContent(text: string, tokenizationSupport: Modes.ITokenizationSupport): IHTMLContentElement {
	var result: IHTMLContentElement = {
		tagName: 'div',
		style: 'white-space: pre-wrap',
		children: []
	};

	var emitToken = (className: string, tokenText: string) => {
		result.children.push({
			tagName: 'span',
			className: className,
			text: tokenText
		});
	};

	var emitNewLine = () => {
		result.children.push({
			tagName: 'br'
		});
	};

	_tokenizeLines(text, tokenizationSupport, emitToken, emitNewLine);

	return result;
}

function _tokenizeToString(text: string, tokenizationSupport: Modes.ITokenizationSupport, extraTokenClass: string = ''): string {
	if (extraTokenClass && extraTokenClass.length > 0) {
		extraTokenClass = ' ' + extraTokenClass;
	}

	var result = '';

	var emitToken = (className: string, tokenText: string) => {
		result += '<span class="' + className + extraTokenClass + '">' + Strings.escape(tokenText) + '</span>';
	};

	var emitNewLine = () => {
		result += '<br/>';
	};

	result = '<div style="white-space: pre-wrap;">';
	_tokenizeLines(text, tokenizationSupport, emitToken, emitNewLine);
	result += '</div>';

	return result;
}

interface IEmitTokenFunc {
	(className: string, innerText: string): void;
}
interface IEmitNewLineFunc {
	(): void;
}

function _tokenizeLines(text: string, tokenizationSupport: Modes.ITokenizationSupport, emitToken: IEmitTokenFunc, emitNewLine: IEmitNewLineFunc): void {
	var lines = text.split(/\r\n|\r|\n/);
	var currentState = tokenizationSupport.getInitialState();
	for (var i = 0; i < lines.length; i++) {
		currentState = _tokenizeLine(lines[i], tokenizationSupport, emitToken, currentState);

		// Keep new lines
		if (i < lines.length - 1) {
			emitNewLine();
		}
	}
}

function _tokenizeLine(line: string, tokenizationSupport:Modes.ITokenizationSupport, emitToken: IEmitTokenFunc, startState: Modes.IState): Modes.IState {
	var tokenized = tokenizationSupport.tokenize(line, startState),
		endState = tokenized.endState,
		tokens = tokenized.tokens,
		offset = 0,
		tokenText: string;

	// For each token inject spans with proper class names based on token type
	for (var j = 0; j < tokens.length; j++) {
		var token = tokens[j];

		// Tokens only provide a startIndex from where they are valid from. As such, we need to
		// look ahead the value of the token by advancing until the next tokens start inex or the
		// end of the line.
		if (j < tokens.length - 1) {
			tokenText = line.substring(offset, tokens[j + 1].startIndex);
			offset = tokens[j + 1].startIndex;
		} else {
			tokenText = line.substr(offset);
		}

		var className = 'token';
		var safeType = token.type.replace(/[^a-z0-9\-]/gi, ' ');
		if (safeType.length > 0) {
			className += ' ' + safeType;
		}
		emitToken(className, tokenText);
	}

	return endState;
}
