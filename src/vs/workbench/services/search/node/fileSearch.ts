/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');
import paths = require('path');

import scorer = require('vs/base/common/scorer');
import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');
import types = require('vs/base/common/types');
import glob = require('vs/base/common/glob');
import {IProgress} from 'vs/platform/search/common/search';

import extfs = require('vs/base/node/extfs');
import flow = require('vs/base/node/flow');
import {ISerializedFileMatch, IRawSearch, ISearchEngine} from 'vs/workbench/services/search/node/rawSearchService';

export class FileWalker {
	private config: IRawSearch;
	private filePattern: string;
	private normalizedFilePatternLowercase: string;
	private excludePattern: glob.IExpression;
	private includePattern: glob.IExpression;
	private maxResults: number;
	private maxFilesize: number;
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
		this.maxFilesize = config.maxFilesize || null;
		this.walkedPaths = Object.create(null);
		this.resultCount = 0;
		this.isLimitHit = false;

		if (this.filePattern) {
			this.filePattern = this.filePattern.replace(/\\/g, '/'); // Normalize file patterns to forward slashes
			this.normalizedFilePatternLowercase = strings.stripWildcards(this.filePattern).toLowerCase();
		}
	}

	public cancel(): void {
		this.isCanceled = true;
	}

	public walk(rootFolders: string[], extraFiles: string[], onResult: (result: ISerializedFileMatch) => void, done: (error: Error, isLimitHit: boolean) => void): void {

		// Support that the file pattern is a full path to a file that exists
		this.checkFilePatternAbsoluteMatch((exists) => {
			if (this.isCanceled) {
				return done(null, this.isLimitHit);
			}

			// Report result from file pattern if matching
			if (exists) {
				onResult({ path: this.filePattern });

				// Optimization: a match on an absolute path is a good result and we do not
				// continue walking the entire root paths array for other matches because
				// it is very unlikely that another file would match on the full absolute path
				return done(null, this.isLimitHit);
			}

			// For each extra file
			if (extraFiles) {
				extraFiles.forEach(extraFilePath => {
					if (glob.match(this.excludePattern, extraFilePath)) {
						return; // excluded
					}

					// File: Check for match on file pattern and include pattern
					this.matchFile(onResult, extraFilePath, extraFilePath /* no workspace relative path */);
				});
			}

			// For each root folder
			flow.parallel(rootFolders, (absolutePath, perEntryCallback) => {
				extfs.readdir(absolutePath, (error: Error, files: string[]) => {
					if (error || this.isCanceled || this.isLimitHit) {
						return perEntryCallback(null, null);
					}

					// Support relative paths to files from a root resource
					return this.checkFilePatternRelativeMatch(absolutePath, (match) => {
						if (this.isCanceled || this.isLimitHit) {
							return perEntryCallback(null, null);
						}

						// Report result from file pattern if matching
						if (match) {
							onResult({ path: match });
						}

						return this.doWalk(paths.normalize(absolutePath), '', files, onResult, perEntryCallback);
					});
				});
			}, (err, result) => {
				done(err ? err[0] : null, this.isLimitHit);
			});
		});
	}

	private checkFilePatternAbsoluteMatch(clb: (exists: boolean) => void): void {
		if (!this.filePattern || !paths.isAbsolute(this.filePattern)) {
			return clb(false);
		}

		return fs.stat(this.filePattern, (error, stat) => {
			return clb(!error && !stat.isDirectory()); // only existing files
		});
	}

	private checkFilePatternRelativeMatch(basePath: string, clb: (matchPath: string) => void): void {
		if (!this.filePattern || paths.isAbsolute(this.filePattern)) {
			return clb(null);
		}

		const absolutePath = paths.join(basePath, this.filePattern);

		return fs.stat(absolutePath, (error, stat) => {
			return clb(!error && !stat.isDirectory() ? absolutePath : null); // only existing files
		});
	}

	private doWalk(absolutePath: string, relativeParentPathWithSlashes: string, files: string[], onResult: (result: ISerializedFileMatch) => void, done: (error: Error, result: any) => void): void {

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
			let currentRelativePathWithSlashes = relativeParentPathWithSlashes ? [relativeParentPathWithSlashes, file].join('/') : file;
			if (glob.match(this.excludePattern, currentRelativePathWithSlashes, siblings)) {
				return clb(null);
			}

			// Use lstat to detect links
			let currentAbsolutePath = [absolutePath, file].join(paths.sep);
			fs.lstat(currentAbsolutePath, (error, lstat) => {
				if (error || this.isCanceled || this.isLimitHit) {
					return clb(null);
				}

				// If the path is a link, we must instead use fs.stat() to find out if the
				// link is a directory or not because lstat will always return the stat of
				// the link which is always a file.
				this.statLinkIfNeeded(currentAbsolutePath, lstat, (error, stat) => {
					if (error || this.isCanceled || this.isLimitHit) {
						return clb(null);
					}

					// Directory: Follow directories
					if (stat.isDirectory()) {

						// to really prevent loops with links we need to resolve the real path of them
						return this.realPathIfNeeded(currentAbsolutePath, lstat, (error, realpath) => {
							if (error || this.isCanceled || this.isLimitHit) {
								return clb(null);
							}

							if (this.walkedPaths[realpath]) {
								return clb(null); // escape when there are cycles (can happen with symlinks)
							}

							this.walkedPaths[realpath] = true; // remember as walked

							// Continue walking
							return extfs.readdir(currentAbsolutePath, (error: Error, children: string[]): void => {
								if (error || this.isCanceled || this.isLimitHit) {
									return clb(null);
								}

								this.doWalk(currentAbsolutePath, currentRelativePathWithSlashes, children, onResult, clb);
							});
						});
					}

					// File: Check for match on file pattern and include pattern
					else {
						if (currentRelativePathWithSlashes === this.filePattern) {
							return clb(null); // ignore file if its path matches with the file pattern because checkFilePatternRelativeMatch() takes care of those
						}

						if (this.maxFilesize && types.isNumber(stat.size) && stat.size > this.maxFilesize) {
							return clb(null); // ignore file if max file size is hit
						}

						this.matchFile(onResult, currentAbsolutePath, currentRelativePathWithSlashes);
					}

					// Unwind
					return clb(null);
				});
			});
		}, (error: Error[]): void => {
			if (error) {
				error = arrays.coalesce(error); // find any error by removing null values first
			}

			return done(error && error.length > 0 ? error[0] : null, null);
		});
	}

	private matchFile(onResult: (result: ISerializedFileMatch) => void, absolutePath: string, relativePathWithSlashes: string): void {
		if (this.isFilePatternMatch(relativePathWithSlashes) && (!this.includePattern || glob.match(this.includePattern, relativePathWithSlashes))) {
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

	private isFilePatternMatch(path: string): boolean {

		// Check for search pattern
		if (this.filePattern) {
			if (this.filePattern === '*') {
				return true; // support the all-matching wildcard
			}

			return scorer.matches(path, this.normalizedFilePatternLowercase);
		}

		// No patterns means we match all
		return true;
	}

	private statLinkIfNeeded(path: string, lstat: fs.Stats, clb: (error: Error, stat: fs.Stats) => void): void {
		if (lstat.isSymbolicLink()) {
			return fs.stat(path, clb); // stat the target the link points to
		}

		return clb(null, lstat); // not a link, so the stat is already ok for us
	}

	private realPathIfNeeded(path: string, lstat: fs.Stats, clb: (error: Error, realpath?: string) => void): void {
		if (lstat.isSymbolicLink()) {
			return fs.realpath(path, (error, realpath) => {
				if (error) {
					return clb(error);
				}

				return clb(null, realpath);
			});
		}

		return clb(null, path);
	}
}

export class Engine implements ISearchEngine {
	private rootFolders: string[];
	private extraFiles: string[];
	private walker: FileWalker;

	constructor(config: IRawSearch) {
		this.rootFolders = config.rootFolders;
		this.extraFiles = config.extraFiles;

		this.walker = new FileWalker(config);
	}

	public search(onResult: (result: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, isLimitHit: boolean) => void): void {
		this.walker.walk(this.rootFolders, this.extraFiles, onResult, done);
	}

	public cancel(): void {
		this.walker.cancel();
	}
}