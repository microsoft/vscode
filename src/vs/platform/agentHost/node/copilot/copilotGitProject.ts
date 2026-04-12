/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import type { IAgentSessionProjectInfo } from '../../common/agentService.js';

export interface ICopilotSessionContext {
	readonly cwd?: string;
	readonly gitRoot?: string;
	readonly repository?: string;
}

function execGit(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		cp.execFile('git', args, { cwd, encoding: 'utf8' }, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(stdout.trim());
		});
	});
}

export async function resolveGitProject(workingDirectory: URI | undefined): Promise<IAgentSessionProjectInfo | undefined> {
	if (!workingDirectory || workingDirectory.scheme !== Schemas.file) {
		return undefined;
	}

	const cwd = workingDirectory.fsPath;
	try {
		if ((await execGit(cwd, ['rev-parse', '--is-inside-work-tree'])) !== 'true') {
			return undefined;
		}
	} catch {
		return undefined;
	}

	let projectPath: string | undefined;
	try {
		const worktreeList = await execGit(cwd, ['worktree', 'list', '--porcelain']);
		projectPath = worktreeList.split(/\r?\n/).find(line => line.startsWith('worktree '))?.substring('worktree '.length);
	} catch {
		// Fall back to the current worktree root below.
	}

	if (!projectPath) {
		try {
			projectPath = await execGit(cwd, ['rev-parse', '--show-toplevel']);
		} catch {
			return undefined;
		}
	}

	const uri = URI.file(projectPath);
	return { uri, displayName: basename(uri.fsPath) || uri.toString() };
}

export function projectFromRepository(repository: string): IAgentSessionProjectInfo | undefined {
	const uri = repository.includes('://') ? URI.parse(repository) : URI.parse(`https://github.com/${repository}`);
	const rawDisplayName = basename(uri.path) || repository.split('/').filter(Boolean).pop() || repository;
	const displayName = rawDisplayName.endsWith('.git') ? rawDisplayName.slice(0, -'.git'.length) : rawDisplayName;
	return { uri, displayName };
}

export async function projectFromCopilotContext(context: ICopilotSessionContext | undefined): Promise<IAgentSessionProjectInfo | undefined> {
	const workingDirectory = typeof context?.cwd === 'string'
		? URI.file(context.cwd)
		: typeof context?.gitRoot === 'string'
			? URI.file(context.gitRoot)
			: undefined;
	const gitProject = await resolveGitProject(workingDirectory);
	if (gitProject) {
		return gitProject;
	}

	if (context?.repository) {
		return projectFromRepository(context.repository);
	}

	return undefined;
}
