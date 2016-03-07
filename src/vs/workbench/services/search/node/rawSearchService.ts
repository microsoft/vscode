/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');

import gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

import {PPromise} from 'vs/base/common/winjs.base';
import glob = require('vs/base/common/glob');
import {MAX_FILE_SIZE} from 'vs/platform/files/common/files';
import {IProgress, ILineMatch, IPatternInfo} from 'vs/platform/search/common/search';
import {FileWalker, Engine as FileSearchEngine} from 'vs/workbench/services/search/node/fileSearch';
import {Engine as TextSearchEngine} from 'vs/workbench/services/search/node/textSearch';

export interface IRawSearch {
	rootFolders: string[];
	extraFiles?: string[];
	filePattern?: string;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	contentPattern?: IPatternInfo;
	maxResults?: number;
	maxFilesize?: number;
	fileEncoding?: string;
}

export interface IRawSearchService {
	fileSearch(search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
	textSearch(search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
}

export interface ISearchEngine {
	search: (onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, isLimitHit: boolean) => void) => void;
	cancel: () => void;
}

export interface ISerializedSearchComplete {
	limitHit: boolean;
}

export interface ISerializedFileMatch {
	path?: string;
	lineMatches?: ILineMatch[];
}

export interface ISerializedSearchProgressItem extends ISerializedFileMatch, IProgress {
	// Marker interface to indicate the possible values for progress calls from the engine
}

export class SearchService implements IRawSearchService {

	public fileSearch(config: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		let engine = new FileSearchEngine(config);

		return this.doSearch(engine);
	}

	public textSearch(config: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		let engine = new TextSearchEngine(config, new FileWalker({
			rootFolders: config.rootFolders,
			extraFiles: config.extraFiles,
			includePattern: config.includePattern,
			excludePattern: config.excludePattern,
			filePattern: config.filePattern,
			maxFilesize: MAX_FILE_SIZE
		}));

		return this.doSearch(engine);
	}

	private doSearch(engine: ISearchEngine): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
			engine.search((match) => {
				if (match) {
					p(match);
				}
			}, (progress) => {
				p(progress);
			}, (error, isLimitHit) => {
				if (error) {
					e(error);
				} else {
					c({
						limitHit: isLimitHit
					});
				}
			});
		}, () => engine.cancel());
	}
}