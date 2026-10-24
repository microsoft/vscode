/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../log/common/log.js';
import { AgentBranchNameGenerator } from '../../../node/shared/agentBranchNameGenerator.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';

suite('AgentBranchNameGenerator Git policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createGenerator() {
		let calls = 0;
		const api = new class extends mock<ICopilotApiService>() {
			override async utilityChatCompletion() {
				calls++;
				return 'add-agent-host-config';
			}
		}();
		return { generator: new AgentBranchNameGenerator(api, new NullLogService()), calls: () => calls };
	}

	test('complete Git candidates skip the model and preserve collision suffixes', async () => {
		const { generator, calls } = createGenerator();
		const request = { sessionId: '12345678-aaaa', message: 'Add a feature', githubToken: 'token', useGitSettings: true, branchPrefix: 'user/', preferredBranchName: 'user/quiet-brisk-otter' };
		assert.deepStrictEqual({
			name: await generator.generateBranchName(request),
			collision: await generator.generateBranchName({ ...request, branchNameCollides: async name => name === request.preferredBranchName }),
			calls: calls(),
		}, { name: 'user/quiet-brisk-otter', collision: 'user/quiet-brisk-otter-12345678', calls: 0 });
	});

	test('prompt naming uses verbatim prefixes, including empty and intermediate-dot prefixes', async () => {
		const { generator } = createGenerator();
		const request = { sessionId: '12345678', message: 'Add agent host config', useGitSettings: true };
		assert.deepStrictEqual({
			custom: await generator.generateBranchName({ ...request, branchPrefix: 'user/', githubToken: 'token' }),
			empty: await generator.generateBranchName({ ...request, branchPrefix: '' }),
			dotted: await generator.generateBranchName({ ...request, branchPrefix: 'team./' }),
			fallback: await generator.generateBranchName({ sessionId: request.sessionId, useGitSettings: true }),
			default: await generator.generateBranchName({ ...request, useGitSettings: false, branchPrefix: 'user/' }),
		}, {
			custom: 'user/add-agent-host-config', empty: 'add-agent-host-config', dotted: 'team./add-agent-host-config',
			fallback: '12345678', default: 'user/agents/add-agent-host-config',
		});
	});

	test('invalid complete candidates fail explicitly', async () => {
		const { generator } = createGenerator();
		for (const preferredBranchName of ['', '../outside', 'user/a.lock', 'user/bad name', 'user/a\\b', 'user/@{bad', 'user//topic', 'user/topic.']) {
			await assert.rejects(generator.generateBranchName({ sessionId: '12345678', useGitSettings: true, preferredBranchName }), /Invalid Git branch name/);
		}
	});
});
