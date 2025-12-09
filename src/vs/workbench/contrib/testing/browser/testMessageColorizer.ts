/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { GraphemeIterator, forAnsiStringParts, removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import './media/testMessageColorizer.css';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';

const colorAttrRe = /^\x1b\[([0-9]+)m$/;

const enum Classes {
	Prefix = 'tstm-ansidec-',
	ForegroundPrefix = Classes.Prefix + 'fg',
	BackgroundPrefix = Classes.Prefix + 'bg',
	Bold = Classes.Prefix + '1',
	Faint = Classes.Prefix + '2',
	Italic = Classes.Prefix + '3',
	Underline = Classes.Prefix + '4',
}

export const renderTestMessageAsText = (tm: string | IMarkdownString) =>
	typeof tm === 'string' ? removeAnsiEscapeCodes(tm) : renderAsPlaintext(tm);


/**
 * Applies decorations based on ANSI styles from the test message in the editor.
 * ANSI sequences are stripped from the text displayed in editor, and this
 * re-applies their colorization.
 *
 * This uses decorations rather than language features because the string
 * rendered in the editor lacks the ANSI codes needed to actually apply the
 * colorization.
 *
 * Note: does not support TrueColor.
 */
export const colorizeTestMessageInEditor = (message: string, editor: CodeEditorWidget): IDisposable => {
	const decos: string[] = [];

	editor.changeDecorations(changeAccessor => {
		let start = new Position(1, 1);
		let cls: string[] = [];
		for (const part of forAnsiStringParts(message)) {
			if (part.isCode) {
				const colorAttr = colorAttrRe.exec(part.str)?.[1];
				if (!colorAttr) {
					continue;
				}

				const n = Number(colorAttr);
				if (n === 0) {
					cls.length = 0;
				} else if (n === 22) {
					cls = cls.filter(c => c !== Classes.Bold && c !== Classes.Italic);
				} else if (n === 23) {
					cls = cls.filter(c => c !== Classes.Italic);
				} else if (n === 24) {
					cls = cls.filter(c => c !== Classes.Underline);
				} else if ((n >= 30 && n <= 39) || (n >= 90 && n <= 99)) {
					cls = cls.filter(c => !c.startsWith(Classes.ForegroundPrefix));
					cls.push(Classes.ForegroundPrefix + colorAttr);
				} else if ((n >= 40 && n <= 49) || (n >= 100 && n <= 109)) {
					cls = cls.filter(c => !c.startsWith(Classes.BackgroundPrefix));
					cls.push(Classes.BackgroundPrefix + colorAttr);
				} else {
					cls.push(Classes.Prefix + colorAttr);
				}
			} else {
				let line = start.lineNumber;
				let col = start.column;

				const graphemes = new GraphemeIterator(part.str);
				for (let i = 0; !graphemes.eol(); i += graphemes.nextGraphemeLength()) {
					if (part.str[i] === '\n') {
						line++;
						col = 1;
					} else {
						col++;
					}
				}

				const end = new Position(line, col);
				if (cls.length) {
					decos.push(changeAccessor.addDecoration(Range.fromPositions(start, end), {
						inlineClassName: cls.join(' '),
						description: 'test-message-colorized',
					}));
				}
				start = end;
			}
		}
	});

	return toDisposable(() => editor.removeDecorations(decos));
};
