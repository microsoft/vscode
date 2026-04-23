/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { extUri, basename } from '../../base/common/resources.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { URI } from '../../base/common/uri.js';
import { ISessionWorkspace } from '../services/sessions/common/session.js';

export interface IAgentHostSessionProjectSummary {
	readonly uri: URI;
	readonly displayName: string;
}

export interface IAgentHostSessionWorkspaceOptions {
	readonly providerLabel?: string;
	readonly fallbackIcon: ThemeIcon;
	readonly requiresWorkspaceTrust: boolean;
	readonly description?: string;
}

export function agentHostSessionWorkspaceKey(workspace: ISessionWorkspace | undefined): string | undefined {
	const repository = workspace?.repositories[0];
	return workspace && repository ? `${workspace.label}\n${extUri.getComparisonKey(repository.uri)}\n${repository.workingDirectory ? extUri.getComparisonKey(repository.workingDirectory) : ''}` : undefined;
}

export function buildAgentHostSessionWorkspace(project: IAgentHostSessionProjectSummary | undefined, workingDirectory: URI | undefined, options: IAgentHostSessionWorkspaceOptions): ISessionWorkspace | undefined {
	if (project) {
		const repositoryWorkingDirectory = extUri.isEqual(workingDirectory, project.uri) ? undefined : workingDirectory;
		return {
			label: options.providerLabel ? `${project.displayName} [${options.providerLabel}]` : project.displayName,
			description: options.description,
			icon: Codicon.repo,
			repositories: [{ uri: project.uri, workingDirectory: repositoryWorkingDirectory, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: options.requiresWorkspaceTrust,
		};
	}

	if (!workingDirectory) {
		return undefined;
	}

	const folderName = basename(workingDirectory) || workingDirectory.path;
	return {
		label: options.providerLabel ? `${folderName} [${options.providerLabel}]` : folderName,
		description: options.description,
		icon: options.fallbackIcon,
		repositories: [{ uri: workingDirectory, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
		requiresWorkspaceTrust: options.requiresWorkspaceTrust,
	};
}
