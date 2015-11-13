/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('vs/base/common/assert');
import types = require('vs/base/common/types');
import uri from 'vs/base/common/uri';
import glob = require('vs/base/common/glob');
import strings = require('vs/base/common/strings');
import objects = require('vs/base/common/objects');
import {TPromise} from 'vs/base/common/winjs.base';
import search = require('vs/platform/search/common/search');
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';

export function getExcludes(configuration: search.ISearchConfiguration): glob.IExpression {
	let fileExcludes = configuration && configuration.files && configuration.files.exclude;
	let searchExcludes = configuration && configuration.search && configuration.search.exclude;

	if (!fileExcludes && !searchExcludes) {
		return null;
	}

	if (!fileExcludes || !searchExcludes) {
		return fileExcludes || searchExcludes;
	}

	let allExcludes: glob.IExpression = Object.create(null);
	allExcludes = objects.mixin(allExcludes, fileExcludes);
	allExcludes = objects.mixin(allExcludes, searchExcludes, true);

	return allExcludes;
}

export class QueryBuilder {

	constructor( @IConfigurationService private configurationService: IConfigurationService) {
	}

	public text(contentPattern: search.IPatternInfo, options?: search.IQueryOptions): TPromise<search.ISearchQuery> {
		return this.query(search.QueryType.Text, contentPattern, options);
	}

	public file(options?: search.IQueryOptions): TPromise<search.ISearchQuery> {
		return this.query(search.QueryType.File, null, options);
	}

	private query(type: search.QueryType, contentPattern: search.IPatternInfo, options: search.IQueryOptions = {}): TPromise<search.ISearchQuery> {
		return this.configurationService.loadConfiguration().then((configuration: search.ISearchConfiguration) => {
			let excludePattern = getExcludes(configuration);
			if (!options.excludePattern) {
				options.excludePattern = excludePattern;
			} else {
				objects.mixin(options.excludePattern, excludePattern, false /* no overwrite */);
			}

			return {
				type: type,
				rootResources: options.rootResources,
				filePatterns: options.filePatterns || [],
				excludePattern: options.excludePattern,
				includePattern: options.includePattern,
				maxResults: options.maxResults,
				fileEncoding: options.fileEncoding,
				contentPattern: contentPattern
			};
		});
	}
}