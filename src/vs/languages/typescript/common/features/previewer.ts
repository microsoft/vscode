/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import * as htmlContent from 'vs/base/common/htmlContent';

export function html(parts:ts.SymbolDisplayPart[], className:string = strings.empty):htmlContent.IHTMLContentElement {

	if(!parts) {
		return {};
	}

	var htmlParts = parts.map(part => {
		return <htmlContent.IHTMLContentElement> {
			tagName: 'span',
			text: part.text,
			className: part.kind
		};
	});

	return {
		tagName: 'div',
		className: 'ts-symbol ' + className,
		children: htmlParts
	};
}

export function plain(parts: ts.SymbolDisplayPart[]): string {
	if(!parts) {
		return strings.empty;
	}
	return parts.map(part => part.text).join(strings.empty);
}
