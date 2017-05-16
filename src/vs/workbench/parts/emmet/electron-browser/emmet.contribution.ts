/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';

import './actions/expandAbbreviation';
import './actions/balance';
import './actions/matchingPair';
import './actions/wrapWithAbbreviation';
import './actions/editPoints';
import './actions/selectItem';
import './actions/toggleComment';
import './actions/splitJoinTag';
import './actions/removeTag';
import './actions/mergeLines';
import './actions/updateImageSize';
import './actions/evaluateMath';
import './actions/incrementDecrement';
import './actions/reflectCssValue';
// import './actions/base64'; // disabled - we will revisit the implementation
import './actions/updateTag';

// Configuration: emmet
const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'emmet',
	'order': 6,
	'title': nls.localize('emmetConfigurationTitle', "Emmet"),
	'type': 'object',
	'properties': {
		'emmet.triggerExpansionOnTab': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('triggerExpansionOnTab', "When enabled, emmet abbreviations are expanded when pressing TAB.")
		},
		'emmet.preferences': {
			'type': 'object',
			'default': {},
			'description': nls.localize('emmetPreferences', "Preferences used to modify behavior of some actions and resolvers of Emmet.")
		},
		'emmet.syntaxProfiles': {
			'type': 'object',
			'default': {},
			'description': nls.localize('emmetSyntaxProfiles', "Define profile for specified syntax or use your own profile with specific rules.")
		},
		'emmet.excludeLanguages': {
			'type': 'array',
			'default': ['markdown'],
			'description': nls.localize('emmetExclude', "An array of languages where emmet abbreviations should not be expanded.")
		},
		'emmet.extensionsPath': {
			'type': 'string',
			'default': null,
			'description': nls.localize('emmetExtensionsPath', 'Path to a folder containing emmet profiles, snippets and preferences')
		}
	}
});
