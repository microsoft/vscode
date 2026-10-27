/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function readProvenance(root) {
	const git = args => execFileSync('git', args, {
		cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true,
	}).trim();
	return parseProvenance(
		git(['status', '--porcelain=v2', '--branch', '--untracked-files=normal']),
		git(['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--show-toplevel']).split('\n'));
}

export function parseProvenance(status, paths) {
	const lines = status.split('\n');
	const branchLine = lines.find(line => line.startsWith('# branch.head '));
	const commitLine = lines.find(line => line.startsWith('# branch.oid '));
	if (!branchLine || !commitLine) {
		throw new Error('Git did not provide branch and commit metadata for the canvas source.');
	}
	const branch = branchLine.slice('# branch.head '.length);
	const commit = commitLine.slice('# branch.oid '.length);
	if (paths.length !== 3) {
		throw new Error('Git did not provide worktree metadata for the canvas source.');
	}
	const [gitDirectory, commonDirectory, worktreePath] = paths;
	return {
		kind: gitDirectory !== commonDirectory ? 'Local worktree' : branch === 'main' ? 'Local main checkout' : 'Local checkout',
		branch: branch === '(detached)' ? 'Detached HEAD' : branch,
		commit,
		worktree: path.basename(worktreePath),
		worktreePath,
		modified: lines.some(line => /^[12u?] /.test(line)),
		deployment: 'Local source; not a verified deployment of main.',
	};
}
