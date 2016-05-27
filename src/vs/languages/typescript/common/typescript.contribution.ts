/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {registerStandaloneLanguage} from 'vs/editor/browser/standalone/standaloneLanguages';

// ----- Registration and Configuration --------------------------------------------------------

registerStandaloneLanguage({
	id: 'typescript',
	extensions: ['.ts'],
	aliases: ['TypeScript', 'ts', 'typescript'],
	mimetypes: ['text/typescript'],
}, 'vs/languages/typescript/common/mode');

registerStandaloneLanguage({
	id: 'javascript',
	extensions: ['.js', '.es6'],
	firstLine: '^#!.*\\bnode',
	filenames: ['jakefile'],
	aliases: ['JavaScript', 'javascript', 'js'],
	mimetypes: ['text/javascript'],
}, 'vs/languages/typescript/common/mode');
