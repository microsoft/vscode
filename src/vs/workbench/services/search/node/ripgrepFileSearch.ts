/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { rgPath } from 'vscode-ripgrep';

import { isMacintosh as isMac } from 'vs/base/common/platform';
import * as glob from 'vs/base/common/glob';
import { normalizeNFD } from 'vs/base/common/strings';

import { IFolderSearch } from './search';
import { foldersToIncludeGlobs, foldersToRgExcludeGlobs } from './ripgrepTextSearch';

export function spawnRipgrepCmd(folderQuery: IFolderSearch, includePattern: glob.IExpression, excludePattern: glob.IExpression) {
	const rgArgs = getRgArgs(folderQuery, includePattern, excludePattern);
	return {
		cmd: cp.spawn(rgPath, rgArgs.globArgs, { cwd: folderQuery.folder }),
		siblingClauses: rgArgs.siblingClauses
	};
}

function getRgArgs(folderQuery: IFolderSearch, includePattern: glob.IExpression, excludePattern: glob.IExpression) {
	const args = ['--files', '--hidden', '--case-sensitive'];

	// includePattern can't have siblingClauses
	foldersToIncludeGlobs([folderQuery], includePattern, false).forEach(globArg => {
		args.push('-g', isMac ? normalizeNFD(globArg) : globArg);
	});

	let siblingClauses: glob.IExpression;

	const rgGlobs = foldersToRgExcludeGlobs([folderQuery], excludePattern, undefined, false);
	rgGlobs.globArgs
		.forEach(rgGlob => args.push('-g', `!${isMac ? normalizeNFD(rgGlob) : rgGlob}`));
	siblingClauses = rgGlobs.siblingClauses;

	// Don't use .gitignore or .ignore
	args.push('--no-ignore');

	// Follow symlinks
	args.push('--follow');

	// Folder to search
	args.push('--');

	args.push('.');

	return { globArgs: args, siblingClauses };
}
