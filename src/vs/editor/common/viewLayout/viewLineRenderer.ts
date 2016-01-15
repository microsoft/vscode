/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ILineToken} from 'vs/editor/common/editorCommon';

export interface IRenderLineInput {
	lineContent: string;
	tabSize: number;
	stopRenderingLineAfter: number;
	renderWhitespace: boolean;
	parts: ILineToken[];
}

export interface IRenderLineOutput {
	charOffsetInPart: number[];
	lastRenderedPartIndex: number;
	output: string[];
}

let _space = ' '.charCodeAt(0);
let _tab = '\t'.charCodeAt(0);
let _lowerThan = '<'.charCodeAt(0);
let _greaterThan = '>'.charCodeAt(0);
let _ampersand = '&'.charCodeAt(0);
let _carriageReturn = '\r'.charCodeAt(0);
let _lineSeparator = '\u2028'.charCodeAt(0); //http://www.fileformat.info/info/unicode/char/2028/index.htm
let _bom = 65279;
let _replacementCharacter = '\ufffd';

export function renderLine(input:IRenderLineInput): IRenderLineOutput {
	const lineText = input.lineContent;
	let lineTextLength = lineText.length;
	const stopRenderingLineAfter = input.stopRenderingLineAfter;
	const tabSize = input.tabSize;

	if (lineTextLength === 0) {
		return {
			charOffsetInPart: [],
			lastRenderedPartIndex: 0,
			// This is basically for IE's hit test to work
			output: ['<span><span>&nbsp;</span></span>']
		};
	}

	let result: IRenderLineOutput = {
		charOffsetInPart: [],
		lastRenderedPartIndex: 0,
		output: []
	};

	result.output.push('<span>');
	let partClassName: string,
		partIndex = -1,
		nextPartIndex = 0,
		tabsCharDelta = 0,
		charOffsetInPart = 0,
		append = '',
		renderWhitespace = false;

	let actualLineParts = input.parts;
	if (actualLineParts.length === 0) {
		throw new Error('Cannot render non empty line without line parts!');
	}

	if (stopRenderingLineAfter !== -1 && lineTextLength > stopRenderingLineAfter - 1) {
		append = lineText.substr(stopRenderingLineAfter - 1, 1);
		lineTextLength = stopRenderingLineAfter - 1;
	}

	for (let i = 0; i < lineTextLength; i++) {
		if (i === nextPartIndex) {
			partIndex++;
			nextPartIndex = (partIndex + 1 < actualLineParts.length ? actualLineParts[partIndex + 1].startIndex : Number.MAX_VALUE);
			if (i > 0) {
				result.output.push('</span>');
			}
			result.output.push('<span class="');
			partClassName = 'token ' + actualLineParts[partIndex].type.replace(/[^a-z0-9\-]/gi, ' ');
			if (input.renderWhitespace) {
				renderWhitespace = partClassName.indexOf('whitespace') >= 0;
			}
			result.output.push(partClassName);
			result.output.push('">');

			charOffsetInPart = 0;
		}

		result.charOffsetInPart[i] = charOffsetInPart;
		let charCode = lineText.charCodeAt(i);

		switch (charCode) {
			case _tab:
				let insertSpacesCount = tabSize - (i + tabsCharDelta) % tabSize;
				tabsCharDelta += insertSpacesCount - 1;
				charOffsetInPart += insertSpacesCount - 1;
				if (insertSpacesCount > 0) {
					result.output.push(renderWhitespace ? '&rarr;' : '&nbsp;');
					insertSpacesCount--;
				}
				while (insertSpacesCount > 0) {
					result.output.push('&nbsp;');
					insertSpacesCount--;
				}
				break;

			case _space:
				result.output.push(renderWhitespace ? '&middot;' : '&nbsp;');
				break;

			case _lowerThan:
				result.output.push('&lt;');
				break;

			case _greaterThan:
				result.output.push('&gt;');
				break;

			case _ampersand:
				result.output.push('&amp;');
				break;

			case 0:
				result.output.push('&#00;');
				break;

			case _bom:
			case _lineSeparator:
				result.output.push(_replacementCharacter);
				break;

			case _carriageReturn:
				// zero width space, because carriage return would introduce a line break
				result.output.push('&#8203');
				break;

			default:
				result.output.push(lineText.charAt(i));
		}

		charOffsetInPart ++;
	}
	result.output.push('</span>');

	// When getting client rects for the last character, we will position the
	// text range at the end of the span, insteaf of at the beginning of next span
	result.charOffsetInPart[lineTextLength] = charOffsetInPart;

	// In case we stop rendering, we record here the index of the last span
	// that should be used for getting client rects
	result.lastRenderedPartIndex = partIndex;

	if (append.length > 0) {
		result.output.push('<span class="');
		result.output.push(partClassName);
		result.output.push('" style="color:grey">');
		result.output.push(append);
		result.output.push('&hellip;</span>');
	}
	result.output.push('</span>');

	return result;
}
