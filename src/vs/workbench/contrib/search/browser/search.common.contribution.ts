/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Common search service registrations shared between the main workbench and the Agents window.

import * as nls from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerContributions as replaceContributions } from './replaceContributions.js';
import { registerContributions as notebookSearchContributions } from './notebookSearch/notebookSearchContributions.js';
import { ISearchHistoryService, SearchHistoryService } from '../common/searchHistoryService.js';
import { searchConfigurationNode } from '../common/search.js';

replaceContributions();
notebookSearchContributions();
registerSingleton(ISearchHistoryService, SearchHistoryService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...searchConfigurationNode,
	properties: {
		'search.searchOnType': {
			type: 'boolean',
			default: true,
			description: nls.localize('search.searchOnType', "Search all files as you type.")
		},
		'search.searchOnTypeDebouncePeriod': {
			type: 'number',
			default: 300,
			markdownDescription: nls.localize('search.searchOnTypeDebouncePeriod', "When {0} is enabled, controls the timeout in milliseconds between a character being typed and the search starting. Has no effect when {0} is disabled.", '`#search.searchOnType#`')
		},
	}
});
