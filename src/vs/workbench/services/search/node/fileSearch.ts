/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as childProcess from 'child_process';
import * as path from '../../../../base/common/path.js';
import { Readable } from 'stream';
import { StringDecoder } from 'string_decoder';
import * as arrays from '../../../../base/common/arrays.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import * as glob from '../../../../base/common/glob.js';
import * as normalization from '../../../../base/common/normalization.js';
import { isEqualOrParent } from '../../../../base/common/extpath.js';
import * as platform from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import * as strings from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileQuery, IFolderQuery, IProgressMessage, ISearchEngineStats, IRawFileMatch, ISearchEngine, ISearchEngineSuccess, isFilePatternMatch, hasSiblingFn } from '../common/search.js';
import { spawnRipgrepCmd } from './ripgrepFileSearch.js';
import { MAX_RIPGREP_SYMLINK_LOOPS, RipgrepSymlinkLoopDetector } from './ripgrepSearchUtils.js';
import { prepareQuery } from '../../../../base/common/fuzzyScorer.js';

interface IDirectoryEntry extends IRawFileMatch {
	base: string;
	basename: string;
}

interface IDirectoryTree {
	rootEntries: IDirectoryEntry[];
	pathToEntries: { [relativePath: string]: IDirectoryEntry[] };
}

interface ITraversalOptions {

	/**
	 * Relative paths that were already reported by an earlier traversal of the folder.
	 */
	readonly pathsToSkip?: ReadonlySet<string>;

	/**
	 * Searches only the paths that these exclude exceptions re-include.
	 */
	readonly excludeExceptions?: readonly string[];

	/**
	 * Collects the relative paths that ripgrep returned, so that exception runs skip them.
	 */
	readonly seenPaths?: Set<string>;
}

const killCmds = new Set<() => void>();
process.on('exit', () => {
	killCmds.forEach(cmd => cmd());
});

type SpawnRipgrepCmd = typeof spawnRipgrepCmd;

export class FileWalker {
	private config: IFileQuery;
	private filePattern: string;
	private normalizedFilePatternLowercase: string | null = null;
	private includePattern: glob.ParsedExpression | undefined;
	private maxResults: number | null;
	private exists: boolean;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled = false;
	private fileWalkSW: StopWatch | null = null;
	private directoriesWalked: number;
	private filesWalked: number;
	private errors: string[];
	private cmdSW: StopWatch | null = null;
	private cmdResultCount: number = 0;
	private excludeExceptionRuns = 0;
	private excludeExceptionTime = 0;
	private readonly killCmds = new Set<() => void>();

	private folderExcludePatterns: Map<string, AbsoluteAndRelativeParsedExpression>;
	private readonly nestedRootFolders = new Map<string, string[]>();
	private globalExcludePattern: glob.ParsedExpression | undefined;

	constructor(config: IFileQuery, private readonly spawnRipgrep: SpawnRipgrepCmd = spawnRipgrepCmd) {
		this.config = config;
		this.filePattern = config.filePattern || '';
		const globOptions = config.ignoreGlobCase ? { ignoreCase: true } : undefined;
		this.includePattern = config.includePattern && glob.parse(config.includePattern, globOptions);
		this.maxResults = config.maxResults || null;
		this.exists = !!config.exists;
		this.resultCount = 0;
		this.isLimitHit = false;
		this.directoriesWalked = 0;
		this.filesWalked = 0;
		this.errors = [];

		if (this.filePattern) {
			this.normalizedFilePatternLowercase = config.shouldGlobMatchFilePattern ? null : prepareQuery(this.filePattern).normalizedLowercase;
		}

		this.globalExcludePattern = config.excludePattern && glob.parseExcludeExpression(config.excludePattern, globOptions).matches;
		this.folderExcludePatterns = new Map<string, AbsoluteAndRelativeParsedExpression>();

		config.folderQueries.forEach(folderQuery => {
			const folderExcludeExpression: glob.IExpression = {}; // todo: consider exclude baseURI

			folderQuery.excludePattern?.forEach(excludePattern => {
				Object.assign(folderExcludeExpression, excludePattern.pattern || {}, this.config.excludePattern || {});
			});

			if (!folderQuery.excludePattern?.length) {
				Object.assign(folderExcludeExpression, this.config.excludePattern || {});
			}

			// Add excludes for other root folders
			const fqPath = folderQuery.folder.fsPath;
			const nestedRootFolders: string[] = [];
			config.folderQueries
				.map(rootFolderQuery => rootFolderQuery.folder.fsPath)
				.filter(rootFolder => rootFolder !== fqPath)
				.forEach(otherRootFolder => {
					// Exclude nested root folders
					if (isEqualOrParent(otherRootFolder, fqPath, config.ignoreGlobCase)) {
						const nestedRootFolder = path.relative(fqPath, otherRootFolder);
						folderExcludeExpression[nestedRootFolder] = true;
						nestedRootFolders.push(nestedRootFolder);
					}
				});

			this.nestedRootFolders.set(fqPath, nestedRootFolders);
			this.folderExcludePatterns.set(fqPath, new AbsoluteAndRelativeParsedExpression(folderExcludeExpression, fqPath, config.ignoreGlobCase));
		});
	}

