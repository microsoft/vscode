/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import Modes = require('vs/editor/common/modes');

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