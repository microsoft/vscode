/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import converter = require('vs/languages/typescript/common/features/converter');

export function compute(languageService:ts.LanguageService, resource:URI, position:EditorCommon.IPosition):Modes.ILogicalSelectionEntry[] {

	var sourceFile = languageService.getSourceFile(resource.toString()),
		offset = converter.getOffset(sourceFile, position);

	var token = ts.getTokenAtPosition(sourceFile, offset),
		lastStart = -1,
		lastEnd = -1,
		result:Modes.ILogicalSelectionEntry[] = [];

	while(token) {

		var start = token.getStart(),
			end = token.getEnd();

		if(start !== lastStart || end !== lastEnd) {
			result.unshift({
				type: 'node',
				range: converter.getRange(sourceFile, start, end)
			});
		}

		lastStart = start;
		lastEnd = end;
		token = token.parent;
	}

	return result;
}