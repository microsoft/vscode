/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GitHubActor } from '../../common/githubPullRequestService.js';
import { isCopilotReviewAuthor, isPullRequestFeedbackAuthor } from '../../common/pullRequestFeedback.js';

suite('PullRequestFeedback', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes REST and GraphQL reviewer identities without accepting coding-agent replies or lookalikes', () => {
		const logins = ['copilot', 'Copilot[bot]', 'copilot-pull-request-reviewer', 'COPILOT-PULL-REQUEST-REVIEWER[bot]', 'copilot-swe-agent', 'my-copilot-account', 'reviewer'];
		assert.deepStrictEqual(logins.map(login => [
			isCopilotReviewAuthor(login),
			isPullRequestFeedbackAuthor(upcastPartial<GitHubActor>({ login })),
		]), [[true, true], [true, true], [true, true], [true, true], [false, false], [false, false], [false, false]]);
		assert.deepStrictEqual(['OWNER', 'member', 'COLLABORATOR'].map(association =>
			isPullRequestFeedbackAuthor(upcastPartial<GitHubActor>({ login: 'reviewer', association }))), [true, true, true]);
	});
});
