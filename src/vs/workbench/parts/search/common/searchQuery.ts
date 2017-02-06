/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { mixin } from 'vs/base/common/objects';
import { IPatternInfo, IQueryOptions, ISearchQuery, QueryType, ISearchConfiguration, getExcludes } from 'vs/platform/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class QueryBuilder {

	constructor( @IConfigurationService private configurationService: IConfigurationService) {
	}

	public text(contentPattern: IPatternInfo, options?: IQueryOptions): ISearchQuery {
		return this.query(QueryType.Text, contentPattern, options);
	}

	public file(options?: IQueryOptions): ISearchQuery {
		return this.query(QueryType.File, null, options);
	}

	private query(type: QueryType, contentPattern: IPatternInfo, options: IQueryOptions = {}): ISearchQuery {
		const configuration = this.configurationService.getConfiguration<ISearchConfiguration>();

		const excludePattern = getExcludes(configuration);
		if (!options.excludePattern) {
			options.excludePattern = excludePattern;
		} else {
			mixin(options.excludePattern, excludePattern, false /* no overwrite */);
		}

		return {
			type: type,
			folderResources: options.folderResources,
			extraFileResources: options.extraFileResources,
			filePattern: options.filePattern,
			excludePattern: options.excludePattern,
			includePattern: options.includePattern,
			maxResults: options.maxResults,
			sortByScore: options.sortByScore,
			cacheKey: options.cacheKey,
			fileEncoding: options.fileEncoding,
			contentPattern: contentPattern
		};
	}
}