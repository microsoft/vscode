/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as childProcess from 'child_process';
import {StringDecoder} from 'string_decoder';
import fs = require('fs');
import paths = require('path');
import {Readable} from "stream";

import scorer = require('vs/base/common/scorer');
import arrays = require('vs/base/common/arrays');
import platform = require('vs/base/common/platform');
import strings = require('vs/base/common/strings');
import types = require('vs/base/common/types');
import glob = require('vs/base/common/glob');
import {IProgress, IUncachedSearchStats} from 'vs/platform/search/common/search';

import extfs = require('vs/base/node/extfs');
import flow = require('vs/base/node/flow');
import {IRawFileMatch, ISerializedSearchComplete, IRawSearch, ISearchEngine} from './search';

enum Traversal {
	Node = 1,
	MacFind,
	WindowsDir,
	LinuxFind
}

interface IDirectoryEntry {
	relativePath: string;
	basename: string;
}

interface IDirectoryTree {
	rootEntries: IDirectoryEntry[];
	pathToEntries: { [relativePath: string]: IDirectoryEntry[] };
}

export class FileWalker {
	private config: IRawSearch;
	private filePattern: string;
	private normalizedFilePatternLowercase: string;
	private excludePattern: glob.ParsedExpression;
	private includePattern: glob.ParsedExpression;
	private maxResults: number;
	private maxFilesize: number;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled: boolean;
	private fileWalkStartTime: number;
	private directoriesWalked: number;
	private filesWalked: number;
	private traversal: Traversal;
	private errors: string[];
	private cmdForkStartTime: number;
	private cmdForkResultTime: number;
	private cmdResultCount: number;

	private walkedPaths: { [path: string]: boolean; };

	constructor(config: IRawSearch) {
		this.config = config;
		this.filePattern = config.filePattern;
		this.excludePattern = glob.parse(config.excludePattern);
		this.includePattern = config.includePattern && glob.parse(config.includePattern);
		this.maxResults = config.maxResults || null;
		this.maxFilesize = config.maxFilesize || null;
		this.walkedPaths = Object.create(null);
		this.resultCount = 0;
		this.isLimitHit = false;
		this.directoriesWalked = 0;
		this.filesWalked = 0;
		this.traversal = Traversal.Node;
		this.errors = [];

		if (this.filePattern) {
			this.normalizedFilePatternLowercase = strings.stripWildcards(this.filePattern).toLowerCase();
		}
	}

	public cancel(): void {
		this.isCanceled = true;
	}

	public walk(rootFolders: string[], extraFiles: string[], onResult: (result: IRawFileMatch) => void, done: (error: Error, isLimitHit: boolean) => void): void {
		this.fileWalkStartTime = Date.now();

		// Support that the file pattern is a full path to a file that exists
		this.checkFilePatternAbsoluteMatch((exists, size) => {
			if (this.isCanceled) {
				return done(null, this.isLimitHit);
			}

			// Report result from file pattern if matching
			if (exists) {
				this.resultCount++;
				onResult({
					path: this.filePattern,
					size
				});

				// Optimization: a match on an absolute path is a good result and we do not
				// continue walking the entire root paths array for other matches because
				// it is very unlikely that another file would match on the full absolute path
				return done(null, this.isLimitHit);
			}

			// For each extra file
			if (extraFiles) {
				extraFiles.forEach(extraFilePath => {
					if (this.excludePattern(extraFilePath)) {
						return; // excluded
					}

					// File: Check for match on file pattern and include pattern
					this.matchFile(onResult, null, extraFilePath /* no workspace relative path */);
				});
			}

			let traverse = this.nodeJSTraversal;
			if (!this.maxFilesize) {
				if (platform.isMacintosh) {
					this.traversal = Traversal.MacFind;
					traverse = this.macFindTraversal;
				} else if (platform.isWindows) {
					this.traversal = Traversal.WindowsDir;
					traverse = this.windowsDirTraversal;
				} else if (platform.isLinux) {
					this.traversal = Traversal.LinuxFind;
					traverse = this.linuxFindTraversal;
				}
			}

			const isNodeTraversal = traverse === this.nodeJSTraversal;
			if (!isNodeTraversal) {
				this.cmdForkStartTime = Date.now();
			}

			// For each root folder
			flow.parallel(rootFolders, (rootFolder, rootFolderDone: (err?: Error) => void) => {
				traverse.call(this, rootFolder, onResult, err => {
					if (err) {
						if (isNodeTraversal) {
							rootFolderDone(err);
						} else {
							// fallback
							this.errors.push(String(err));
							this.nodeJSTraversal(rootFolder, onResult, rootFolderDone);
						}
					} else {
						rootFolderDone();
					}
				});
			}, (err, result) => {
				done(err ? err[0] : null, this.isLimitHit);
			});
		});
	}

