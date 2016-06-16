/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

const register = false;
if (register) {
	ModesRegistry.registerCompatMode({
		id: 'markdown',
		extensions: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdwn', '.mdtxt', '.mdtext'],
		aliases: ['Markdown', 'markdown'],
		mimetypes: ['text/x-web-markdown'],
		moduleId: 'vs/languages/markdown/common/markdown',
		ctorName: 'MarkdownMode'
	});
}