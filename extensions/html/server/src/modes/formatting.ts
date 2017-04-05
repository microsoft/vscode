/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { applyEdits } from '../utils/edits';
import { TextDocument, Range, TextEdit, FormattingOptions } from 'vscode-languageserver-types';
import { LanguageModes } from './languageModes';

export function format(languageModes: LanguageModes, document: TextDocument, formatRange: Range, formattingOptions: FormattingOptions, enabledModes: { [mode: string]: boolean }) {
	// run the html formatter on the full range and pass the result content to the embedded formatters.
	// from the final content create a single edit
	// advantages of this approach are
	//  - correct indents in the html document
	//  - correct initial indent for embedded formatters
	//  - no worrying of overlapping edits

	// perform a html format and apply changes to a new document
	let htmlMode = languageModes.getMode('html');
	let htmlEdits = htmlMode.format(document, formatRange, formattingOptions);
	let htmlFormattedContent = applyEdits(document, htmlEdits);
	let newDocument = TextDocument.create(document.uri + '.tmp', document.languageId, document.version, htmlFormattedContent);
	try {
		// run embedded formatters on html formatted content: - formatters see correct initial indent
		let afterFormatRangeLength = document.getText().length - document.offsetAt(formatRange.end); // length of unchanged content after replace range
		let newFormatRange = Range.create(formatRange.start, newDocument.positionAt(htmlFormattedContent.length - afterFormatRangeLength));
		let embeddedRanges = languageModes.getModesInRange(newDocument, newFormatRange);

		let embeddedEdits: TextEdit[] = [];

		for (let r of embeddedRanges) {
			let mode = r.mode;
			if (mode && mode.format && enabledModes[mode.getId()] && !r.attributeValue) {
				let edits = mode.format(newDocument, r, formattingOptions);
				for (let edit of edits) {
					embeddedEdits.push(edit);
				}
			}
		};

		if (embeddedEdits.length === 0) {
			return htmlEdits;
		}

		// apply all embedded format edits and create a single edit for all changes
		let resultContent = applyEdits(newDocument, embeddedEdits);
		let resultReplaceText = resultContent.substring(document.offsetAt(formatRange.start), resultContent.length - afterFormatRangeLength);

		return [TextEdit.replace(formatRange, resultReplaceText)];
	} finally {
		languageModes.onDocumentRemoved(newDocument);
	}

}