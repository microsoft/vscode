/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/languages/css/common/css-hover';
import * as ModesExt from 'vs/editor/common/modes/modesRegistry';
import * as Platform from 'vs/platform/platform';
import * as nls from 'vs/nls';
import * as LintRules from 'vs/languages/css/common/services/lintRules';
import * as ConfigurationRegistry from 'vs/platform/configuration/common/configurationRegistry';

ModesExt.registerMode({
	id: 'sass',
	extensions: ['.scss'],
	aliases: ['Sass', 'sass', 'scss'],
	mimetypes: ['text/x-scss', 'text/scss'],
	moduleId: 'vs/languages/sass/common/sass',
	ctorName: 'SASSMode'
});

var configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>Platform.Registry.as(ConfigurationRegistry.Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'sass',
	'order': 24,
	'title': nls.localize('sassConfigurationTitle', "Sass configuration"),
	'allOf': [{
		'title': nls.localize('sassLint', "Controls Sass validation and problem severities."),
		'properties': LintRules.getConfigurationProperties('sass')
	}]
});