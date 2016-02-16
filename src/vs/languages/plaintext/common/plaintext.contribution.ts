/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// Load plain text in the main code

import 'vs/languages/plaintext/common/plaintext';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

ModesRegistry.registerCompatMode({
	id: 'plaintext',
	extensions: ['.txt', '.gitignore'],
	aliases: ['Plain Text', 'text'],
	mimetypes: ['text/plain'],
	moduleId: 'vs/languages/plaintext/common/plaintext',
	ctorName: 'Mode'
});