	private macFindTraversal(rootFolder: string, onResult: (result: IRawFileMatch) => void, done: (err?: Error) => void): void {
		const cmd = childProcess.spawn('find', ['-L', '.', '-type', 'f'], { cwd: rootFolder });
		this.readStdout(cmd, 'utf8', (err: Error, stdout?: string) => {
			if (err) {
				done(err);
				return;
			}

			// Mac: uses NFD unicode form on disk, but we want NFC
			const relativeFiles = strings.normalizeNFC(stdout).split('\n./');
			relativeFiles[0] = relativeFiles[0].trim().substr(2);
			const n = relativeFiles.length;
			relativeFiles[n - 1] = relativeFiles[n - 1].trim();
			if (!relativeFiles[n - 1]) {
				relativeFiles.pop();
			}

			this.matchFiles(rootFolder, relativeFiles, onResult);

			done();
		});
	}

	private windowsDirTraversal(rootFolder: string, onResult: (result: IRawFileMatch) => void, done: (err?: Error) => void): void {
		const cmd = childProcess.spawn('cmd', ['/U', '/c', 'dir', '/s', '/b', '/a-d'], { cwd: rootFolder });
		this.readStdout(cmd, 'ucs2', (err: Error, stdout?: string) => {
			if (err) {
				done(err);
				return;
			}

			const relativeFiles = stdout.split(`\r\n${rootFolder}\\`);
			relativeFiles[0] = relativeFiles[0].trim().substr(rootFolder.length + 1);
			const n = relativeFiles.length;
			relativeFiles[n - 1] = relativeFiles[n - 1].trim();
			if (!relativeFiles[n - 1]) {
				relativeFiles.pop();
			}

			this.matchFiles(rootFolder, relativeFiles, onResult);

			done();
		});
	}

	private linuxFindTraversal(rootFolder: string, onResult: (result: IRawFileMatch) => void, done: (err?: Error) => void): void {
		const cmd = childProcess.spawn('find', ['-L', '.', '-type', 'f'], { cwd: rootFolder });
		this.readStdout(cmd, 'utf8', (err: Error, stdout?: string) => {
			if (err) {
				done(err);
				return;
			}

			const relativeFiles = stdout.split('\n./');
			relativeFiles[0] = relativeFiles[0].trim().substr(2);
			const n = relativeFiles.length;
			relativeFiles[n - 1] = relativeFiles[n - 1].trim();
			if (!relativeFiles[n - 1]) {
				relativeFiles.pop();
			}

			this.matchFiles(rootFolder, relativeFiles, onResult);

			done();
		});
	}

	private readStdout(cmd: childProcess.ChildProcess, encoding: string, cb: (err: Error, stdout?: string) => void): void {
		let done = (err: Error, stdout?: string) => {
			done = () => {};
			this.cmdForkResultTime = Date.now();
			cb(err, stdout);
		};

		const stdout = this.collectData(cmd.stdout);
		const stderr = this.collectData(cmd.stderr);

		cmd.on('error', err => {
			done(err);
		});

		cmd.on('close', code => {
			if (code !== 0) {
				done(new Error(`find failed with error code ${code}: ${this.decodeData(stderr, encoding)}`));
			} else {
				done(null, this.decodeData(stdout, encoding));
			}
		});
	}