	cancel(): void {
		this.isCanceled = true;
		this.killCmds.forEach(cmd => cmd());
	}

	walk(folderQueries: IFolderQuery[], extraFiles: URI[], numThreads: number | undefined, onResult: (result: IRawFileMatch) => void, onMessage: (message: IProgressMessage) => void, done: (error: Error | null, isLimitHit: boolean) => void): void {
		this.fileWalkSW = StopWatch.create(false);

		// Support that the file pattern is a full path to a file that exists
		if (this.isCanceled) {
			return done(null, this.isLimitHit);
		}

		// For each extra file
		extraFiles.forEach(extraFilePath => {
			const basename = path.basename(extraFilePath.fsPath);
			if (this.globalExcludePattern && this.globalExcludePattern(extraFilePath.fsPath, basename)) {
				return; // excluded
			}

			// File: Check for match on file pattern and include pattern
			this.matchFile(onResult, { relativePath: extraFilePath.fsPath /* no workspace relative path */, searchPath: undefined });
		});

		this.cmdSW = StopWatch.create(false);

		// For each root folder
		this.parallel<IFolderQuery, void>(folderQueries, (folderQuery: IFolderQuery, rootFolderDone: (err: Error | null, result: void) => void) => {
			this.call(this.folderTraversal, this, folderQuery, numThreads, onResult, onMessage, (err?: Error) => {
				if (err) {
					const errorMessage = toErrorMessage(err);
					console.error(errorMessage);
					this.errors.push(errorMessage);
					rootFolderDone(err, undefined);
				} else {
					rootFolderDone(null, undefined);
				}
			});
		}, (errors, _result) => {
			this.fileWalkSW!.stop();
			const err = errors ? arrays.coalesce(errors)[0] : null;
			done(err, this.isLimitHit);
		});
	}

	private parallel<T, E>(list: T[], fn: (item: T, callback: (err: Error | null, result: E | null) => void) => void, callback: (err: Array<Error | null> | null, result: E[]) => void): void {
		const results = new Array(list.length);
		const errors = new Array<Error | null>(list.length);
		let didErrorOccur = false;
		let doneCount = 0;

		if (list.length === 0) {
			return callback(null, []);
		}

		list.forEach((item, index) => {
			fn(item, (error, result) => {
				if (error) {
					didErrorOccur = true;
					results[index] = null;
					errors[index] = error;
				} else {
					results[index] = result;
					errors[index] = null;
				}

				if (++doneCount === list.length) {
					return callback(didErrorOccur ? errors : null, results);
				}
			});
		});
	}

	private call<F extends Function>(fun: F, that: any, ...args: any[]): void {
		try {
			fun.apply(that, args);
		} catch (e) {
			args[args.length - 1](e);
		}
	}

