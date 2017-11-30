/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { rgPath } from 'vscode-ripgrep';

import { isMacintosh as isMac } from 'vs/base/common/platform';
import * as glob from 'vs/base/common/glob';
import { normalizeNFD, startsWith } from 'vs/base/common/strings';

import { IFolderSearch, IRawSearch } from './search';
import { foldersToIncludeGlobs, foldersToRgExcludeGlobs } from './ripgrepTextSearch';

export function spawnRipgrepCmd(config: IRawSearch, folderQuery: IFolderSearch, includePattern: glob.IExpression, excludePattern: glob.IExpression) {
	const rgArgs = getRgArgs(config, folderQuery, includePattern, excludePattern);
	return {
		cmd: cp.spawn(rgPath, rgArgs.globArgs, { cwd: folderQuery.folder }),
		siblingClauses: rgArgs.siblingClauses
	};
}

function getRgArgs(config: IRawSearch, folderQuery: IFolderSearch, includePattern: glob.IExpression, excludePattern: glob.IExpression) {
	const args = ['--files', '--hidden', '--case-sensitive'];

	// includePattern can't have siblingClauses
	foldersToIncludeGlobs([folderQuery], includePattern, false).forEach(globArg => {
		args.push('-g', anchor(isMac ? normalizeNFD(globArg) : globArg));
	});

	let siblingClauses: glob.IExpression;

	const rgGlobs = foldersToRgExcludeGlobs([folderQuery], excludePattern, undefined, false);
	rgGlobs.globArgs
		.forEach(rgGlob => args.push('-g', `!${anchor(isMac ? normalizeNFD(rgGlob) : rgGlob)}`));
	siblingClauses = rgGlobs.siblingClauses;

	if (folderQuery.disregardIgnoreFiles !== false) {
		// Don't use .gitignore or .ignore
		args.push('--no-ignore');
	}

	// Follow symlinks
	if (!config.ignoreSymlinks) {
		args.push('--follow');
	}

	if (config.exists) {
		args.push('--quiet');
	}

	// Folder to search
	args.push('--');

	args.push('.');

	return { globArgs: args, siblingClauses };
}

function anchor(glob: string) {
	return startsWith(glob, '**') || startsWith(glob, '/') ? glob : `/${glob}`;
}