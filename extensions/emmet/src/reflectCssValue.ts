/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, TextEditor } from 'vscode';
import { getCssPropertyFromRule, getCssPropertyFromDocument, offsetRangeToVsRange } from './util';
import { Property, Rule } from 'EmmetFlatNode';

const vendorPrefixes = ['-webkit-', '-moz-', '-ms-', '-o-', ''];

export function reflectCssValue(): Thenable<boolean> | undefined {
	const editor = window.activeTextEditor;
	if (!editor) {
		window.showInformationMessage('No editor is active.');
		return;
	}

	const node = getCssPropertyFromDocument(editor, editor.selection.active);
	if (!node) {
		return;
	}

	return updateCSSNode(editor, node);
}

function updateCSSNode(editor: TextEditor, property: Property): Thenable<boolean> {
	const rule: Rule = property.parent;
	let currentPrefix = '';

	// Find vendor prefix of given property node
	for (const prefix of vendorPrefixes) {
		if (property.name.startsWith(prefix)) {
			currentPrefix = prefix;
			break;
		}
	}

	const propertyName = property.name.substr(currentPrefix.length);
	const propertyValue = property.value;

	return editor.edit(builder => {
		// Find properties with vendor prefixes, update each
		vendorPrefixes.forEach(prefix => {
			if (prefix === currentPrefix) {
				return;
			}
			const vendorProperty = getCssPropertyFromRule(rule, prefix + propertyName);
			if (vendorProperty) {
				const rangeToReplace = offsetRangeToVsRange(editor.document, vendorProperty.valueToken.start, vendorProperty.valueToken.end);
				builder.replace(rangeToReplace, propertyValue);
			}
		});
	});
}
