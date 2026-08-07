/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { computeSessionFileDiffsAgainstDefaultBranch } from '../../node/agentHostChangesetService.js';

suite('computeSessionFileDiffsAgainstDefaultBranch', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes the resolved default branch to the session diff', async () => {
		const calls: { repositoryRoot: string; sessionUri: string; baseBranch: string | undefined }[] = [];
		const gitService: Pick<IAgentHostGitService, 'getDefaultBranch' | 'computeSessionFileDiffs'> = {
			getDefaultBranch: async () => ({ name: 'main', startPoint: 'origin/main' }),
			computeSessionFileDiffs: async (repositoryRoot, options) => {
				calls.push({ repositoryRoot: repositoryRoot.toString(), sessionUri: options.sessionUri, baseBranch: options.baseBranch });
				return [];
			},
		};

		const result = await computeSessionFileDiffsAgainstDefaultBranch(gitService, URI.file('/repo'), 'copilotcli:/session');

		assert.deepStrictEqual({ result, calls }, {
			result: [],
			calls: [{ repositoryRoot: URI.file('/repo').toString(), sessionUri: 'copilotcli:/session', baseBranch: 'main' }],
		});
	});

	test('requests fallback when the repository has no default branch', async () => {
		let computeCalled = false;
		const gitService: Pick<IAgentHostGitService, 'getDefaultBranch' | 'computeSessionFileDiffs'> = {
			getDefaultBranch: async () => undefined,
			computeSessionFileDiffs: async () => {
				computeCalled = true;
				return [];
			},
		};

		const result = await computeSessionFileDiffsAgainstDefaultBranch(gitService, URI.file('/repo'), 'copilotcli:/session');

		assert.deepStrictEqual({ result, computeCalled }, { result: undefined, computeCalled: false });
	});
});
