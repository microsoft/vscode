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
	moduleId: 'vs/languages/typescript/common/typescriptMode',
	ctorName: 'TypeScriptMode'
});