	/**
	 * Traverses the folder with ripgrep, followed by a run for the paths that exclude exceptions re-include.
	 */
	private async folderTraversal(folderQuery: IFolderQuery, numThreads: number | undefined, onResult: (result: IRawFileMatch) => void, onMessage: (message: IProgressMessage) => void, cb: (err?: Error) => void): Promise<void> {
		const excludeExceptions = this.folderExcludePatterns.get(folderQuery.folder.fsPath)!.exceptions;
		if (!excludeExceptions.length) {
			return this.cmdTraversal(folderQuery, numThreads, onResult, onMessage, cb);
		}

		const traverse = (traversal: ITraversalOptions) => new Promise<Error | undefined>(resolve => this.cmdTraversal(folderQuery, numThreads, onResult, onMessage, resolve, traversal));
		const seenPaths = new Set<string>();
		const err = await traverse({ seenPaths });
		if (err || this.isCanceled || this.isLimitHit) {
			return cb(err);
		}

		this.excludeExceptionRuns++;
		const exceptionRunSW = StopWatch.create(false);
		const exceptionRunErr = await traverse({ seenPaths, excludeExceptions });
		this.excludeExceptionTime += exceptionRunSW.elapsed(); // before the callback, which can complete the search and read the stats
		cb(exceptionRunErr);
	}

	private async cmdTraversal(folderQuery: IFolderQuery, numThreads: number | undefined, onResult: (result: IRawFileMatch) => void, onMessage: (message: IProgressMessage) => void, cb: (err?: Error) => void, traversal: ITraversalOptions = {}): Promise<void> {
		const rootFolder = folderQuery.folder.fsPath;
		const isMac = platform.isMacintosh;
		const { pathsToSkip, excludeExceptions, seenPaths } = traversal;

		let leftover = '';
		const tree = this.initDirectoryTree();

		let ripgrep;
		try {
			ripgrep = await this.spawnRipgrep(this.config, folderQuery, this.config.includePattern, this.folderExcludePatterns.get(folderQuery.folder.fsPath)!.expression, numThreads, excludeExceptions);
		} catch (err) {
			cb(err instanceof Error ? err : new Error(String(err)));
			return;
		}
		const cmd = ripgrep.cmd;
		const killCmd = () => {
			if (cmd.pid !== undefined) {
				cmd.kill();
			}
		};
		this.killCmds.add(killCmd);
		killCmds.add(killCmd);

		let done = (err?: Error) => {
			this.killCmds.delete(killCmd);
			killCmds.delete(killCmd);
			done = () => { };
			cb(err);
		};

		if (this.isCanceled) {
			cmd.once('error', () => { });
			cmd.once('close', () => done());
			killCmd();
			return;
		}
		const noSiblingsClauses = !Object.keys(ripgrep.siblingClauses).length;

		const escapedArgs = ripgrep.rgArgs.args
			.map(arg => arg.match(/^-/) ? arg : `'${arg}'`)
			.join(' ');

		let rgCmd = `${ripgrep.rgDiskPath} ${escapedArgs}\n - cwd: ${ripgrep.cwd}`;
		if (ripgrep.rgArgs.siblingClauses) {
			rgCmd += `\n - Sibling clauses: ${JSON.stringify(ripgrep.rgArgs.siblingClauses)}`;
		}
		onMessage({ message: rgCmd });

		// When ripgrep reports too many symbolic link loops, search the folder again without following
		// symbolic links and skip the paths that were already reported
		const symlinkLoopDetector = folderQuery.ignoreSymlinks ? undefined : new RipgrepSymlinkLoopDetector();
		const reportedPaths: string[] = [];
		const reportResult = symlinkLoopDetector ? (result: IRawFileMatch) => {
			reportedPaths.push(result.relativePath);
			onResult(result);
		} : onResult;
		let isRetrying = false;
		const retryWithoutFollowingSymlinks = () => {
			isRetrying = true;
			this.killCmds.delete(killCmd);
			killCmds.delete(killCmd);
			killCmd();
			onMessage({ message: `ripgrep reported more than ${MAX_RIPGREP_SYMLINK_LOOPS} symbolic link loops, searching ${rootFolder} again without following symbolic links` });
			this.cmdTraversal({ ...folderQuery, ignoreSymlinks: true }, numThreads, onResult, onMessage, cb, { ...traversal, pathsToSkip: new Set(reportedPaths) });
		};

		if (!excludeExceptions) {
			this.cmdResultCount = 0;
		}
		const excludePattern = this.folderExcludePatterns.get(rootFolder)!;
		const isReincludedByException = excludeExceptions && this.createExceptionRunFilter(folderQuery, excludePattern);
		this.collectStdout(cmd, 'utf8', onMessage, (err: Error | null, stdout?: string, last?: boolean) => {
			if (isRetrying) {
				return;
			}
			if (err) {
				done(err);
				return;
			}
			if (this.isLimitHit) {
				done();
				return;
			}

			// Mac: uses NFD unicode form on disk, but we want NFC
			const normalized = leftover + (isMac ? normalization.normalizeNFC(stdout || '') : stdout);
			let relativeFiles = normalized.split('\n');

			if (last) {
				const n = relativeFiles.length;
				relativeFiles[n - 1] = relativeFiles[n - 1].trim();
				if (!relativeFiles[n - 1]) {
					relativeFiles.pop();
				}
			} else {
				leftover = relativeFiles.pop() || '';
			}

			if (relativeFiles.length && relativeFiles[0].indexOf('\n') !== -1) {
				done(new Error('Splitting up files failed'));
				return;
			}

			if (pathsToSkip) {
				relativeFiles = relativeFiles.filter(relativePath => !pathsToSkip.has(relativePath));
			}

			if (isReincludedByException) {
				relativeFiles = relativeFiles.filter(relativePath => !seenPaths?.has(relativePath) && isReincludedByException(relativePath));
			}

			if (seenPaths) {
				for (const relativePath of relativeFiles) {
					// Exception runs only report excepted paths, so only those can be reported twice
					if (excludeExceptions || excludePattern.isExcepted(relativePath)) {
						seenPaths.add(relativePath);
					}
				}
			}

			this.cmdResultCount += relativeFiles.length;

			if (noSiblingsClauses) {
				for (const relativePath of relativeFiles) {
					this.matchFile(reportResult, { base: rootFolder, relativePath, searchPath: this.getSearchPath(folderQuery, relativePath) });
					if (this.isLimitHit) {
						killCmd();
						break;
					}
				}
				if (last || this.isLimitHit) {
					done();
				}

				return;
			}

			// TODO: Optimize siblings clauses with ripgrep here.
			this.addDirectoryEntries(folderQuery, tree, rootFolder, relativeFiles, reportResult);

			if (last) {
				this.matchDirectoryTree(tree, rootFolder, onResult);
				done();
			}
		}, symlinkLoopDetector && (stderr => {
			if (!isRetrying && !this.isCanceled && !this.isLimitHit && symlinkLoopDetector.handleStderr(stderr)) {
				retryWithoutFollowingSymlinks();
			}
		}), !excludeExceptions);
	}

