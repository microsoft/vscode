/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Present when a directly connected client can register the host as a GitHub environment with its own GitHub credential. */
export const AgentHostGitHubEnvironmentCapabilityMetaKey = 'vscode.githubEnvironment';

export function supportsAgentHostGitHubEnvironment(result: { readonly _meta?: Readonly<Record<string, unknown>> } | undefined): boolean {
	return result?._meta?.[AgentHostGitHubEnvironmentCapabilityMetaKey] === true;
}
