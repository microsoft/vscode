/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { BROWSER_SEARCH_ENGINES, BrowserSearchEnabledSettingId, BrowserSearchEngineSettingId, DEFAULT_BROWSER_SEARCH_ENGINE } from '../../common/browserSearch.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserSearchEnabledSettingId]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.', '{0} is a setting reference link to the search engine setting.'], key: 'browser.addressBarSearch.enabled' },
				'When enabled, the address bar in the integrated browser can be used to search the internet with the search engine configured by {0}.',
				`\`#${BrowserSearchEngineSettingId}#\``
			),
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			order: 110
		},
		[BrowserSearchEngineSettingId]: {
			type: 'string',
			enum: BROWSER_SEARCH_ENGINES.map(e => e.id),
			enumItemLabels: BROWSER_SEARCH_ENGINES.map(e => e.label),
			default: DEFAULT_BROWSER_SEARCH_ENGINE,
			markdownDescription: localize(
				'browser.addressBarSearch.searchEngine',
				"The search engine used by the integrated browser address bar when {0} is enabled.",
				`\`#${BrowserSearchEnabledSettingId}#\``
			),
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			order: 111
		}
	}
});
