/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ThreadAvatarIds } from '../../../../services/threads/browser/threadsService.js';
import { buildThreadAutomationPrompt } from '../../browser/threadSetupService.js';

suite('ThreadSetupService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes associated Automation prompts into the persistent Thread', () => {
		const prompt = buildThreadAutomationPrompt({
			id: 'thread',
			name: 'Design partner',
			sessionId: 'session',
			sessionResource: URI.parse('agent-host-session://host/session'),
			providerId: 'local-agent-host',
			sessionTypeId: 'copilot',
			scope: { kind: 'global' },
			avatar: ThreadAvatarIds.Artist,
			connectorIds: [],
			automationIds: [],
			archived: false,
			createdAt: 1,
			updatedAt: 1,
		}, 'Review new design feedback.');

		assert.deepStrictEqual(prompt.split('\n'), [
			'This Automation belongs to the persistent Thread "Design partner".',
			'Use send_message exactly once with session "agent-host-session://host/session", delivery "queue", and the following complete message:',
			'',
			'Review new design feedback.',
			'',
			'Do not perform the requested work in this Automation run. The persistent Thread must receive and perform it.',
		]);
	});
});
