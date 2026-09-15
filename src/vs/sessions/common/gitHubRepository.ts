/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getGitHubRepositoryId(repository: string): string | undefined {
	const match = /^(?:(?:https?|ssh|git):\/\/(?:git@)?github\.com\/|git@github\.com:)?(?<owner>[^/:\s]+)\/(?<repo>[^/\s]+?)(?:\.git)?\/?$/i.exec(repository);
	return match?.groups ? `${match.groups.owner}/${match.groups.repo}` : undefined;
}
