/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

ModesRegistry.registerCompatMode({
	id: 'php',
	extensions: ['.php', '.php4', '.php5', '.phtml', '.ctp'],
	aliases: ['PHP', 'php'],
	mimetypes: ['application/x-php'],
	moduleId: 'vs/languages/php/common/php',
	ctorName: 'PHPMode'
});
