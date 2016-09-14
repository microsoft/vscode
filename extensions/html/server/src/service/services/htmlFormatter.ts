/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {HTMLFormatConfiguration} from '../htmlLanguageService';
import {TextDocument, Range, TextEdit} from 'vscode-languageserver-types';
import {IBeautifyHTMLOptions, html_beautify} from '../lib/beautify-html';

export function format(document: TextDocument, range: Range, options: HTMLFormatConfiguration): TextEdit[] {
	let value = document.getText();
	if (range) {
		let startOffset = document.offsetAt(range.start);
		let endOffset = document.offsetAt(range.end);
		value = value.substring(startOffset, endOffset);
	}
	let htmlOptions: IBeautifyHTMLOptions = {
		indent_size: options.insertSpaces ? options.tabSize : 1,
		indent_char: options.insertSpaces ? ' ' : '\t',
		wrap_line_length: getFormatOption(options, 'wrapLineLength', 120),
		unformatted: getTagsFormatOption(options, 'unformatted', void 0),
		indent_inner_html: getFormatOption(options, 'indentInnerHtml', false),
		preserve_newlines: getFormatOption(options, 'preserveNewLines', false),
		max_preserve_newlines: getFormatOption(options, 'maxPreserveNewLines', void 0),
		indent_handlebars: getFormatOption(options, 'indentHandlebars', false),
		end_with_newline: getFormatOption(options, 'endWithNewline', false),
		extra_liners: getTagsFormatOption(options, 'extraLiners', void 0),
	};

	let result = html_beautify(value, htmlOptions);
	return [{
		range: range,
		newText: result
	}];
}

function getFormatOption(options: HTMLFormatConfiguration, key: string, dflt: any): any {
	if (options && options.hasOwnProperty(key)) {
		let value = options[key];
		if (value !== null) {
			return value;
		}
	}
	return dflt;
}

function getTagsFormatOption(options: HTMLFormatConfiguration, key: string, dflt: string[]): string[] {
	let list = <string>getFormatOption(options, key, null);
	if (typeof list === 'string') {
		if (list.length > 0) {
			return list.split(',').map(t => t.trim().toLowerCase());
		}
		return [];
	}
	return dflt;
}