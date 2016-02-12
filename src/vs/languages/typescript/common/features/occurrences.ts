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

export function compute(languageService: ts.LanguageService, resource: URI, position: EditorCommon.IPosition, strict?: boolean): Modes.IOccurence[] {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, position),
		entries = languageService.getOccurrencesAtPosition(filename, offset);

	if(!entries) {
		return [];
	}

	return entries.map((entry) => {
		return {
			kind: entry.isWriteAccess ? 'write' : null,
			range: converter.getRange(sourceFile, entry.textSpan)
		};
	});
}