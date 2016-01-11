/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as network from 'vs/base/common/network';
import URI from 'vs/base/common/uri';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Modes from 'vs/editor/common/modes';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import * as converter from 'vs/languages/typescript/common/features/converter';

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