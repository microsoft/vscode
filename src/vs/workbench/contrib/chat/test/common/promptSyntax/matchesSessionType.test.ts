/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { matchesSessionType } from '../../../common/promptSyntax/service/promptsService.js';

suite('matchesSessionType', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches everything when either side is unconstrained', () => {
		assert.deepStrictEqual(
			[
				matchesSessionType(undefined, 'local'),
				matchesSessionType(['local'], undefined),
				matchesSessionType([], 'local'),
			],
			[true, true, false]);
	});

	test('matches exact session types', () => {
		assert.deepStrictEqual(
			[
				matchesSessionType(['local'], 'local'),
				matchesSessionType(['local', 'agent-host-claude'], 'agent-host-claude'),
				matchesSessionType(['local'], 'agent-host-claude'),
			],
			[true, true, false]);
	});

	test('a trailing wildcard matches a whole family of session types', () => {
		const agentHostOnly = ['agent-host-*', 'remote-*'];
		assert.deepStrictEqual(
			[
				matchesSessionType(agentHostOnly, 'agent-host-claude'),
				matchesSessionType(agentHostOnly, 'agent-host-copilotcli'),
				matchesSessionType(agentHostOnly, 'remote-ssh-my-box-codex'),
				matchesSessionType(agentHostOnly, 'local'),
				matchesSessionType(agentHostOnly, 'agent-host'),
			],
			[true, true, true, false, false]);
	});
});