	private collectData(stream: Readable): Buffer[] {
		const buffers = [];
		stream.on('data', data => {
			buffers.push(data);
		});
		return buffers;
	}

	private decodeData(buffers: Buffer[], encoding: string): string {
		const decoder = new StringDecoder(encoding);
		return buffers.map(buffer => decoder.write(buffer)).join('');
	}

	private matchFiles(rootFolder: string, relativeFiles: string[], onResult: (result: IRawFileMatch) => void) {
		this.cmdResultCount = relativeFiles.length;

		// Support relative paths to files from a root resource (ignores excludes)
		if (relativeFiles.indexOf(this.filePattern) !== -1) {
			this.matchFile(onResult, rootFolder, this.filePattern);
		}

		const tree = this.buildDirectoryTree(relativeFiles);
		this.matchDirectoryTree(rootFolder, tree, onResult);
	}

	private buildDirectoryTree(relativeFilePaths: string[]): IDirectoryTree {
		const tree: IDirectoryTree = {
			rootEntries: [],
			pathToEntries: Object.create(null)
		};
		const {pathToEntries} = tree;
		pathToEntries['.'] = tree.rootEntries;
		relativeFilePaths.forEach(function add(relativePath: string) {
			const basename = paths.basename(relativePath);
			const dirname = paths.dirname(relativePath);
			let entries = pathToEntries[dirname];
			if (!entries) {
				entries = pathToEntries[dirname] = [];
				add(dirname);
			}
			entries.push({
				relativePath,
				basename
			});
		});
		return tree;
	}

	private matchDirectoryTree(rootFolder: string, { rootEntries, pathToEntries }: IDirectoryTree, onResult: (result: IRawFileMatch) => void) {
		const self = this;
		const excludePattern = this.excludePattern;
		const filePattern = this.filePattern;
		function matchDirectory(entries: IDirectoryEntry[]) {
			self.directoriesWalked++;
			for (let i = 0, n = entries.length; i < n; i++) {
				const entry = entries[i];
				const relativePath = entry.relativePath;

				// Check exclude pattern
				// If the user searches for the exact file name, we adjust the glob matching
				// to ignore filtering by siblings because the user seems to know what she
				// is searching for and we want to include the result in that case anyway
				if (excludePattern(relativePath, () => filePattern !== entry.basename ? entries.map(entry => entry.basename) : [])) {
					continue;
				}

				const sub = pathToEntries[relativePath];
				if (sub) {
					matchDirectory(sub);
				} else {
					self.filesWalked++;
					if (relativePath === filePattern) {
						continue; // ignore file if its path matches with the file pattern because that is already matched above
					}

					self.matchFile(onResult, rootFolder, relativePath);
				}
			};
		}
		matchDirectory(rootEntries);
	}

	private nodeJSTraversal(rootFolder: string, onResult: (result: IRawFileMatch) => void, done: (err?: Error) => void): void {
		this.directoriesWalked++;
		extfs.readdir(rootFolder, (error: Error, files: string[]) => {
			if (error || this.isCanceled || this.isLimitHit) {
				return done();
			}

			// Support relative paths to files from a root resource (ignores excludes)
			return this.checkFilePatternRelativeMatch(rootFolder, (match, size) => {
				if (this.isCanceled || this.isLimitHit) {
					return done();
				}

				// Report result from file pattern if matching
				if (match) {
					this.resultCount++;
					onResult({
						base: rootFolder,
						path: this.filePattern,
						size
					});
				}

				return this.doWalk(rootFolder, '', files, onResult, done);
			});
		});
	}

