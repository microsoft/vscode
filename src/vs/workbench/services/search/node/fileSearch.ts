/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as childProcess from 'child_process';
import { StringDecoder, NodeStringDecoder } from 'string_decoder';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import fs = require('fs');
import path = require('path');
import { isEqualOrParent } from 'vs/base/common/paths';
import { Readable } from 'stream';
import { TPromise } from 'vs/base/common/winjs.base';

import scorer = require('vs/base/common/scorer');
import objects = require('vs/base/common/objects');
import arrays = require('vs/base/common/arrays');
import platform = require('vs/base/common/platform');
import strings = require('vs/base/common/strings');
import types = require('vs/base/common/types');
import glob = require('vs/base/common/glob');
import { IProgress, IUncachedSearchStats } from 'vs/platform/search/common/search';

import extfs = require('vs/base/node/extfs');
import flow = require('vs/base/node/flow');
import { IRawFileMatch, ISerializedSearchComplete, IRawSearch, ISearchEngine, IFolderSearch } from './search';

enum Traversal {
	Node = 1,
	MacFind,
	WindowsDir,
	LinuxFind
}

interface IDirectoryEntry {
	base: string;
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

	private folderExcludePatterns: Map<string, AbsoluteAndRelativeParsedExpression>;
	private globalExcludePattern: glob.ParsedExpression;

	private walkedPaths: { [path: string]: boolean; };

	constructor(config: IRawSearch) {
		this.config = config;
		this.filePattern = config.filePattern;
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

		this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern);
		this.folderExcludePatterns = new Map<string, AbsoluteAndRelativeParsedExpression>();

