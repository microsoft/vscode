/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import converter = require('vs/languages/typescript/common/features/converter');
import previewer = require('vs/languages/typescript/common/features/previewer');

export function compute(languageService: ts.LanguageService, resource:URI, position:EditorCommon.IPosition):Modes.IComputeExtraInfoResult {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, position),
		info = languageService.getQuickInfoAtPosition(filename, offset),
		result:Modes.IComputeExtraInfoResult;

	if(info) {

		var htmlContent: IHTMLContentElement[] = [
			{ markdown: previewer.plain(info.documentation) },
			{ markdown: '```javascript\n' + previewer.plain(info.displayParts) + '\n```' },
		];

		result = {
			htmlContent: htmlContent,
			range: converter.getRange(sourceFile, info.textSpan)
		};
	}

	return result;
}