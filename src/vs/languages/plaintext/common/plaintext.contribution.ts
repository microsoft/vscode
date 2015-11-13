/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// Load plain text in the main code

import 'vs/languages/plaintext/common/plaintext';
import modesExtensions = require('vs/editor/common/modes/modesRegistry');

modesExtensions.registerMode({
	id: 'plaintext',
	extensions: ['.txt', '.gitignore'],
	aliases: ['Plain Text', 'text'],
	mimetypes: ['text/plain'],
	moduleId: 'vs/languages/plaintext/common/plaintext',
	ctorName: 'Mode'
});
