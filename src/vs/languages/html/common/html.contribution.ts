/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import nls = require('vs/nls');
import platform = require('vs/platform/platform');
import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');

ModesRegistry.registerCompatMode({
	id: 'html',
	extensions: ['.html', '.htm', '.shtml', '.xhtml', '.mdoc', '.jsp', '.asp', '.aspx', '.jshtm'],
	aliases: ['HTML', 'htm', 'html', 'xhtml'],
	mimetypes: ['text/html', 'text/x-jshtm', 'text/template', 'text/ng-template'],
	moduleId: 'vs/languages/html/common/html',
	ctorName: 'HTMLMode',
	deps: ['text/css', 'text/javascript']
});

var configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>platform.Registry.as(ConfigurationRegistry.Extensions.Configuration);

export interface IHTMLFormatConfiguration {
	wrapLineLength: number;
	unformatted: string;
	indentInnerHtml: boolean;
	preserveNewLines: boolean;
	maxPreserveNewLines: number;
	indentHandlebars: boolean;
	endWithNewline: boolean;
	extraLiners: string;
}

export interface IHTMLConfiguration {
	format: IHTMLFormatConfiguration;
	suggest: {[providerId:string]:boolean};
}

configurationRegistry.registerConfiguration({
	'id': 'html',
	'order': 20,
	'type': 'object',
	'title': nls.localize('htmlConfigurationTitle', "HTML"),
	'properties': {
		'html.format.wrapLineLength': {
			'type': 'integer',
			'default': 120,
			'description': nls.localize('format.wrapLineLength', "Maximum amount of characters per line (0 = disable)."),
		},
		'html.format.unformatted': {
			'type': ['string', 'null'],
			'default': 'a, abbr, acronym, b, bdo, big, br, button, cite, code, dfn, em, i, img, input, kbd, label, map, object, q, samp, script, select, small, span, strong, sub, sup, textarea, tt, var',
			'description': nls.localize('format.unformatted', "List of tags, comma separated, that shouldn't be reformatted. 'null' defaults to all tags listed at https://www.w3.org/TR/html5/dom.html#phrasing-content."),
		},
		'html.format.indentInnerHtml': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('format.indentInnerHtml', "Indent <head> and <body> sections."),
		},
		'html.format.preserveNewLines': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('format.preserveNewLines', "Whether existing line breaks before elements should be preserved. Only works before elements, not inside tags or for text."),
		},
		'html.format.maxPreserveNewLines': {
			'type': ['number', 'null'],
			'default': null,
			'description': nls.localize('format.maxPreserveNewLines', "Maximum number of line breaks to be preserved in one chunk. Use 'null' for unlimited."),
		},
		'html.format.indentHandlebars': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('format.indentHandlebars', "Format and indent {{#foo}} and {{/foo}}."),
		},
		'html.format.endWithNewline': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('format.endWithNewline', "End with a newline."),
		},
		'html.format.extraLiners': {
			'type': ['string', 'null'],
			'default': 'head, body, /html',
			'description': nls.localize('format.extraLiners', "List of tags, comma separated, that should have an extra newline before them. 'null' defaults to \"head, body, /html\"."),
		},
'html.suggest.angular1': {
	'type': ['boolean'],
	'default': true,
	'description': nls.localize('suggest.angular1', "Configures if the built-in HTML language support suggests Angular V1 tags and properties."),
},
'html.suggest.ionic': {
	'type': ['boolean'],
	'default': true,
	'description': nls.localize('suggest.ionic', "Configures if the built-in HTML language support suggests Ionic tags, properties and values."),
},
'html.suggest.html5': {
	'type': ['boolean'],
	'default': true,
	'description': nls.localize('suggest.html5', "Configures if the built-in HTML language support suggests HTML5 tags, properties and values."),
},
	}
});
