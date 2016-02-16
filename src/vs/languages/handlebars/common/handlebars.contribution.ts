/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

ModesRegistry.registerCompatMode({
	id: 'handlebars',
	extensions: ['.handlebars', '.hbs'],
	aliases: ['Handlebars', 'handlebars'],
	mimetypes: ['text/x-handlebars-template'],
	moduleId: 'vs/languages/handlebars/common/handlebars',
	ctorName: 'HandlebarsMode'
});