	/**
	 * Creates the filter for the results of an exclude exception run. The run passes no include or exclude
	 * globs to ripgrep, so it applies the includes of the query and skips nested workspace folders here.
	 */
	private createExceptionRunFilter(folderQuery: IFolderQuery, excludePattern: AbsoluteAndRelativeParsedExpression): (relativePath: string) => boolean {
		const includeExpression = this.config.includePattern || folderQuery.includePattern ? { ...this.config.includePattern, ...folderQuery.includePattern } : undefined;
		const include = includeExpression && glob.parse(includeExpression, { ignoreCase: this.config.ignoreGlobCase });
		const nestedRootFolders = this.nestedRootFolders.get(folderQuery.folder.fsPath) ?? [];

		return relativePath => excludePattern.isExcepted(relativePath)
			&& (!include || !!include(relativePath, path.basename(relativePath)))
			&& !nestedRootFolders.some(nestedRootFolder => isEqualOrParent(relativePath, nestedRootFolder, this.config.ignoreGlobCase));
	}

	/**
	 * Public for testing.
	 */
	spawnFindCmd(folderQuery: IFolderQuery) {
		const excludePattern = this.folderExcludePatterns.get(folderQuery.folder.fsPath)!;
		const basenames = excludePattern.getBasenameTerms();
		const pathTerms = excludePattern.getPathTerms();
		const args = ['-L', '.'];
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
		return childProcess.spawn('find', args, { cwd: folderQuery.folder.fsPath });
	}

