/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');
import Platform = require('vs/platform/platform');

ModesRegistry.registerCompatMode({
	id: 'markdown',
	extensions: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdwn', '.mdtxt', '.mdtext'],
	aliases: ['Markdown', 'markdown'],
	mimetypes: ['text/x-web-markdown'],
	moduleId: 'vs/languages/markdown/common/markdown',
	ctorName: 'MarkdownMode'
});

// Configuration
const configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>Platform.Registry.as(ConfigurationRegistry.Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'markdown',
	'order': 20,
	'type': 'object',
	'title': nls.localize('markdownConfigurationTitle', "Markdown preview configuration"),
	'properties': {
		'markdown.styles': {
			'type': 'array',
			'description': nls.localize('styles', "A list of URLs or local paths to CSS style sheets to use from the markdown preview."),
			'items': {
				'type': 'string'
			}
		}
	}
});