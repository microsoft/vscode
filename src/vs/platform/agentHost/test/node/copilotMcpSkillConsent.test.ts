/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseCopilotMcpSkillConsentRequest } from '../../node/copilot/copilotMcpSkillConsent.js';

suite('parseCopilotMcpSkillConsentRequest', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const origin = (name: string, id = name) => `Server: ${name} (${id})\nSkill: mcp-skill://${id}/example\nManifest: abc123`;
	const question = (action: string, origins = origin('test-server')) => `Allow this MCP skill ${action} operation?\n\n${origins}\n\nOperation:\n{\n  "tool": "example"\n}`;
	const choices = ['Allow once', 'Decline'];

	for (const action of ['load', 'execute', 'cross-origin-read'] as const) {
		test(`recognizes ${action} and keeps unique server names in origin order`, () => {
			assert.deepStrictEqual(parseCopilotMcpSkillConsentRequest({
				question: question(action, [origin('server (one)', 'first'), origin('server-two'), origin('server (one)', 'another')].join('\n\n')),
				choices,
				allowFreeform: false,
			}), { action, servers: ['server (one)', 'server-two'], approveChoice: 'Allow once', declineChoice: 'Decline' });
		});
	}

	test('rejects generic questions, unsupported actions, malformed origins and incomplete choices', () => {
		const invalid = [
			{ question: 'What should I do?', choices },
			{ question: question('delete'), choices },
			{ question: `Please confirm: ${question('load')}`, choices },
			{ question: question('load', 'Server: test-server\nSkill: example\nManifest: abc'), choices },
			{ question: question('load', 'Server: test-server (id)\nSkill: example'), choices },
			{ question: question('load', `${origin('test-server')}\n\nUnrecognized origin`), choices },
			{ question: question('load').replace('Operation:\n', 'Parameters:\n'), choices },
			{ question: question('load'), choices: ['Allow Once', 'Decline'] },
			{ question: question('load'), choices: ['Allow once'] },
			{ question: question('load') },
		];
		assert.deepStrictEqual(invalid.map(parseCopilotMcpSkillConsentRequest), invalid.map(() => undefined));
	});

	test('does not interpret server lines embedded in operation parameters as origins', () => {
		assert.deepStrictEqual(parseCopilotMcpSkillConsentRequest({
			question: `${question('execute')}\nServer: not-an-origin (id)`, choices,
		}), { action: 'execute', servers: ['test-server'], approveChoice: 'Allow once', declineChoice: 'Decline' });
	});
});
