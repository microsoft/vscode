/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';
import * as path from '../../../../base/common/path.js';
import { normalizeNFD } from '../../../../base/common/normalization.js';
import * as extpath from '../../../../base/common/extpath.js';
import { isMacintosh as isMac } from '../../../../base/common/platform.js';
import * as strings from '../../../../base/common/strings.js';
import { anchorGlob } from './ripgrepSearchUtils.js';
import { rgPath } from '@vscode/ripgrep';
// If @vscode/ripgrep is in an .asar file, then the binary is unpacked.
const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
export function spawnRipgrepCmd(config, folderQuery, includePattern, excludePattern, numThreads) {
    const rgArgs = getRgArgs(config, folderQuery, includePattern, excludePattern, numThreads);
    const cwd = folderQuery.folder.fsPath;
    return {
        cmd: cp.spawn(rgDiskPath, rgArgs.args, { cwd }),
        rgDiskPath,
        siblingClauses: rgArgs.siblingClauses,
        rgArgs,
        cwd
    };
}
function getRgArgs(config, folderQuery, includePattern, excludePattern, numThreads) {
    const args = ['--files', '--hidden', '--case-sensitive', '--no-require-git'];
    if (config.ignoreGlobCase || folderQuery.ignoreGlobCase) {
        args.push('--glob-case-insensitive');
        args.push('--ignore-file-case-insensitive');
    }
    // includePattern can't have siblingClauses
    foldersToIncludeGlobs([folderQuery], includePattern, false).forEach(globArg => {
        const inclusion = anchorGlob(globArg);
        args.push('-g', inclusion);
        if (isMac) {
            const normalized = normalizeNFD(inclusion);
            if (normalized !== inclusion) {
                args.push('-g', normalized);
            }
        }
    });
    const rgGlobs = foldersToRgExcludeGlobs([folderQuery], excludePattern, undefined, false);
    rgGlobs.globArgs.forEach(globArg => {
        const exclusion = `!${anchorGlob(globArg)}`;
        args.push('-g', exclusion);
        if (isMac) {
            const normalized = normalizeNFD(exclusion);
            if (normalized !== exclusion) {
                args.push('-g', normalized);
            }
        }
    });
    if (folderQuery.disregardIgnoreFiles !== false) {
        // Don't use .gitignore or .ignore
        args.push('--no-ignore');
    }
    else if (folderQuery.disregardParentIgnoreFiles !== false) {
        args.push('--no-ignore-parent');
    }
    // Follow symlinks
    if (!folderQuery.ignoreSymlinks) {
        args.push('--follow');
    }
    if (config.exists) {
        args.push('--quiet');
    }
    if (numThreads) {
        args.push('--threads', `${numThreads}`);
    }
    args.push('--no-config');
    if (folderQuery.disregardGlobalIgnoreFiles) {
        args.push('--no-ignore-global');
    }
    return {
        args,
        siblingClauses: rgGlobs.siblingClauses
    };
}
function foldersToRgExcludeGlobs(folderQueries, globalExclude, excludesToSkip, absoluteGlobs = true) {
    const globArgs = [];
    let siblingClauses = {};
    folderQueries.forEach(folderQuery => {
        const totalExcludePattern = Object.assign({}, folderQuery.excludePattern || {}, globalExclude || {});
        const result = globExprsToRgGlobs(totalExcludePattern, absoluteGlobs ? folderQuery.folder.fsPath : undefined, excludesToSkip);
        globArgs.push(...result.globArgs);
        if (result.siblingClauses) {
            siblingClauses = Object.assign(siblingClauses, result.siblingClauses);
        }
    });
    return { globArgs, siblingClauses };
}
function foldersToIncludeGlobs(folderQueries, globalInclude, absoluteGlobs = true) {
    const globArgs = [];
    folderQueries.forEach(folderQuery => {
        const totalIncludePattern = Object.assign({}, globalInclude || {}, folderQuery.includePattern || {});
        const result = globExprsToRgGlobs(totalIncludePattern, absoluteGlobs ? folderQuery.folder.fsPath : undefined);
        globArgs.push(...result.globArgs);
    });
    return globArgs;
}
function globExprsToRgGlobs(patterns, folder, excludesToSkip) {
    const globArgs = [];
    const siblingClauses = {};
    Object.keys(patterns)
        .forEach(key => {
        if (excludesToSkip && excludesToSkip.has(key)) {
            return;
        }
        if (!key) {
            return;
        }
        const value = patterns[key];
        key = trimTrailingSlash(folder ? getAbsoluteGlob(folder, key) : key);
        // glob.ts requires forward slashes, but a UNC path still must start with \\
        // #38165 and #38151
        if (key.startsWith('\\\\')) {
            key = '\\\\' + key.substr(2).replace(/\\/g, '/');
        }
        else {
            key = key.replace(/\\/g, '/');
        }
        if (typeof value === 'boolean' && value) {
            if (key.startsWith('\\\\')) {
                // Absolute globs UNC paths don't work properly, see #58758
                key += '**';
            }
            globArgs.push(fixDriveC(key));
        }
        else if (value && value.when) {
            siblingClauses[key] = value;
        }
    });
    return { globArgs, siblingClauses };
}
/**
 * Resolves a glob like "node_modules/**" in "/foo/bar" to "/foo/bar/node_modules/**".
 * Special cases C:/foo paths to write the glob like /foo instead - see https://github.com/BurntSushi/ripgrep/issues/530.
 *
 * Exported for testing
 */
export function getAbsoluteGlob(folder, key) {
    return path.isAbsolute(key) ?
        key :
        path.join(folder, key);
}
function trimTrailingSlash(str) {
    str = strings.rtrim(str, '\\');
    return strings.rtrim(str, '/');
}
export function fixDriveC(path) {
    const root = extpath.getRoot(path);
    return root.toLowerCase() === 'c:/' ?
        path.replace(/^c:[/\\]/i, '/') :
        path;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmlwZ3JlcEZpbGVTZWFyY2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL25vZGUvcmlwZ3JlcEZpbGVTZWFyY2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDcEMsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUV4RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsV0FBVyxJQUFJLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNFLE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFFOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUV6Qyx1RUFBdUU7QUFDdkUsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO0FBRTFGLE1BQU0sVUFBVSxlQUFlLENBQUMsTUFBa0IsRUFBRSxXQUF5QixFQUFFLGNBQWlDLEVBQUUsY0FBaUMsRUFBRSxVQUFtQjtJQUN2SyxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQzFGLE1BQU0sR0FBRyxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQ3RDLE9BQU87UUFDTixHQUFHLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLElB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