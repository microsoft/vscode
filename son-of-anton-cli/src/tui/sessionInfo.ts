/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import * as path from 'path';
import type { TuiSessionInfo } from './types';

/**
 * Synchronously gathers the static facts shown in the status bar. Git branch
 * resolution happens via `git symbolic-ref` rather than reading `.git/HEAD`
 * directly so worktrees and detached-HEAD states are surfaced correctly.
 */
export function loadSessionInfo(specialist: string, model: string): TuiSessionInfo {
	const cwd = process.cwd();
	let branch: string | undefined;
	try {
		const out = execFileSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], {
			cwd,
			stdio: ['ignore', 'pipe', 'ignore'],
			encoding: 'utf8',
			timeout: 500,
		}).trim();
		branch = out || undefined;
	} catch {
		// Not a git repo, or git missing — branch stays undefined.
	}
	return {
		specialist,
		model,
		cwd: path.resolve(cwd),
		branch,
	};
}