	public getStats(): IUncachedSearchStats {
		return {
			fromCache: false,
			traversal: Traversal[this.traversal],
			errors: this.errors,
			fileWalkStartTime: this.fileWalkStartTime,
			fileWalkResultTime: Date.now(),
			directoriesWalked: this.directoriesWalked,
			filesWalked: this.filesWalked,
			resultCount: this.resultCount,
			cmdForkStartTime: this.cmdForkStartTime,
			cmdForkResultTime: this.cmdForkResultTime,
			cmdResultCount: this.cmdResultCount
		};
	}

	private checkFilePatternAbsoluteMatch(clb: (exists: boolean, size?: number) => void): void {
		if (!this.filePattern || !paths.isAbsolute(this.filePattern)) {
			return clb(false);
		}

		return fs.stat(this.filePattern, (error, stat) => {
			return clb(!error && !stat.isDirectory(), stat && stat.size); // only existing files
		});
	}

	private checkFilePatternRelativeMatch(basePath: string, clb: (matchPath: string, size?: number) => void): void {
		if (!this.filePattern || paths.isAbsolute(this.filePattern)) {
			return clb(null);
		}

		const absolutePath = paths.join(basePath, this.filePattern);

		return fs.stat(absolutePath, (error, stat) => {
			return clb(!error && !stat.isDirectory() ? absolutePath : null, stat && stat.size); // only existing files
		});
	}

	private doWalk(rootFolder: string, relativeParentPath: string, files: string[], onResult: (result: IRawFileMatch) => void, done: (error: Error) => void): void {

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
			let currentRelativePath = relativeParentPath ? [relativeParentPath, file].join(paths.sep) : file;
			if (this.excludePattern(currentRelativePath, () => siblings)) {
				return clb(null);
			}

			// Use lstat to detect links
			let currentAbsolutePath = [rootFolder, currentRelativePath].join(paths.sep);
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
						this.directoriesWalked++;

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

								this.doWalk(rootFolder, currentRelativePath, children, onResult, clb);
							});
						});
					}

					// File: Check for match on file pattern and include pattern
					else {
						this.filesWalked++;
						if (currentRelativePath === this.filePattern) {
							return clb(null); // ignore file if its path matches with the file pattern because checkFilePatternRelativeMatch() takes care of those
						}

						if (this.maxFilesize && types.isNumber(stat.size) && stat.size > this.maxFilesize) {
							return clb(null); // ignore file if max file size is hit
						}

						this.matchFile(onResult, rootFolder, currentRelativePath, stat.size);
					}

					// Unwind
					return clb(null);
				});
			});
		}, (error: Error[]): void => {
			if (error) {
				error = arrays.coalesce(error); // find any error by removing null values first
			}

			return done(error && error.length > 0 ? error[0] : null);
		});
	}

	private matchFile(onResult: (result: IRawFileMatch) => void, base: string, path: string, size?: number): void {
		if (this.isFilePatternMatch(path) && (!this.includePattern || this.includePattern(path))) {
			this.resultCount++;

			if (this.maxResults && this.resultCount > this.maxResults) {
				this.isLimitHit = true;
			}

			if (!this.isLimitHit) {
				onResult({
					base,
					path,
					size
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

export class Engine implements ISearchEngine<IRawFileMatch> {
	private rootFolders: string[];
	private extraFiles: string[];
	private walker: FileWalker;

	constructor(config: IRawSearch) {
		this.rootFolders = config.rootFolders;
		this.extraFiles = config.extraFiles;

		this.walker = new FileWalker(config);
	}

	public search(onResult: (result: IRawFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		this.walker.walk(this.rootFolders, this.extraFiles, onResult, (err: Error, isLimitHit: boolean) => {
			done(err, {
				limitHit: isLimitHit,
				stats: this.walker.getStats()
			});
		});
	}

	public cancel(): void {
		this.walker.cancel();
	}
}