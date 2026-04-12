/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from '../../../../base/common/path.js';
import { StringDecoder } from 'string_decoder';
import * as arrays from '../../../../base/common/arrays.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import * as glob from '../../../../base/common/glob.js';
import * as normalization from '../../../../base/common/normalization.js';
import { isEqualOrParent } from '../../../../base/common/extpath.js';
import * as platform from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import * as strings from '../../../../base/common/strings.js';
import * as types from '../../../../base/common/types.js';
import { Promises } from '../../../../base/node/pfs.js';
import { isFilePatternMatch, hasSiblingFn } from '../common/search.js';
import { spawnRipgrepCmd } from './ripgrepFileSearch.js';
import { prepareQuery } from '../../../../base/common/fuzzyScorer.js';
const killCmds = new Set();
process.on('exit', () => {
    killCmds.forEach(cmd => cmd());
});
export class FileWalker {
    constructor(config) {
        this.normalizedFilePatternLowercase = null;
        this.maxFilesize = null;
        this.isCanceled = false;
        this.fileWalkSW = null;
        this.cmdSW = null;
        this.cmdResultCount = 0;
        this.config = config;
        this.filePattern = config.filePattern || '';
        const globOptions = config.ignoreGlobCase ? { ignoreCase: true } : undefined;
        this.includePattern = config.includePattern && glob.parse(config.includePattern, globOptions);
        this.maxResults = config.maxResults || null;
        this.exists = !!config.exists;
        this.walkedPaths = Object.create(null);
        this.resultCount = 0;
        this.isLimitHit = false;
        this.directoriesWalked = 0;
        this.filesWalked = 0;
        this.errors = [];
        if (this.filePattern) {
            this.normalizedFilePatternLowercase = config.shouldGlobMatchFilePattern ? null : prepareQuery(this.filePattern).normalizedLowercase;
        }
        this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern, globOptions);
        this.folderExcludePatterns = new Map();
        config.folderQueries.forEach(folderQuery => {
            const folderExcludeExpression = {}; // todo: consider exclude baseURI
            folderQuery.excludePattern?.forEach(excludePattern => {
                Object.assign(folderExcludeExpression, excludePattern.pattern || {}, this.config.excludePattern || {});
            });
            if (!folderQuery.excludePattern?.length) {
                Object.assign(folderExcludeExpression, this.config.excludePattern || {});
            }
            // Add excludes for other root folders
            const fqPath = folderQuery.folder.fsPath;
            config.folderQueries
                .map(rootFolderQuery => rootFolderQuery.folder.fsPath)
                .filter(rootFolder => rootFolder !== fqPath)
                .forEach(otherRootFolder => {
                // Exclude nested root folders
                if (isEqualOrParent(otherRootFolder, fqPath, config.ignoreGlobCase)) {
                    folderExcludeExpression[path.relative(fqPath, otherRootFolder)] = true;
                }
            });
            this.folderExcludePatterns.set(fqPath, new AbsoluteAndRelativeParsedExpression(folderExcludeExpression, fqPath, config.ignoreGlobCase));
        });
    }
    cancel() {
        this.isCanceled = true;
        killCmds.forEach(cmd => cmd());
    }
    walk(folderQueries, extraFiles, numThreads, onResult, onMessage, done) {
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
        this.parallel(folderQueries, (folderQuery, rootFolderDone) => {
            this.call(this.cmdTraversal, this, folderQuery, numThreads, onResult, onMessage, (err) => {
                if (err) {
                    const errorMessage = toErrorMessage(err);
                    console.error(errorMessage);
                    this.errors.push(errorMessage);
                    rootFolderDone(err, undefined);
                }
                else {
                    rootFolderDone(null, undefined);
                }
            });
        }, (errors, _result) => {
            this.fileWalkSW.stop();
            const err = errors ? arrays.coalesce(errors)[0] : null;
            done(err, this.isLimitHit);
        });
    }
    parallel(list, fn, callback) {
        const results = new Array(list.length);
        const errors = new Array(list.length);
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
                }
                else {
                    results[index] = result;
                    errors[index] = null;
                }
                if (++doneCount === list.length) {
                    return callback(didErrorOccur ? errors : null, results);
                }
            });
        });
    }
    call(fun, that, ...args) {
        try {
            fun.apply(that, args);
        }
        catch (e) {
            args[args.length - 1](e);
        }
    }
    cmdTraversal(folderQuery, numThreads, onResult, onMessage, cb) {
        const rootFolder = folderQuery.folder.fsPath;
        const isMac = platform.isMacintosh;
        const killCmd = () => cmd && cmd.kill();
        killCmds.add(killCmd);
        let done = (err) => {
            killCmds.delete(killCmd);
            done = () => { };
            cb(err);
        };
        let leftover = '';
        const tree = this.initDirectoryTree();
        const ripgrep = spawnRipgrepCmd(this.config, folderQuery, this.config.includePattern, this.folderExcludePatterns.get(folderQuery.folder.fsPath).expression, numThreads);
        const cmd = ripgrep.cmd;
        const noSiblingsClauses = !Object.keys(ripgrep.siblingClauses).length;
        const escapedArgs = ripgrep.rgArgs.args
            .map(arg => arg.match(/^-/) ? arg : `'${arg}'`)
            .join(' ');
        let rgCmd = `${ripgrep.rgDiskPath} ${escapedArgs}\n - cwd: ${ripgrep.cwd}`;
        if (ripgrep.rgArgs.siblingClauses) {
            rgCmd += `\n - Sibling clauses: ${JSON.stringify(ripgrep.rgArgs.siblingClauses)}`;
        }
        onMessage({ message: rgCmd });
        this.cmdResultCount = 0;
        this.collectStdout(cmd, 'utf8', onMessage, (err, stdout, last) => {
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
            const relativeFiles = normalized.split('\n');
            if (last) {
                const n = relativeFiles.length;
                relativeFiles[n - 1] = relativeFiles[n - 1].trim();
                if (!relativeFiles[n - 1]) {
                    relativeFiles.pop();
                }
            }
            else {
                leftover = relativeFiles.pop() || '';
            }
            if (relativeFiles.length && relativeFiles[0].indexOf('\n') !== -1) {
                done(new Error('Splitting up files failed'));
                return;
            }
            this.cmdResultCount += relativeFiles.length;
            if (noSiblingsClauses) {
                for (const relativePath of relativeFiles) {
                    this.matchFile(onResult, { base: rootFolder, relativePath, searchPath: this.getSearchPath(folderQuery, relativePath) });
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
            this.addDirectoryEntries(folderQuery, tree, rootFolder, relativeFiles, onResult);
            if (last) {
                this.matchDirectoryTree(tree, rootFolder, onResult);
                done();
            }
        });
    }
    /**
     * Public for testing.
     */
    spawnFindCmd(folderQuery) {
        const excludePattern = this.folderExcludePatterns.get(folderQuery.folder.fsPath);
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
    readStdout(cmd, encoding, cb) {
        let all = '';
        this.collectStdout(cmd, encoding, () => { }, (err, stdout, last) => {
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
    collectStdout(cmd, encoding, onMessage, cb) {
        let onData = (err, stdout, last) => {
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
        }
        else {
            onMessage({ message: 'stdout is null' });
        }
        let stderr;
        if (cmd.stderr) {
            // Should be non-null, but #38195
            stderr = this.collectData(cmd.stderr);
        }
        else {
            onMessage({ message: 'stderr is null' });
        }
        cmd.on('error', (err) => {
            onData(err);
        });
        cmd.on('close', (code) => {
            // ripgrep returns code=1 when no results are found
            let stderrText;
            if (!gotData && (stderrText = this.decodeData(stderr, encoding)) && rgErrorMsgForDisplay(stderrText)) {
                onData(new Error(`command failed with error code ${code}: ${this.decodeData(stderr, encoding)}`));
            }
            else {
                if (this.exists && code === 0) {
                    this.isLimitHit = true;
                }
                onData(null, '', true);
            }
        });
    }
    forwardData(stream, encoding, cb) {
        const decoder = new StringDecoder(encoding);
        stream.on('data', (data) => {
            cb(null, decoder.write(data));
        });
        return decoder;
    }
    collectData(stream) {
        const buffers = [];
        stream.on('data', (data) => {
            buffers.push(data);
        });
        return buffers;
    }
    decodeData(buffers, encoding) {
        const decoder = new StringDecoder(encoding);
        return buffers.map(buffer => decoder.write(buffer)).join('');
    }
    initDirectoryTree() {
        const tree = {
            rootEntries: [],
            pathToEntries: Object.create(null)
        };
        tree.pathToEntries['.'] = tree.rootEntries;
        return tree;
    }
    addDirectoryEntries(folderQuery, { pathToEntries }, base, relativeFiles, onResult) {
        // Support relative paths to files from a root resource (ignores excludes)
        const filePatternMatch = this.filePattern && relativeFiles.find(f => strings.equals(f, this.filePattern, this.config.ignoreGlobCase));
        if (filePatternMatch) {
            this.matchFile(onResult, {
                base,
                relativePath: filePatternMatch,
                searchPath: this.getSearchPath(folderQuery, filePatternMatch)
            });
        }
        const add = (relativePath) => {
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
    matchDirectoryTree({ rootEntries, pathToEntries }, rootFolder, onResult) {
        const self = this;
        const excludePattern = this.folderExcludePatterns.get(rootFolder);
        const filePattern = this.filePattern;
        const ignoreGlobCase = this.config.ignoreGlobCase;
        function matchDirectory(entries) {
            self.directoriesWalked++;
            const hasSibling = hasSiblingFn(() => entries.map(entry => entry.basename));
            for (let i = 0, n = entries.length; i < n; i++) {
                const entry = entries[i];
                const { relativePath, basename } = entry;
                // Check exclude pattern
                // If the user searches for the exact file name, we adjust the glob matching
                // to ignore filtering by siblings because the user seems to know what they
                // are searching for and we want to include the result in that case anyway
                if (excludePattern.test(relativePath, basename, !strings.equals(filePattern, basename, ignoreGlobCase) ? hasSibling : undefined)) {
                    continue;
                }
                const sub = pathToEntries[relativePath];
                if (sub) {
                    matchDirectory(sub);
                }
                else {
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
        matchDirectory(rootEntries);
    }
    getStats() {
        return {
            cmdTime: this.cmdSW.elapsed(),
            fileWalkTime: this.fileWalkSW.elapsed(),
            directoriesWalked: this.directoriesWalked,
            filesWalked: this.filesWalked,
            cmdResultCount: this.cmdResultCount
        };
    }
    doWalk(folderQuery, relativeParentPath, files, onResult, done) {
        const rootFolder = folderQuery.folder;
        // Execute tasks on each file in parallel to optimize throughput
        const hasSibling = hasSiblingFn(() => files);
        this.parallel(files, (file, clb) => {
            // Check canceled
            if (this.isCanceled || this.isLimitHit) {
                return clb(null);
            }
            // Check exclude pattern
            // If the user searches for the exact file name, we adjust the glob matching
            // to ignore filtering by siblings because the user seems to know what they
            // are searching for and we want to include the result in that case anyway
            const currentRelativePath = relativeParentPath ? [relativeParentPath, file].join(path.sep) : file;
            if (this.folderExcludePatterns.get(folderQuery.folder.fsPath).test(currentRelativePath, file, !strings.equals(this.config.filePattern, file, this.config.ignoreGlobCase) ? hasSibling : undefined)) {
                return clb(null);
            }
            // Use lstat to detect links
            const currentAbsolutePath = [rootFolder.fsPath, currentRelativePath].join(path.sep);
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
                            realpath = realpath || '';
                            if (this.walkedPaths[realpath]) {
                                return clb(null); // escape when there are cycles (can happen with symlinks)
                            }
                            this.walkedPaths[realpath] = true; // remember as walked
                            // Continue walking
                            return Promises.readdir(currentAbsolutePath).then(children => {
                                if (this.isCanceled || this.isLimitHit) {
                                    return clb(null);
                                }
                                this.doWalk(folderQuery, currentRelativePath, children, onResult, err => clb(err || null));
                            }, error => {
                                clb(null);
                            });
                        });
                    }
                    // File: Check for match on file pattern and include pattern
                    else {
                        this.filesWalked++;
                        if (strings.equals(currentRelativePath, this.filePattern, this.config.ignoreGlobCase)) {
                            return clb(null, undefined); // ignore file if its path matches with the file pattern because checkFilePatternRelativeMatch() takes care of those
                        }
                        if (this.maxFilesize && types.isNumber(stat.size) && stat.size > this.maxFilesize) {
                            return clb(null, undefined); // ignore file if max file size is hit
                        }
                        this.matchFile(onResult, {
                            base: rootFolder.fsPath,
                            relativePath: currentRelativePath,
                            searchPath: this.getSearchPath(folderQuery, currentRelativePath),
                        });
                    }
                    // Unwind
                    return clb(null, undefined);
                });
            });
        }, (error) => {
            const filteredErrors = error ? arrays.coalesce(error) : error; // find any error by removing null values first
            return done(filteredErrors && filteredErrors.length > 0 ? filteredErrors[0] : undefined);
        });
    }
    matchFile(onResult, candidate) {
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
    isFileMatch(candidate) {
        // Check for search pattern
        if (this.filePattern) {
            if (this.filePattern === '*') {
                return true; // support the all-matching wildcard
            }
            if (this.normalizedFilePatternLowercase) {
                return isFilePatternMatch(candidate, this.normalizedFilePatternLowercase);
            }
            else if (this.filePattern) {
                return isFilePatternMatch(candidate, this.filePattern, false, this.config.ignoreGlobCase);
            }
        }
        // No patterns means we match all
        return true;
    }
    statLinkIfNeeded(path, lstat, clb) {
        if (lstat.isSymbolicLink()) {
            return fs.stat(path, clb); // stat the target the link points to
        }
        return clb(null, lstat); // not a link, so the stat is already ok for us
    }
    realPathIfNeeded(path, lstat, clb) {
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
    /**
     * If we're searching for files in multiple workspace folders, then better prepend the
     * name of the workspace folder to the path of the file. This way we'll be able to
     * better filter files that are all on the top of a workspace folder and have all the
     * same name. A typical example are `package.json` or `README.md` files.
     */
    getSearchPath(folderQuery, relativePath) {
        if (folderQuery.folderName) {
            return path.join(folderQuery.folderName, relativePath);
        }
        return relativePath;
    }
}
export class Engine {
    constructor(config, numThreads) {
        this.folderQueries = config.folderQueries;
        this.extraFiles = config.extraFileResources || [];
        this.numThreads = numThreads;
        this.walker = new FileWalker(config);
    }
    search(onResult, onProgress, done) {
        this.walker.walk(this.folderQueries, this.extraFiles, this.numThreads, onResult, onProgress, (err, isLimitHit) => {
            done(err, {
                limitHit: isLimitHit,
                stats: this.walker.getStats(),
                messages: [],
            });
        });
    }
    cancel() {
        this.walker.cancel();
    }
}
/**
 * This class exists to provide one interface on top of two ParsedExpressions, one for absolute expressions and one for relative expressions.
 * The absolute and relative expressions don't "have" to be kept separate, but this keeps us from having to path.join every single
 * file searched, it's only used for a text search with a searchPath
 */
class AbsoluteAndRelativeParsedExpression {
    constructor(expression, root, ignoreCase) {
        this.expression = expression;
        this.root = root;
        this.ignoreCase = ignoreCase;
        this.init(expression);
    }
    /**
     * Split the IExpression into its absolute and relative components, and glob.parse them separately.
     */
    init(expr) {
        let absoluteGlobExpr;
        let relativeGlobExpr;
        Object.keys(expr)
            .filter(key => expr[key])
            .forEach(key => {
            if (path.isAbsolute(key)) {
                absoluteGlobExpr = absoluteGlobExpr || glob.getEmptyExpression();
                absoluteGlobExpr[key] = expr[key];
            }
            else {
                relativeGlobExpr = relativeGlobExpr || glob.getEmptyExpression();
                relativeGlobExpr[key] = expr[key];
            }
        });
        const globOptions = { trimForExclusions: true, ignoreCase: this.ignoreCase };
        this.absoluteParsedExpr = absoluteGlobExpr && glob.parse(absoluteGlobExpr, globOptions);
        this.relativeParsedExpr = relativeGlobExpr && glob.parse(relativeGlobExpr, globOptions);
    }
    test(_path, basename, hasSibling) {
        return (this.relativeParsedExpr && this.relativeParsedExpr(_path, basename, hasSibling)) ||
            (this.absoluteParsedExpr && this.absoluteParsedExpr(path.join(this.root, _path), basename, hasSibling));
    }
    getBasenameTerms() {
        const basenameTerms = [];
        if (this.absoluteParsedExpr) {
            basenameTerms.push(...glob.getBasenameTerms(this.absoluteParsedExpr));
        }
        if (this.relativeParsedExpr) {
            basenameTerms.push(...glob.getBasenameTerms(this.relativeParsedExpr));
        }
        return basenameTerms;
    }
    getPathTerms() {
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
function rgErrorMsgForDisplay(msg) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZVNlYXJjaC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvbm9kZS9maWxlU2VhcmNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxZQUFZLE1BQU0sZUFBZSxDQUFDO0FBQzlDLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFFeEQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQy9DLE9BQU8sS0FBSyxNQUFNLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pFLE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFDeEQsT0FBTyxLQUFLLGFBQWEsTUFBTSwwQ0FBMEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDckUsT0FBTyxLQUFLLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEtBQUssS0FBSyxNQUFNLGtDQUFrQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RCxPQUFPLEVBQXNILGtCQUFrQixFQUFFLFlBQVksRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzNMLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFZdEUsTUFBTSxRQUFR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