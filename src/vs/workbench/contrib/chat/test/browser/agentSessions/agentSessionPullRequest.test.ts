/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getAgentSessionPullRequestContextValue, getAgentSessionPullRequestUri } from '../../../browser/agentSessions/agentSessionsModel.js';

suite('agentSessionPullRequest', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function probe(metadata: { [key: string]: unknown } | undefined) {
		return {
			uri: getAgentSessionPullRequestUri({ metadata })?.toString(),
			contextValue: getAgentSessionPullRequestContextValue({ metadata })
		};
	}

	test('resolves from pullRequestUrl, falls back to number + owner/name, otherwise none', () => {
		assert.deepStrictEqual([
			probe(undefined),
			probe({}),
			probe({ pullRequestUrl: 'https://github.com/microsoft/vscode/pull/42' }),
			probe({ pullRequestNumber: 42, owner: 'microsoft', name: 'vscode' }),
			// A task-backed cloud session that has not produced a pull request.
			probe({ owner: 'microsoft', name: 'vscode', branch: 'copilot/fix-1' }),
			// Partial data is not enough to build a pull request url.
			probe({ pullRequestNumber: 42, owner: 'microsoft' }),
			// Empty owner/name would produce `https://github.com///pull/42`.
			probe({ pullRequestNumber: 42, owner: '', name: '' }),
			probe({ pullRequestNumber: 42, owner: 'microsoft', name: '' }),
			// Non-string/number metadata must not be coerced.
			probe({ pullRequestUrl: 42 }),
			probe({ pullRequestNumber: '42', owner: 'microsoft', name: 'vscode' }),
		], [
			{ uri: undefined, contextValue: 'none' },
			{ uri: undefined, contextValue: 'none' },
			{ uri: 'https://github.com/microsoft/vscode/pull/42', contextValue: 'available' },
			{ uri: 'https://github.com/microsoft/vscode/pull/42', contextValue: 'available' },
			{ uri: undefined, contextValue: 'none' },
			{ uri: undefined, contextValue: 'none' },
			{ uri: undefined, contextValue: 'none' },
			{ uri: undefined, contextValue: 'none' },
			{ uri: undefined, contextValue: 'none' },
			{ uri: undefined, contextValue: 'none' },
		]);
	});
});
