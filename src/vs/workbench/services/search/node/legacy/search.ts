/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { IPatternInfo, ITextSearchPreviewOptions } from 'vs/platform/search/common/search';

export interface IFolderSearch {
	folder: string;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	fileEncoding?: string;
	disregardIgnoreFiles?: boolean;
	disregardGlobalIgnoreFiles?: boolean;
}

export interface IRawSearch {
	folderQueries: IFolderSearch[];
	ignoreSymlinks?: boolean;
	extraFiles?: string[];
	filePattern?: string;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	contentPattern: IPatternInfo;
	maxResults?: number;
	exists?: boolean;
	sortByScore?: boolean;
	cacheKey?: string;
	maxFilesize?: number;
	useRipgrep?: boolean;
	disregardIgnoreFiles?: boolean;
	previewOptions?: ITextSearchPreviewOptions;
	disregardGlobalIgnoreFiles?: boolean;
}
