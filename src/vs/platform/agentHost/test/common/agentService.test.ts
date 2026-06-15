/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession, isAgentEnabled } from '../../common/agentService.js';

suite('AgentSession namespace', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uri creates a URI with provider as scheme and id as path', () => {
		const session = AgentSession.uri('copilot', 'abc-123');
		assert.strictEqual(session.scheme, 'copilot');
		assert.strictEqual(session.path, '/abc-123');
	});

	test('id extracts the raw session ID from a session URI', () => {
		const session = URI.from({ scheme: 'copilot', path: '/my-session-42' });
		assert.strictEqual(AgentSession.id(session), 'my-session-42');
	});

	test('uri and id are inverse operations', () => {
		const rawId = 'test-session-xyz';
		const session = AgentSession.uri('copilot', rawId);
		assert.strictEqual(AgentSession.id(session), rawId);
	});

	test('provider extracts copilot from a copilot-scheme URI', () => {
		const session = AgentSession.uri('copilot', 'sess-1');
		assert.strictEqual(AgentSession.provider(session), 'copilot');
	});
});

suite('isAgentEnabled', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const cases: ReadonlyArray<{ envValue: string | undefined; defaultEnabled: boolean; expected: boolean; description: string }> = [
		// Fallback to default
		{ envValue: undefined, defaultEnabled: true, expected: true, description: 'undefined falls back to default=true' },
		{ envValue: undefined, defaultEnabled: false, expected: false, description: 'undefined falls back to default=false' },
		{ envValue: '', defaultEnabled: true, expected: true, description: 'empty string falls back to default=true' },
		{ envValue: '', defaultEnabled: false, expected: false, description: 'empty string falls back to default=false' },
		{ envValue: '   ', defaultEnabled: true, expected: true, description: 'whitespace-only falls back to default=true' },
		{ envValue: 'maybe', defaultEnabled: true, expected: true, description: 'unrecognized value falls back to default=true' },
		{ envValue: 'maybe', defaultEnabled: false, expected: false, description: 'unrecognized value falls back to default=false' },
		// Explicit enable
		{ envValue: 'true', defaultEnabled: false, expected: true, description: '"true" enables even when default=false' },
		{ envValue: 'TRUE', defaultEnabled: false, expected: true, description: '"TRUE" is case-insensitive' },
		{ envValue: '  true  ', defaultEnabled: false, expected: true, description: '"true" with whitespace is trimmed' },
		{ envValue: '1', defaultEnabled: false, expected: true, description: '"1" enables even when default=false' },
		// Explicit disable
		{ envValue: 'false', defaultEnabled: true, expected: false, description: '"false" disables even when default=true' },
		{ envValue: 'FALSE', defaultEnabled: true, expected: false, description: '"FALSE" is case-insensitive' },
		{ envValue: '  false  ', defaultEnabled: true, expected: false, description: '"false" with whitespace is trimmed' },
		{ envValue: '0', defaultEnabled: true, expected: false, description: '"0" disables even when default=true' },
	];

	for (const { envValue, defaultEnabled, expected, description } of cases) {
		test(description, () => {
			assert.strictEqual(isAgentEnabled(envValue, defaultEnabled), expected);
		});
	}
});
