/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IExpression } from 'vs/base/common/glob';
import { mixin } from 'vs/base/common/objects';
import uri from 'vs/base/common/uri';
import { IPatternInfo, IQueryOptions, IFolderQueryOptions, ISearchQuery, QueryType, ISearchConfiguration, getExcludes } from 'vs/platform/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class QueryBuilder {

	constructor( @IConfigurationService private configurationService: IConfigurationService) {
	}

	public text(contentPattern: IPatternInfo, folderResources?: uri[], options?: IQueryOptions): ISearchQuery {
		return this.query(QueryType.Text, contentPattern, folderResources, options);
	}

	public file(folderResources?: uri[], options?: IQueryOptions): ISearchQuery {
		return this.query(QueryType.File, null, folderResources, options);
	}

	private query(type: QueryType, contentPattern: IPatternInfo, folderResources?: uri[], options: IQueryOptions = {}): ISearchQuery {
		const folderQueries = folderResources && folderResources.map(folder => {
			const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
			return <IFolderQueryOptions>{
				folder,
				excludePattern: this.getExcludesForFolder(folderConfig, options),
				fileEncoding: folderConfig.files.encoding
			};
		});

		const useRipgrep = !folderResources || folderResources.every(folder => {
			const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
			return folderConfig.search.useRipgrep;
		});

		return {
			type,
			folderQueries,
			extraFileResources: options.extraFileResources,
			filePattern: options.filePattern,
			excludePattern: options.excludePattern,
			includePattern: options.includePattern,
			maxResults: options.maxResults,
			sortByScore: options.sortByScore,
			cacheKey: options.cacheKey,
			contentPattern: contentPattern,
			useRipgrep,
			disregardIgnoreFiles: options.disregardIgnoreFiles,
			disregardExcludeSettings: options.disregardExcludeSettings,
			searchPaths: options.searchPaths
		};
	}

	private getExcludesForFolder(folderConfig: ISearchConfiguration, options: IQueryOptions): IExpression | null {
		const settingsExcludePattern = getExcludes(folderConfig);

		if (options.disregardExcludeSettings) {
			return null;
		} else if (options.excludePattern) {
			return mixin(options.excludePattern, settingsExcludePattern, false /* no overwrite */);
		} else {
			return settingsExcludePattern;
		}
	}
}