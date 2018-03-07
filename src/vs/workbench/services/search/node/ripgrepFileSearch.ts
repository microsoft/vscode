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

// If vscode-ripgrep is in an .asar file, then the binary is unpacked.
const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');

export function spawnRipgrepCmd(config: IRawSearch, folderQuery: IFolderSearch, includePattern: glob.IExpression, excludePattern: glob.IExpression) {
	const rgArgs = getRgArgs(config, folderQuery, includePattern, excludePattern);
	const cwd = folderQuery.folder;
	return {
		cmd: cp.spawn(rgDiskPath, rgArgs.args, { cwd }),
		siblingClauses: rgArgs.siblingClauses,
		rgArgs,
		cwd
	};
}

function getRgArgs(config: IRawSearch, folderQuery: IFolderSearch, includePattern: glob.IExpression, excludePattern: glob.IExpression) {
	const args = ['--files', '--hidden', '--case-sensitive'];

	// includePattern can't have siblingClauses
	foldersToIncludeGlobs([folderQuery], includePattern, false).forEach(globArg => {
		const inclusion = anchor(globArg);
		args.push('-g', inclusion);
		if (isMac) {
			const normalized = normalizeNFD(inclusion);
			if (normalized !== inclusion) {
				args.push('-g', normalized);
			}
		}
	});

	let siblingClauses: glob.IExpression;

	const rgGlobs = foldersToRgExcludeGlobs([folderQuery], excludePattern, undefined, false);
	rgGlobs.globArgs.forEach(globArg => {
		const exclusion = `!${anchor(globArg)}`;
		args.push('-g', exclusion);
		if (isMac) {
			const normalized = normalizeNFD(exclusion);
			if (normalized !== exclusion) {
				args.push('-g', normalized);
			}
		}
	});
	siblingClauses = rgGlobs.siblingClauses;

	if (folderQuery.disregardIgnoreFiles !== false) {
		// Don't use .gitignore or .ignore
		args.push('--no-ignore');
	} else {
		args.push('--no-ignore-parent');
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

	return { args, siblingClauses };
}

function anchor(glob: string) {
	return startsWith(glob, '**') || startsWith(glob, '/') ? glob : `/${glob}`;
}