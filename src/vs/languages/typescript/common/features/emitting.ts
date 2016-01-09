/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as strings from 'vs/base/common/strings';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Modes from 'vs/editor/common/modes';

export function getEmitOutput(languageService:ts.LanguageService, resource:URI, type:string):Modes.IEmitOutput {

	var output = languageService.getEmitOutput(resource.toString()),
		files = output.outputFiles;

	if(!files) {
		return null;
	}

	for(var i = 0, len = files.length; i < len; i++) {
		if(strings.endsWith(files[i].name, type)) {
			return {
				filename: files[i].name,
				content: files[i].text
			};
		}
	}

	return null;
}