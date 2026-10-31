/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubActor } from './githubPullRequestService.js';

const maintainerAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const copilotReviewerLogins = new Set(['copilot', 'copilot-pull-request-reviewer']);

export function isCopilotReviewAuthor(login: string | undefined): boolean {
	return !!login && copilotReviewerLogins.has(login.toLowerCase().replace(/\[bot\]$/, ''));
}

export function isPullRequestFeedbackAuthor(actor: GitHubActor | undefined): boolean {
	return !!actor && (maintainerAssociations.has(actor.association?.toUpperCase() ?? '')
		|| actor.id === '175728472'
		|| isCopilotReviewAuthor(actor.login));
}
