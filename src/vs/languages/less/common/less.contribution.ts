/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/languages/css/common/css-hover';
import platform = require('vs/platform/platform');
import nls = require('vs/nls');
import lintRules = require('vs/languages/css/common/services/lintRules');
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');

ModesRegistry.registerCompatMode({
	id: 'less',
	extensions: ['.less'],
	aliases: ['Less', 'less'],
	mimetypes: ['text/x-less', 'text/less'],
	moduleId: 'vs/languages/less/common/less',
	ctorName: 'LESSMode'
});

var configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>platform.Registry.as(ConfigurationRegistry.Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'less',
	'order': 22,
	'type': 'object',
	'title': nls.localize('lessConfigurationTitle', "LESS configuration"),
	'allOf': [{
		'title': nls.localize('lessLint', "Controls LESS validation and problem severities."),
		'properties': lintRules.getConfigurationProperties('less')

	}]
});
