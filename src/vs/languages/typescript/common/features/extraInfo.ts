/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Modes from 'vs/editor/common/modes';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import * as converter from 'vs/languages/typescript/common/features/converter';
import * as previewer from 'vs/languages/typescript/common/features/previewer';

export function compute(languageService: ts.LanguageService, resource:URI, position:EditorCommon.IPosition):Modes.IComputeExtraInfoResult {

	var filename = resource.toString(),
		sourceFile = languageService.getSourceFile(filename),
		offset = converter.getOffset(sourceFile, position),
		info = languageService.getQuickInfoAtPosition(filename, offset),
		result:Modes.IComputeExtraInfoResult;

	if(info) {

		var htmlContent = [
			previewer.html(info.displayParts),
			previewer.html(info.documentation, 'documentation')
		];

		result = {
			value: '',
			htmlContent: htmlContent,
			className: 'typeInfo ts',
			range: converter.getRange(sourceFile, info.textSpan)
		};
	}

	return result;
}