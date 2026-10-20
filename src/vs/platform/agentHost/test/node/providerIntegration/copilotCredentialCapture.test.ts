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

	test('normalizes platform line endings without changing tool instructions', () => {
		const home = 'C:\\test-home';
		const scoped = '<ask_user>Ask</ask_user>\n<sql>Database access</sql>\n<session_store_sql>History access</session_store_sql>\n<rg>Search</rg>\n<environment_context>C:\\test-home\\A</environment_context>';
		const legacy = '<ask_user>Ask</ask_user>\n<sql>Database access</sql>\n<session_store_sql>History access</session_store_sql>\n<rg>Search</rg>\n<environment_context>C:\\test-home\\L</environment_context>';
		assert.deepStrictEqual(['\n', '\r\n'].flatMap(eol => [
			normalizeTestSystemPrompt(scoped.replaceAll('\n', eol), `${home}\\A`, home),
			normalizeTestSystemPrompt(legacy.replaceAll('\n', eol), `${home}\\L`, home),
		]), Array(4).fill('<ask_user>Ask</ask_user>\n<sql>Database access</sql>\n<session_store_sql>History access</session_store_sql>\n<rg>Search</rg>\n<environment_context><workspace></environment_context>'));
	});

	test('preserves unreviewed prompt differences', () => {
		assert.notStrictEqual(
			normalizeTestSystemPrompt('<environment_context>Available</environment_context>', '/test/A', '/test'),
			normalizeTestSystemPrompt('<environment_context>Unavailable</environment_context>', '/test/L', '/test'),
		);
	});

	test('normalizes only the known workspace and home in JSON-escaped Windows environment context', () => {
		const home = 'C:\\test-home';
		assert.deepStrictEqual(['A', 'L'].map(name => normalizeTestSystemPrompt(
			JSON.stringify({ workingDirectory: `${home}\\${name}`, home, otherDirectory: 'C:\\unrelated' }),
			`${home}\\${name}`, home,
		)), Array(2).fill('{"workingDirectory":"<workspace>","home":"<home>","otherDirectory":"C:\\\\unrelated"}'));
	});

	test('normalizes the known Windows drive casing used by URI.fsPath without changing other paths', () => {
		const home = 'C:\\test-home';
		assert.deepStrictEqual(['A', 'L'].flatMap(name => ['\\', '/'].map(separator => normalizeTestSystemPrompt(
			`<environment_context>${JSON.stringify({
				workingDirectory: `c:\\test-home\\${name}`.replaceAll('\\', separator),
				home: 'c:\\test-home'.replaceAll('\\', separator),
				otherDirectory: 'c:\\unrelated',
			})}</environment_context>`,
			`${home}\\${name}`, home,
		))), Array(4).fill('<environment_context>{"workingDirectory":"<workspace>","home":"<home>","otherDirectory":"c:\\\\unrelated"}</environment_context>'));
	});
});
