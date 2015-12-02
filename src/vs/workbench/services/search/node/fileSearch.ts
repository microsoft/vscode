/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');
import paths = require('path');

import types = require('vs/base/common/types');
import filters = require('vs/base/common/filters');
import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');
import glob = require('vs/base/common/glob');
import {IProgress, IPatternInfo} from 'vs/platform/search/common/search';

import extfs = require('vs/base/node/extfs');
import flow = require('vs/base/node/flow');
import {ISerializedFileMatch, IRawSearch, ISearchEngine} from 'vs/workbench/services/search/node/rawSearchService';

export class FileWalker {

	private static ENOTDIR = 'ENOTDIR';

	private config: IRawSearch;
	private filePattern: string;
	private excludePattern: glob.IExpression;
	private includePattern: glob.IExpression;
	private maxResults: number;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled: boolean;

	private walkedPaths: { [path: string]: boolean; };

	constructor(config: IRawSearch) {
		this.config = config;
		this.filePattern = config.filePattern;
		this.excludePattern = config.excludePattern;
		this.includePattern = config.includePattern;
		this.maxResults = config.maxResults || null;
		this.walkedPaths = Object.create(null);
	}

	private resetState(): void {
		this.walkedPaths = Object.create(null); // reset
		this.resultCount = 0;
		this.isLimitHit = false;
	}

	public cancel(): void {
		this.isCanceled = true;
	}

	public walk(rootPaths: string[], onResult: (result: ISerializedFileMatch) => void, done: (error: Error, isLimitHit: boolean) => void): void {

		// Reset state
		this.resetState();

		// For each source
		flow.parallel(rootPaths, (absolutePath, perEntryCallback) => {

			// Try to Read as folder
			extfs.readdir(absolutePath, (error: Error, files: string[]) => {
				if (this.isCanceled || this.isLimitHit) {
					return perEntryCallback(null, null);
				}

				// Handle Directory
				if (!error) {
					return this.doWalk(absolutePath, '', files, onResult, perEntryCallback);
				}

				// Not a folder - deal with file result then
				if ((<any>error).code === FileWalker.ENOTDIR && !this.isCanceled && !this.isLimitHit) {

					// Check exclude pattern
					if (glob.match(this.excludePattern, absolutePath)) {
						return perEntryCallback(null, null);
					}

					// Check for match on file pattern and include pattern
					if (this.isFilePatternMatch(paths.basename(absolutePath)) && (!this.includePattern || glob.match(this.includePattern, absolutePath))) {
						this.resultCount++;

						if (this.maxResults && this.resultCount > this.maxResults) {
							this.isLimitHit = true;
						}

						if (!this.isLimitHit) {
							onResult({
								path: absolutePath
							});
						}
					}
				}

				// Unwind
				return perEntryCallback(null, null);
			});
		}, (err, result) => {
			done(err ? err[0] : null, this.isLimitHit);
		});
	}

	private doWalk(absolutePath: string, relativeParentPath: string, files: string[], onResult: (result: ISerializedFileMatch) => void, done: (error: Error, result: any) => void): void {

		// Execute tasks on each file in parallel to optimize throughput
		flow.parallel(files, (file: string, clb: (error: Error) => void): void => {

			// Check canceled
			if (this.isCanceled || this.isLimitHit) {
				return clb(null);
			}

			// If the user searches for the exact file name, we adjust the glob matching
			// to ignore filtering by siblings because the user seems to know what she
			// is searching for and we want to include the result in that case anyway
			let siblings = files;
			if (this.config.filePattern === file) {
				siblings = [];
			}

			// Check exclude pattern
			let relativeFilePath = strings.trim([relativeParentPath, file].join('/'), '/');
			if (glob.match(this.excludePattern, relativeFilePath, siblings)) {
				return clb(null);
			}

			// Try to read dir
			let currentPath = paths.join(absolutePath, file);
			extfs.readdir(currentPath, (error: Error, children: string[]): void => {

				// Handle directory
				if (!error) {

					// to really prevent loops with links we need to resolve the real path of them
					return this.realPathLink(currentPath, (error, realpath) => {
						if (error) {
							return clb(null); // ignore errors
						}

						if (this.walkedPaths[realpath]) {
							return clb(null); // escape when there are cycles (can happen with symlinks)
						} else {
							this.walkedPaths[realpath] = true; // remember as walked
						}

						// Continue walking
						this.doWalk(currentPath, relativeFilePath, children, onResult, clb);
					});
				}

				// Handle file if we are not canceled and have not hit the limit yet
				if ((<any>error).code === FileWalker.ENOTDIR && !this.isCanceled && !this.isLimitHit) {

					// Check for match on file pattern and include pattern
					if (this.isFilePatternMatch(file) && (!this.includePattern || glob.match(this.includePattern, relativeFilePath, children))) {
						this.resultCount++;

						if (this.maxResults && this.resultCount > this.maxResults) {
							this.isLimitHit = true;
						}

						if (!this.isLimitHit) {
							onResult({
								path: currentPath
							});
						}
					}
				}

				// Unwind
				return clb(null);
			});
		}, (error: Error[]): void => {
			if (error) {
				error = arrays.coalesce(error); // find any error by removing null values first
			}

			return done(error && error.length > 0 ? error[0] : null, null);
		});
	}

	private isFilePatternMatch(path: string): boolean {

		// Check for search pattern
		if (this.filePattern) {
			const res = filters.matchesFuzzy(this.filePattern, path);

			return !!res && res.length > 0;
		}

		// No patterns means we match all
		return true;
	}

	private realPathLink(path: string, clb: (error: Error, realpath?: string) => void): void {
		return fs.lstat(path, (error, lstat) => {
			if (error) {
				return clb(error);
			}

			if (lstat.isSymbolicLink()) {
				return fs.realpath(path, (error, realpath) => {
					if (error) {
						return clb(error);
					}

					return clb(null, realpath);
				});
			}

			return clb(null, path);
		});
	}
}

export class Engine implements ISearchEngine {
	private rootPaths: string[];
	private walker: FileWalker;

	constructor(config: IRawSearch) {
		this.rootPaths = config.rootPaths;
		this.walker = new FileWalker(config);
	}

	public search(onResult: (result: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, isLimitHit: boolean) => void): void {
		this.walker.walk(this.rootPaths, onResult, done);
	}

	public cancel(): void {
		this.walker.cancel();
	}
}