		config.folderQueries.forEach(folderQuery => {
			const folderExcludeExpression: glob.IExpression = objects.assign({}, folderQuery.excludePattern || {}, this.config.excludePattern || {});

			// Add excludes for other root folders
			config.folderQueries
				.map(rootFolderQuery => rootFolderQuery.folder)
				.filter(rootFolder => rootFolder !== folderQuery.folder)
				.forEach(otherRootFolder => {
					// Exclude nested root folders
					if (isEqualOrParent(otherRootFolder, folderQuery.folder)) {
						folderExcludeExpression[path.relative(folderQuery.folder, otherRootFolder)] = true;
					}
				});

			this.folderExcludePatterns.set(folderQuery.folder, new AbsoluteAndRelativeParsedExpression(folderExcludeExpression, folderQuery.folder));
		});
	}

	public cancel(): void {
		this.isCanceled = true;
	}

	public walk(folderQueries: IFolderSearch[], extraFiles: string[], onResult: (result: IRawFileMatch) => void, done: (error: Error, isLimitHit: boolean) => void): void {
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
					relativePath: this.filePattern,
					basename: path.basename(this.filePattern),
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
					const basename = path.basename(extraFilePath);
					if (this.globalExcludePattern && this.globalExcludePattern(extraFilePath, basename)) {
						return; // excluded
					}

					// File: Check for match on file pattern and include pattern
					this.matchFile(onResult, { relativePath: extraFilePath /* no workspace relative path */, basename });
				});
			}

			let traverse = this.nodeJSTraversal;
			if (!this.maxFilesize) {
				if (platform.isMacintosh) {
					this.traversal = Traversal.MacFind;
					traverse = this.findTraversal;
					// Disable 'dir' for now (#11181, #11179, #11183, #11182).
				} /* else if (platform.isWindows) {
					this.traversal = Traversal.WindowsDir;
					traverse = this.windowsDirTraversal;
				} */ else if (platform.isLinux) {
					this.traversal = Traversal.LinuxFind;
					traverse = this.findTraversal;
				}
			}

			const isNodeTraversal = traverse === this.nodeJSTraversal;
			if (!isNodeTraversal) {
				this.cmdForkStartTime = Date.now();
			}

			// For each root folder
			flow.parallel<IFolderSearch, void>(folderQueries, (folderQuery: IFolderSearch, rootFolderDone: (err: Error, result: void) => void) => {
				this.call(traverse, this, folderQuery, onResult, (err?: Error) => {
					if (err) {
						if (isNodeTraversal) {
							rootFolderDone(err, undefined);
						} else {
							// fallback
							const errorMessage = toErrorMessage(err);
							console.error(errorMessage);
							this.errors.push(errorMessage);
							this.nodeJSTraversal(folderQuery, onResult, err => rootFolderDone(err, undefined));
						}
					} else {
						rootFolderDone(undefined, undefined);
					}
				});
			}, (err, result) => {
				done(err ? err[0] : null, this.isLimitHit);
			});
		});
	}

	private call(fun: Function, that: any, ...args: any[]): void {
		try {
			fun.apply(that, args);
		} catch (e) {
			args[args.length - 1](e);
		}
	}

	private findTraversal(folderQuery: IFolderSearch, onResult: (result: IRawFileMatch) => void, cb: (err?: Error) => void): void {
		const rootFolder = folderQuery.folder;
		const isMac = platform.isMacintosh;
		let done = (err?: Error) => {
			done = () => { };
			cb(err);
		};
		let leftover = '';
		let first = true;
		const tree = this.initDirectoryTree();
		const cmd = this.spawnFindCmd(folderQuery);
		this.collectStdout(cmd, 'utf8', (err: Error, stdout?: string, last?: boolean) => {
			if (err) {
				done(err);
				return;
			}

			// Mac: uses NFD unicode form on disk, but we want NFC
			const normalized = leftover + (isMac ? strings.normalizeNFC(stdout) : stdout);
			const relativeFiles = normalized.split('\n./');
			if (first && normalized.length >= 2) {
				first = false;
				relativeFiles[0] = relativeFiles[0].trim().substr(2);
			}

			if (last) {
				const n = relativeFiles.length;
				relativeFiles[n - 1] = relativeFiles[n - 1].trim();
				if (!relativeFiles[n - 1]) {
					relativeFiles.pop();
				}
			} else {
				leftover = relativeFiles.pop();
			}

			if (relativeFiles.length && relativeFiles[0].indexOf('\n') !== -1) {
				done(new Error('Splitting up files failed'));
				return;
			}

			this.addDirectoryEntries(tree, rootFolder, relativeFiles, onResult);

			if (last) {
				this.matchDirectoryTree(tree, rootFolder, onResult);
				done();
			}
		});
	}

	// protected windowsDirTraversal(rootFolder: string, onResult: (result: IRawFileMatch) => void, done: (err?: Error) => void): void {
	// 	const cmd = childProcess.spawn('cmd', ['/U', '/c', 'dir', '/s', '/b', '/a-d', rootFolder]);
	// 	this.readStdout(cmd, 'ucs2', (err: Error, stdout?: string) => {
	// 		if (err) {
	// 			done(err);
	// 			return;
	// 		}

	// 		const relativeFiles = stdout.split(`\r\n${rootFolder}\\`);
	// 		relativeFiles[0] = relativeFiles[0].trim().substr(rootFolder.length + 1);
	// 		const n = relativeFiles.length;
	// 		relativeFiles[n - 1] = relativeFiles[n - 1].trim();
	// 		if (!relativeFiles[n - 1]) {
	// 			relativeFiles.pop();
	// 		}

	// 		if (relativeFiles.length && relativeFiles[0].indexOf('\n') !== -1) {
	// 			done(new Error('Splitting up files failed'));
	// 			return;
	// 		}

	// 		this.matchFiles(rootFolder, relativeFiles, onResult);

	// 		done();
	// 	});
	// }

	/**
	 * Public for testing.
	 */
	public spawnFindCmd(folderQuery: IFolderSearch) {
		const excludePattern = this.folderExcludePatterns.get(folderQuery.folder);
		const basenames = excludePattern.getBasenameTerms();
		const pathTerms = excludePattern.getPathTerms();
		let args = ['-L', '.'];
		if (basenames.length || pathTerms.length) {
			args.push('-not', '(', '(');
			for (const basename of basenames) {
				args.push('-name', basename);
				args.push('-o');
			}
			for (const path of pathTerms) {
				args.push('-path', path);
				args.push('-o');
			}
			args.pop();
			args.push(')', '-prune', ')');
		}
		args.push('-type', 'f');
		return childProcess.spawn('find', args, { cwd: folderQuery.folder });
	}

	/**
	 * Public for testing.
	 */
	public readStdout(cmd: childProcess.ChildProcess, encoding: string, cb: (err: Error, stdout?: string) => void): void {
		let all = '';
		this.collectStdout(cmd, encoding, (err: Error, stdout?: string, last?: boolean) => {
			if (err) {
				cb(err);
				return;
			}

			all += stdout;
			if (last) {
				cb(null, all);
			}
		});
	}

	private collectStdout(cmd: childProcess.ChildProcess, encoding: string, cb: (err: Error, stdout?: string, last?: boolean) => void): void {
		let done = (err: Error, stdout?: string, last?: boolean) => {
			if (err || last) {
				done = () => { };
				this.cmdForkResultTime = Date.now();
			}
			cb(err, stdout, last);
		};

		this.forwardData(cmd.stdout, encoding, done);
		const stderr = this.collectData(cmd.stderr);

		cmd.on('error', (err: Error) => {
			done(err);
		});

		cmd.on('close', (code: number) => {
			if (code !== 0) {
				done(new Error(`find failed with error code ${code}: ${this.decodeData(stderr, encoding)}`));
			} else {
				done(null, '', true);
			}
		});
	}

	private forwardData(stream: Readable, encoding: string, cb: (err: Error, stdout?: string) => void): NodeStringDecoder {
		const decoder = new StringDecoder(encoding);
		stream.on('data', (data: Buffer) => {
			cb(null, decoder.write(data));
		});
		return decoder;
	}

	private collectData(stream: Readable): Buffer[] {
		const buffers: Buffer[] = [];
		stream.on('data', (data: Buffer) => {
			buffers.push(data);
		});
		return buffers;
	}

	private decodeData(buffers: Buffer[], encoding: string): string {
		const decoder = new StringDecoder(encoding);
		return buffers.map(buffer => decoder.write(buffer)).join('');
	}

	private initDirectoryTree(): IDirectoryTree {
		const tree: IDirectoryTree = {
			rootEntries: [],
			pathToEntries: Object.create(null)
		};
		tree.pathToEntries['.'] = tree.rootEntries;
		return tree;
	}

	private addDirectoryEntries({ pathToEntries }: IDirectoryTree, base: string, relativeFiles: string[], onResult: (result: IRawFileMatch) => void) {
		this.cmdResultCount += relativeFiles.length;

		// Support relative paths to files from a root resource (ignores excludes)
		if (relativeFiles.indexOf(this.filePattern) !== -1) {
			const basename = path.basename(this.filePattern);
			this.matchFile(onResult, { base: base, relativePath: this.filePattern, basename });
		}

		function add(relativePath: string) {
			const basename = path.basename(relativePath);
			const dirname = path.dirname(relativePath);
			let entries = pathToEntries[dirname];
			if (!entries) {
				entries = pathToEntries[dirname] = [];
				add(dirname);
			}
			entries.push({
				base,
				relativePath,
				basename
			});
		}
		relativeFiles.forEach(add);
	}

	private matchDirectoryTree({ rootEntries, pathToEntries }: IDirectoryTree, rootFolder: string, onResult: (result: IRawFileMatch) => void) {
		const self = this;
		const excludePattern = this.folderExcludePatterns.get(rootFolder);
		const filePattern = this.filePattern;
		function matchDirectory(entries: IDirectoryEntry[]) {
			self.directoriesWalked++;
			for (let i = 0, n = entries.length; i < n; i++) {
				const entry = entries[i];
				const { relativePath, basename } = entry;

				// Check exclude pattern
				// If the user searches for the exact file name, we adjust the glob matching
				// to ignore filtering by siblings because the user seems to know what she
				// is searching for and we want to include the result in that case anyway
				if (excludePattern.test(relativePath, basename, () => filePattern !== basename ? entries.map(entry => entry.basename) : [])) {
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

					self.matchFile(onResult, entry);
				}
			};
		}
		matchDirectory(rootEntries);
	}

	private nodeJSTraversal(folderQuery: IFolderSearch, onResult: (result: IRawFileMatch) => void, done: (err?: Error) => void): void {
		this.directoriesWalked++;
		extfs.readdir(folderQuery.folder, (error: Error, files: string[]) => {
			if (error || this.isCanceled || this.isLimitHit) {
				return done();
			}

			// Support relative paths to files from a root resource (ignores excludes)
			return this.checkFilePatternRelativeMatch(folderQuery.folder, (match, size) => {
				if (this.isCanceled || this.isLimitHit) {
					return done();
				}

				// Report result from file pattern if matching
				if (match) {
					this.resultCount++;
					onResult({
						base: folderQuery.folder,
						relativePath: this.filePattern,
						basename: path.basename(this.filePattern),
						size
					});
				}

				return this.doWalk(folderQuery, '', files, onResult, done);
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
		if (!this.filePattern || !path.isAbsolute(this.filePattern)) {
			return clb(false);
		}

		return fs.stat(this.filePattern, (error, stat) => {
			return clb(!error && !stat.isDirectory(), stat && stat.size); // only existing files
		});
	}

	private checkFilePatternRelativeMatch(basePath: string, clb: (matchPath: string, size?: number) => void): void {
		if (!this.filePattern || path.isAbsolute(this.filePattern)) {
			return clb(null);
		}

		const absolutePath = path.join(basePath, this.filePattern);

		return fs.stat(absolutePath, (error, stat) => {
			return clb(!error && !stat.isDirectory() ? absolutePath : null, stat && stat.size); // only existing files
		});
	}

	private doWalk(folderQuery: IFolderSearch, relativeParentPath: string, files: string[], onResult: (result: IRawFileMatch) => void, done: (error: Error) => void): void {
		const rootFolder = folderQuery.folder;

		// Execute tasks on each file in parallel to optimize throughput
		flow.parallel(files, (file: string, clb: (error: Error, result: {}) => void): void => {

			// Check canceled
			if (this.isCanceled || this.isLimitHit) {
				return clb(null, undefined);
			}

			// If the user searches for the exact file name, we adjust the glob matching
			// to ignore filtering by siblings because the user seems to know what she
			// is searching for and we want to include the result in that case anyway
			let siblings = files;
			if (this.config.filePattern === file) {
				siblings = [];
			}

			// Check exclude pattern
			let currentRelativePath = relativeParentPath ? [relativeParentPath, file].join(path.sep) : file;
			if (this.folderExcludePatterns.get(folderQuery.folder).test(currentRelativePath, file, () => siblings)) {
				return clb(null, undefined);
			}

			// Use lstat to detect links
			let currentAbsolutePath = [rootFolder, currentRelativePath].join(path.sep);
			fs.lstat(currentAbsolutePath, (error, lstat) => {
				if (error || this.isCanceled || this.isLimitHit) {
					return clb(null, undefined);
				}

				// If the path is a link, we must instead use fs.stat() to find out if the
				// link is a directory or not because lstat will always return the stat of
				// the link which is always a file.
				this.statLinkIfNeeded(currentAbsolutePath, lstat, (error, stat) => {
					if (error || this.isCanceled || this.isLimitHit) {
						return clb(null, undefined);
					}

					// Directory: Follow directories
					if (stat.isDirectory()) {
						this.directoriesWalked++;

						// to really prevent loops with links we need to resolve the real path of them
						return this.realPathIfNeeded(currentAbsolutePath, lstat, (error, realpath) => {
							if (error || this.isCanceled || this.isLimitHit) {
								return clb(null, undefined);
							}

							if (this.walkedPaths[realpath]) {
								return clb(null, undefined); // escape when there are cycles (can happen with symlinks)
							}

							this.walkedPaths[realpath] = true; // remember as walked

							// Continue walking
							return extfs.readdir(currentAbsolutePath, (error: Error, children: string[]): void => {
								if (error || this.isCanceled || this.isLimitHit) {
									return clb(null, undefined);
								}

								this.doWalk(folderQuery, currentRelativePath, children, onResult, err => clb(err, undefined));
							});
						});
					}

					// File: Check for match on file pattern and include pattern
					else {
						this.filesWalked++;
						if (currentRelativePath === this.filePattern) {
							return clb(null, undefined); // ignore file if its path matches with the file pattern because checkFilePatternRelativeMatch() takes care of those
						}

						if (this.maxFilesize && types.isNumber(stat.size) && stat.size > this.maxFilesize) {
							return clb(null, undefined); // ignore file if max file size is hit
						}

						this.matchFile(onResult, { base: rootFolder, relativePath: currentRelativePath, basename: file, size: stat.size });
					}

					// Unwind
					return clb(null, undefined);
				});
			});
		}, (error: Error[]): void => {
			if (error) {
				error = arrays.coalesce(error); // find any error by removing null values first
			}

			return done(error && error.length > 0 ? error[0] : null);
		});
	}

	private matchFile(onResult: (result: IRawFileMatch) => void, candidate: IRawFileMatch): void {
		if (this.isFilePatternMatch(candidate.relativePath) && (!this.includePattern || this.includePattern(candidate.relativePath, candidate.basename))) {
			this.resultCount++;

			if (this.maxResults && this.resultCount > this.maxResults) {
				this.isLimitHit = true;
			}

			if (!this.isLimitHit) {
				onResult(candidate);
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
	private folderQueries: IFolderSearch[];
	private extraFiles: string[];
	private walker: FileWalker;

	constructor(config: IRawSearch) {
		this.folderQueries = config.folderQueries;
		this.extraFiles = config.extraFiles;

		this.walker = new FileWalker(config);
	}

	public search(onResult: (result: IRawFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		this.walker.walk(this.folderQueries, this.extraFiles, onResult, (err: Error, isLimitHit: boolean) => {
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

/**
 * This class exists to provide one interface on top of two ParsedExpressions, one for absolute expressions and one for relative expressions.
 * The absolute and relative expressions don't "have" to be kept separate, but this keeps us from having to path.join every single
 * file searched, it's only used for a text search with a searchPath
 */
class AbsoluteAndRelativeParsedExpression {
	private absoluteParsedExpr: glob.ParsedExpression;
	private relativeParsedExpr: glob.ParsedExpression;

	constructor(expr: glob.IExpression, private root: string) {
		this.init(expr);
	}

	/**
	 * Split the IExpression into its absolute and relative components, and glob.parse them separately.
	 */
	private init(expr: glob.IExpression): void {
		let absoluteGlobExpr: glob.IExpression;
		let relativeGlobExpr: glob.IExpression;
		Object.keys(expr)
			.filter(key => expr[key])
			.forEach(key => {
				if (path.isAbsolute(key)) {
					absoluteGlobExpr = absoluteGlobExpr || glob.getEmptyExpression();
					absoluteGlobExpr[key] = true;
				} else {
					relativeGlobExpr = relativeGlobExpr || glob.getEmptyExpression();
					relativeGlobExpr[key] = true;
				}
			});

		this.absoluteParsedExpr = absoluteGlobExpr && glob.parse(absoluteGlobExpr, { trimForExclusions: true });
		this.relativeParsedExpr = relativeGlobExpr && glob.parse(relativeGlobExpr, { trimForExclusions: true });
	}

	public test(_path: string, basename?: string, siblingsFn?: () => string[] | TPromise<string[]>): string | TPromise<string> {
		return (this.relativeParsedExpr && this.relativeParsedExpr(_path, basename, siblingsFn)) ||
			(this.absoluteParsedExpr && this.absoluteParsedExpr(path.join(this.root, _path), basename, siblingsFn));
	}

	public getBasenameTerms(): string[] {
		const basenameTerms = [];
		if (this.absoluteParsedExpr) {
			basenameTerms.push(...glob.getBasenameTerms(this.absoluteParsedExpr));
		}

		if (this.relativeParsedExpr) {
			basenameTerms.push(...glob.getBasenameTerms(this.relativeParsedExpr));
		}

		return basenameTerms;
	}

	public getPathTerms(): string[] {
		const pathTerms = [];
		if (this.absoluteParsedExpr) {
			pathTerms.push(...glob.getPathTerms(this.absoluteParsedExpr));
		}

		if (this.relativeParsedExpr) {
			pathTerms.push(...glob.getPathTerms(this.relativeParsedExpr));
		}

		return pathTerms;
	}
}