	/**
	 * Public for testing.
	 */
	readStdout(cmd: childProcess.ChildProcess, encoding: BufferEncoding, cb: (err: Error | null, stdout?: string) => void): void {
		let all = '';
		this.collectStdout(cmd, encoding, () => { }, (err: Error | null, stdout?: string, last?: boolean) => {
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

	/**
	 * @param isExistsFromExitCode whether a successful exit means that a file exists, which is not the case when the results are filtered further
	 */
	private collectStdout(cmd: childProcess.ChildProcess, encoding: BufferEncoding, onMessage: (message: IProgressMessage) => void, cb: (err: Error | null, stdout?: string, last?: boolean) => void, onStderr?: (stderr: string) => void, isExistsFromExitCode = true): void {
		let onData = (err: Error | null, stdout?: string, last?: boolean) => {
			if (err || last) {
				onData = () => { };

				this.cmdSW?.stop();
			}
			cb(err, stdout, last);
		};

		let gotData = false;
		if (cmd.stdout) {
			// Should be non-null, but #38195
			this.forwardData(cmd.stdout, encoding, onData);
			cmd.stdout.once('data', () => gotData = true);
		} else {
			onMessage({ message: 'stdout is null' });
		}

		let stderr: Buffer[];
		if (cmd.stderr) {
			// Should be non-null, but #38195
			stderr = this.collectData(cmd.stderr);
			if (onStderr) {
				this.forwardData(cmd.stderr, encoding, (_err, data) => onStderr(data ?? ''));
			}
		} else {
			onMessage({ message: 'stderr is null' });
		}

		cmd.on('error', (err: Error) => {
			onData(err);
		});

		cmd.on('close', (code: number) => {
			// ripgrep returns code=1 when no results are found
			let stderrText: string;
			if (!gotData && (stderrText = this.decodeData(stderr, encoding)) && rgErrorMsgForDisplay(stderrText)) {
				onData(new Error(`command failed with error code ${code}: ${this.decodeData(stderr, encoding)}`));
			} else {
				if (this.exists && isExistsFromExitCode && code === 0) {
					this.isLimitHit = true;
				}
				onData(null, '', true);
			}
		});
	}

	private forwardData(stream: Readable, encoding: BufferEncoding, cb: (err: Error | null, stdout?: string) => void): StringDecoder {
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

	private decodeData(buffers: Buffer[], encoding: BufferEncoding): string {
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

	private addDirectoryEntries(folderQuery: IFolderQuery, { pathToEntries }: IDirectoryTree, base: string, relativeFiles: string[], onResult: (result: IRawFileMatch) => void) {
		// Support relative paths to files from a root resource (ignores excludes)
		const filePatternMatch = this.filePattern && relativeFiles.find(f => strings.equals(f, this.filePattern, this.config.ignoreGlobCase));
		if (filePatternMatch) {
			this.matchFile(onResult, {
				base,
				relativePath: filePatternMatch,
				searchPath: this.getSearchPath(folderQuery, filePatternMatch)
			});
		}

		const add = (relativePath: string) => {
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
				basename,
				searchPath: this.getSearchPath(folderQuery, relativePath),
			});
		};
		relativeFiles.forEach(add);
	}

	private matchDirectoryTree({ rootEntries, pathToEntries }: IDirectoryTree, rootFolder: string, onResult: (result: IRawFileMatch) => void) {
		const self = this;
		const excludePattern = this.folderExcludePatterns.get(rootFolder)!;
		const filePattern = this.filePattern;
		const ignoreGlobCase = this.config.ignoreGlobCase;
		function matchDirectory(entries: IDirectoryEntry[], isParentExcluded: boolean) {
			self.directoriesWalked++;
			const hasSibling = hasSiblingFn(() => entries.map(entry => entry.basename));
			for (let i = 0, n = entries.length; i < n; i++) {
				const entry = entries[i];
				const { relativePath, basename } = entry;

				// Check exclude pattern
				// If the user searches for the exact file name, we adjust the glob matching
				// to ignore filtering by siblings because the user seems to know what they
				// are searching for and we want to include the result in that case anyway
				const sub = pathToEntries[relativePath];
				const { isExcluded, isVisited } = glob.evaluateExcludeTreeEntry(excludePattern, {
					path: relativePath,
					basename,
					isDirectory: !!sub,
					isParentExcluded,
					hasSibling: !strings.equals(filePattern, basename, ignoreGlobCase) ? hasSibling : undefined,
				});
				if (!isVisited) {
					continue;
				}

				if (sub) {
					matchDirectory(sub, isExcluded);
				} else {
					self.filesWalked++;
					if (strings.equals(relativePath, filePattern, ignoreGlobCase)) {
						continue; // ignore file if its path matches with the file pattern because that is already matched above
					}

					self.matchFile(onResult, entry);
				}

				if (self.isLimitHit) {
					break;
				}
			}
		}
		matchDirectory(rootEntries, false);
	}

	getStats(): ISearchEngineStats {
		return {
			cmdTime: this.cmdSW!.elapsed(),
			fileWalkTime: this.fileWalkSW!.elapsed(),
			directoriesWalked: this.directoriesWalked,
			filesWalked: this.filesWalked,
			cmdResultCount: this.cmdResultCount,
			excludeExceptionRuns: this.excludeExceptionRuns,
			excludeExceptionTime: this.excludeExceptionTime
		};
	}

	private matchFile(onResult: (result: IRawFileMatch) => void, candidate: IRawFileMatch): void {
		if (this.isFileMatch(candidate) && (!this.includePattern || this.includePattern(candidate.relativePath, path.basename(candidate.relativePath)))) {
			this.resultCount++;

			if (this.exists || (this.maxResults && this.resultCount > this.maxResults)) {
				this.isLimitHit = true;
			}

			if (!this.isLimitHit) {
				onResult(candidate);
			}
		}
	}

	private isFileMatch(candidate: IRawFileMatch): boolean {
		// Check for search pattern
		if (this.filePattern) {
			if (this.filePattern === '*') {
				return true; // support the all-matching wildcard
			}

			if (this.normalizedFilePatternLowercase) {
				return isFilePatternMatch(candidate, this.normalizedFilePatternLowercase);
			} else if (this.filePattern) {
				return isFilePatternMatch(candidate, this.filePattern, false, this.config.ignoreGlobCase);
			}
		}

		// No patterns means we match all
		return true;
	}

	/**
	 * If we're searching for files in multiple workspace folders, then better prepend the
	 * name of the workspace folder to the path of the file. This way we'll be able to
	 * better filter files that are all on the top of a workspace folder and have all the
	 * same name. A typical example are `package.json` or `README.md` files.
	 */
	private getSearchPath(folderQuery: IFolderQuery, relativePath: string): string {
		if (folderQuery.folderName) {
			return path.join(folderQuery.folderName, relativePath);
		}
		return relativePath;
	}
}

export class Engine implements ISearchEngine<IRawFileMatch> {
	private folderQueries: IFolderQuery[];
	private extraFiles: URI[];
	private walker: FileWalker;
	private numThreads?: number;

	constructor(config: IFileQuery, numThreads?: number) {
		this.folderQueries = config.folderQueries;
		this.extraFiles = config.extraFileResources || [];
		this.numThreads = numThreads;

		this.walker = new FileWalker(config);
	}

	search(onResult: (result: IRawFileMatch) => void, onProgress: (progress: IProgressMessage) => void, done: (error: Error | null, complete: ISearchEngineSuccess) => void): void {
		this.walker.walk(this.folderQueries, this.extraFiles, this.numThreads, onResult, onProgress, (err: Error | null, isLimitHit: boolean) => {
			done(err, {
				limitHit: isLimitHit,
				stats: this.walker.getStats(),
				messages: [],
			});
		});
	}

	cancel(): void {
		this.walker.cancel();
	}
}

/**
 * This class exists to provide one interface on top of two ParsedExpressions, one for absolute expressions and one for relative expressions.
 * The absolute and relative expressions don't "have" to be kept separate, but this keeps us from having to path.join every single
 * file searched, it's only used for a text search with a searchPath
 */
class AbsoluteAndRelativeParsedExpression implements glob.IExcludeTreeEvaluator {
	private absoluteParsedExpr: glob.ParsedExpression | undefined;
	private relativeParsedExpr: glob.IParsedExcludeExpression | undefined;

	constructor(public expression: glob.IExpression, private root: string, private ignoreCase?: boolean) {
		this.init(expression);
	}

	/**
	 * Split the IExpression into its absolute and relative components, and glob.parse them separately.
	 */
	private init(expr: glob.IExpression): void {
		let absoluteGlobExpr: glob.IExpression | undefined;
		let relativeGlobExpr: glob.IExpression | undefined;
		Object.keys(expr)
			.filter(key => expr[key])
			.forEach(key => {
				if (path.isAbsolute(key)) {
					absoluteGlobExpr = absoluteGlobExpr || glob.getEmptyExpression();
					absoluteGlobExpr[key] = expr[key];
				} else {
					relativeGlobExpr = relativeGlobExpr || glob.getEmptyExpression();
					relativeGlobExpr[key] = expr[key];
				}
			});

		const globOptions = { trimForExclusions: true, ignoreCase: this.ignoreCase };
		this.absoluteParsedExpr = absoluteGlobExpr && glob.parse(absoluteGlobExpr, globOptions);
		this.relativeParsedExpr = relativeGlobExpr && glob.parseExcludeExpression(relativeGlobExpr, globOptions);
	}

	/**
	 * The exclude exceptions, which are always relative to the folder, see {@link glob.getExcludeExceptions}.
	 */
	get exceptions(): readonly string[] {
		return this.relativeParsedExpr?.exceptions ?? [];
	}

	/**
	 * Whether the path matches an exclude pattern, ignoring exclude exceptions.
	 */
	matchesExclude(_path: string, basename?: string, hasSibling?: (name: string) => boolean) {
		return this.relativeParsedExpr?.matchesExclude(_path, basename, hasSibling) ||
			this.absoluteParsedExpr?.(path.join(this.root, _path), basename, hasSibling);
	}

	isExcepted(_path: string, basename?: string): boolean {
		return !!this.relativeParsedExpr?.isExcepted(_path, basename);
	}

	couldExceptionMatchBeneath(folderPath: string): boolean {
		return !!this.relativeParsedExpr?.couldExceptionMatchBeneath(folderPath);
	}

	getBasenameTerms(): string[] {
		const basenameTerms: string[] = [];
		if (this.absoluteParsedExpr) {
			basenameTerms.push(...glob.getBasenameTerms(this.absoluteParsedExpr));
		}

		if (this.relativeParsedExpr) {
			basenameTerms.push(...glob.getBasenameTerms(this.relativeParsedExpr.matches));
		}

		return basenameTerms;
	}

	getPathTerms(): string[] {
		const pathTerms: string[] = [];
		if (this.absoluteParsedExpr) {
			pathTerms.push(...glob.getPathTerms(this.absoluteParsedExpr));
		}

		if (this.relativeParsedExpr) {
			pathTerms.push(...glob.getPathTerms(this.relativeParsedExpr.matches));
		}

		return pathTerms;
	}
}

function rgErrorMsgForDisplay(msg: string): string | undefined {
	const lines = msg.trim().split('\n');
	const firstLine = lines[0].trim();

	if (firstLine.startsWith('Error parsing regex')) {
		return firstLine;
	}

	if (firstLine.startsWith('regex parse error')) {
		return strings.uppercaseFirstLetter(lines[lines.length - 1].trim());
	}

	if (firstLine.startsWith('error parsing glob') ||
		firstLine.startsWith('unsupported encoding')) {
		// Uppercase first letter
		return firstLine.charAt(0).toUpperCase() + firstLine.substr(1);
	}

	if (firstLine === `Literal '\\n' not allowed.`) {
		// I won't localize this because none of the Ripgrep error messages are localized
		return `Literal '\\n' currently not supported`;
	}

	if (firstLine.startsWith('Literal ')) {
		// Other unsupported chars
		return firstLine;
	}

	return undefined;
}
