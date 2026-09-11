/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { BROWSER_SEARCH_ENGINES, BROWSER_SEARCH_NONE, BrowserSearchEngineId, BrowserSearchEngineSettingId } from '../../common/browserSearch.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserSearchEngineSettingId]: {
			type: 'string',
			enum: [BROWSER_SEARCH_NONE, ...BROWSER_SEARCH_ENGINES.map(e => e.id)],
			enumItemLabels: [localize('browser.search.engine.none', "None"), ...BROWSER_SEARCH_ENGINES.map(e => e.label)],
			default: BrowserSearchEngineId.Bing,
			markdownDescription: localize(
				'browser.searchEngine',
				"Controls the search engine used to search the web from the address bar of the integrated browser. Select 'None' to disable search."
			),
			scope: ConfigurationScope.APPLICATION,
			order: 110
		}
	}
});
