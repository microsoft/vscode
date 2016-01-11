/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/languages/css/common/css-hover';
import * as nls from 'vs/nls';
import * as Platform from 'vs/platform/platform';
import * as modesExtensions from 'vs/editor/common/modes/modesRegistry';
import * as ConfigurationRegistry from 'vs/platform/configuration/common/configurationRegistry';
import * as lintRules from 'vs/languages/css/common/services/lintRules';

modesExtensions.registerMode({
	id: 'css',
	extensions: ['.css'],
	aliases: ['CSS', 'css'],
	mimetypes: ['text/css'],
	moduleId: 'vs/languages/css/common/css',
	ctorName: 'CSSMode'
});

var configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>Platform.Registry.as(ConfigurationRegistry.Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'css',
	'order': 20,
	'title': nls.localize('cssConfigurationTitle', "CSS configuration"),
	'allOf': [{
		'title': nls.localize('lint', "Controls CSS validation and problem severities."),
		'properties': lintRules.getConfigurationProperties('css')
	}]
});