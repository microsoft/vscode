/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { credentialEnvironmentSentinels, fakeCapiCredentialForLabel, labelTestCredential, normalizeTestSystemPrompt } from './copilotCredentialTestUtils.js';

suite('Copilot credential test capture', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('retains only known fake labels and never mints a token from unknown input', () => {
		const unexpected = 'fake-but-unrecognized-sensitive-input';
		const captured = {
			known: ['Bearer scope-a', 'token scope-b', 'legacy-l', 'scope-a-rotated', 'FAKE_CAPI_A'].map(labelTestCredential),
			environment: Object.values(credentialEnvironmentSentinels).map(labelTestCredential),
			missing: labelTestCredential(undefined),
			unexpected: labelTestCredential(unexpected),
			exchange: fakeCapiCredentialForLabel(labelTestCredential(unexpected)),
		};
		assert.deepStrictEqual(captured, {
			known: ['A', 'B', 'L', 'AR', 'CAPI_A'],
			environment: ['ENV_GH_TOKEN', 'ENV_GITHUB_TOKEN', 'ENV_COPILOT_GITHUB_TOKEN', 'ENV_COPILOT_SDK_AUTH_TOKEN', 'ENV_OPENAI_API_KEY'],
			missing: 'NONE', unexpected: 'UNEXPECTED', exchange: undefined,
		});
		assert.strictEqual(JSON.stringify(captured).includes(unexpected), false);
	});

	test('normalizes reviewed SQL sections without leaving platform-dependent blank lines', () => {
		const home = 'C:\\test-home';
		const scoped = '<ask_user>Ask</ask_user>\n<rg>Search</rg>\n<environment_context>C:\\test-home\\A</environment_context>';
		const legacy = '<ask_user>Ask</ask_user>\n<sql>Database access</sql>\n<session_store_sql>History access</session_store_sql>\n<rg>Search</rg>\n<environment_context>C:\\test-home\\L</environment_context>';
		assert.deepStrictEqual(['\n', '\r\n'].flatMap(eol => [
			normalizeTestSystemPrompt(scoped.replaceAll('\n', eol), `${home}\\A`, home),
			normalizeTestSystemPrompt(legacy.replaceAll('\n', eol), `${home}\\L`, home),
		]), Array(4).fill('<ask_user>Ask</ask_user>\n<rg>Search</rg>\n<environment_context><workspace></environment_context>'));
	});

	test('preserves unreviewed prompt differences', () => {
		assert.notStrictEqual(
			normalizeTestSystemPrompt('<environment_context>Available</environment_context>', '/test/A', '/test'),
			normalizeTestSystemPrompt('<environment_context>Unavailable</environment_context>', '/test/L', '/test'),
		);
	});
});
