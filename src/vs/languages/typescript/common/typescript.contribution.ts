/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

// ----- Registration and Configuration --------------------------------------------------------

ModesRegistry.registerCompatMode({
	id: 'typescript',
	extensions: ['.ts'],
	aliases: ['TypeScript', 'ts', 'typescript'],
	mimetypes: ['text/typescript'],
	moduleId: 'vs/languages/typescript/common/mode',
	ctorName: 'TypeScriptMode'
});

ModesRegistry.registerCompatMode({
	id: 'javascript',
	extensions: ['.js', '.es6'],
	firstLine: '^#!.*\\bnode',
	filenames: ['jakefile'],
	aliases: ['JavaScript', 'javascript', 'js'],
	mimetypes: ['text/javascript'],
	moduleId: 'vs/languages/typescript/common/mode',
	ctorName: 'JavaScriptMode'
});
