/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

ModesRegistry.registerCompatMode({
	id: 'razor',
	extensions: ['.cshtml'],
	aliases: ['Razor', 'razor'],
	mimetypes: ['text/x-cshtml'],
	moduleId: 'vs/languages/razor/common/razor',
	ctorName: 'RAZORMode'
});
