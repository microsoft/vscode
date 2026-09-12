/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Common search service registrations shared between the main workbench and the Agents window.

import * as nls from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerContributions as replaceContributions } from './replaceContributions.js';
import { registerContributions as notebookSearchContributions } from './notebookSearch/notebookSearchContributions.js';
import { ISearchHistoryService, SearchHistoryService } from '../common/searchHistoryService.js';
import { searchConfigurationNode } from '../common/search.js';
import { DEFAULT_MAX_SEARCH_RESULTS, SEARCH_EXCLUDE_CONFIG, SearchSortOrder } from '../../../services/search/common/search.js';

replaceContributions();
notebookSearchContributions();
registerSingleton(ISearchHistoryService, SearchHistoryService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...searchConfigurationNode,
	properties: {
		[SEARCH_EXCLUDE_CONFIG]: {
			type: 'object',
			markdownDescription: nls.localize('exclude', "Configure [glob patterns](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options) for excluding files and folders in fulltext searches and file search in quick open. To exclude files from the recently opened list in quick open, patterns must be absolute (for example `**/node_modules/**`). Inherits all glob patterns from the `#files.exclude#` setting."),
			default: { '**/node_modules': true, '**/bower_components': true, '**/*.code-search': true },
			additionalProperties: {
				anyOf: [
					{
						type: 'boolean',
						description: nls.localize('exclude.boolean', "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern."),
					},
					{
						type: 'object',
						properties: {
							when: {
								type: 'string', // expression ({ "**/*.js": { "when": "$(basename).js" } })
								pattern: '\\w*\\$\\(basename\\)\\w*',
								default: '$(basename).ext',
								markdownDescription: nls.localize({ key: 'exclude.when', comment: ['\\$(basename) should not be translated'] }, 'Additional check on the siblings of a matching file. Use \\$(basename) as variable for the matching file name.')
							}
						}
					}
				]
			},
			scope: ConfigurationScope.RESOURCE
		},
		'search.useIgnoreFiles': {
			type: 'boolean',
			markdownDescription: nls.localize('useIgnoreFiles', "Controls whether to use `.gitignore` and `.ignore` files when searching for files."),
			default: true,
			scope: ConfigurationScope.RESOURCE
		},
		'search.useGlobalIgnoreFiles': {
			type: 'boolean',
			markdownDescription: nls.localize('useGlobalIgnoreFiles', "Controls whether to use your global gitignore file (for example, from `$HOME/.config/git/ignore`) when searching for files. Requires {0} to be enabled.", '`#search.useIgnoreFiles#`'),
			default: false,
			scope: ConfigurationScope.RESOURCE
		},
		'search.useParentIgnoreFiles': {
			type: 'boolean',
			markdownDescription: nls.localize('useParentIgnoreFiles', "Controls whether to use `.gitignore` and `.ignore` files in parent directories when searching for files. Requires {0} to be enabled.", '`#search.useIgnoreFiles#`'),
			default: false,
			scope: ConfigurationScope.RESOURCE
		},
		'search.ripgrep.maxThreads': {
			type: 'number',
			description: nls.localize('search.ripgrep.maxThreads', "Number of threads to use for searching. When set to 0, the engine automatically determines this value."),
			default: 0
		},
		'search.followSymlinks': {
			type: 'boolean',
			description: nls.localize('search.followSymlinks', "Controls whether to follow symlinks while searching."),
			default: true
		},
		'search.smartCase': {
			type: 'boolean',
			description: nls.localize('search.smartCase', "Search case-insensitively if the pattern is all lowercase, otherwise, search case-sensitively."),
			default: false
		},
		'search.maxResults': {
			type: ['number', 'null'],
			default: DEFAULT_MAX_SEARCH_RESULTS,
			markdownDescription: nls.localize('search.maxResults', "Controls the maximum number of search results, this can be set to `null` (empty) to return unlimited results.")
		},
		'search.sortOrder': {
			type: 'string',
			enum: [SearchSortOrder.Default, SearchSortOrder.FileNames, SearchSortOrder.Type, SearchSortOrder.Modified, SearchSortOrder.CountDescending, SearchSortOrder.CountAscending],
			default: SearchSortOrder.Default,
			enumDescriptions: [
				nls.localize('searchSortOrder.default', "Results are sorted by folder and file names, in alphabetical order."),
				nls.localize('searchSortOrder.filesOnly', "Results are sorted by file names ignoring folder order, in alphabetical order."),
				nls.localize('searchSortOrder.type', "Results are sorted by file extensions, in alphabetical order."),
				nls.localize('searchSortOrder.modified', "Results are sorted by file last modified date, in descending order."),
				nls.localize('searchSortOrder.countDescending', "Results are sorted by count per file, in descending order."),
				nls.localize('searchSortOrder.countAscending', "Results are sorted by count per file, in ascending order.")
			],
			description: nls.localize('search.sortOrder', "Controls sorting order of search results.")
		},
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
