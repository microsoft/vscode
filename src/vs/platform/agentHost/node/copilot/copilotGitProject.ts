/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import type { IAgentSessionProjectInfo } from '../../common/agentService.js';
import type { IAgentHostGitService } from '../agentHostGitService.js';

export interface ICopilotSessionContext {
	readonly cwd?: string;
	readonly gitRoot?: string;
	readonly repository?: string;
}

export async function resolveGitProject(workingDirectory: URI | undefined, gitService: IAgentHostGitService): Promise<IAgentSessionProjectInfo | undefined> {
	if (!workingDirectory || workingDirectory.scheme !== Schemas.file) {
		return undefined;
	}

	if (!await gitService.isInsideWorkTree(workingDirectory)) {
		return undefined;
	}

	const uri = (await gitService.getWorktreeRoots(workingDirectory))[0]
		?? await gitService.getRepositoryRoot(workingDirectory);
	if (!uri) {
		return undefined;
	}
	return { uri, displayName: basename(uri.fsPath) || uri.toString() };
}

export function projectFromRepository(repository: string): IAgentSessionProjectInfo | undefined {
	const uri = repository.includes('://') ? URI.parse(repository) : URI.parse(`https://github.com/${repository}`);
	const rawDisplayName = basename(uri.path) || repository.split('/').filter(Boolean).pop() || repository;
	const displayName = rawDisplayName.endsWith('.git') ? rawDisplayName.slice(0, -'.git'.length) : rawDisplayName;
	return { uri, displayName };
}

export async function projectFromCopilotContext(context: ICopilotSessionContext | undefined, gitService: IAgentHostGitService): Promise<IAgentSessionProjectInfo | undefined> {
	const workingDirectory = typeof context?.cwd === 'string'
		? URI.file(context.cwd)
		: typeof context?.gitRoot === 'string'
			? URI.file(context.gitRoot)
			: undefined;
	const gitProject = await resolveGitProject(workingDirectory, gitService);
	if (gitProject) {
		return gitProject;
	}

	if (context?.repository) {
		return projectFromRepository(context.repository);
	}

	return undefined;
}
