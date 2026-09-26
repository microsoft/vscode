/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubActor } from './githubPullRequestService.js';

const maintainerAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const copilotReviewerLogins = new Set(['copilot', 'copilot-pull-request-reviewer[bot]']);

export function isPullRequestFeedbackAuthor(actor: GitHubActor | undefined): boolean {
	return !!actor && (maintainerAssociations.has(actor.association?.toUpperCase() ?? '')
		|| actor.id === '175728472'
		|| copilotReviewerLogins.has(actor.login.toLowerCase()));
}
