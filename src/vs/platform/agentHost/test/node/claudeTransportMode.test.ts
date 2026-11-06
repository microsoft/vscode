/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AccountInfo } from '@anthropic-ai/claude-agent-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isClaudeAccountSetUp, resolveClaudeTransportMode } from '../../node/claude/claudeTransportMode.js';

suite('claudeTransportMode', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolveClaudeTransportMode precedence over the full input matrix', () => {
		const bools: readonly boolean[] = [false, true];

		const actual: Record<string, string> = {};
		for (const hasGitHubToken of bools) {
			for (const hasExistingSetup of bools) {
				const key = `token=${hasGitHubToken},setup=${hasExistingSetup}`;
				actual[key] = resolveClaudeTransportMode({ hasGitHubToken, hasExistingSetup });
			}
		}

		assert.deepStrictEqual(actual, {
			'token=false,setup=false': 'proxy',
			'token=false,setup=true': 'native',
			'token=true,setup=false': 'proxy',
			'token=true,setup=true': 'proxy',
		});
	});

	suite('isClaudeAccountSetUp', () => {
		// Every row is a shape observed from a real `accountInfo()` probe — the
		// rule exists to match what the SDK actually reports.
		const cases: readonly (readonly [name: string, account: AccountInfo | undefined, expected: boolean])[] = [
			// The SDK could not be asked at all (not downloaded, or the query
			// failed). Publishing models we cannot back is the bug being fixed.
			['no report at all', undefined, false],
			// Measured with an empty `HOME` and a stripped environment. The
			// real-looking `apiProvider` here is exactly why it is not a presence
			// signal — this user has nothing configured.
			['nothing configured', { tokenSource: 'none', apiProvider: 'firstParty' }, false],
			// Same verdict without the provider field, so absence is not read as
			// third-party.
			['nothing configured, no provider field', { tokenSource: 'none' }, false],
			['empty report', {}, false],
			// `claude login` / `CLAUDE_CODE_OAUTH_TOKEN` — the keychain case no
			// filesystem check could ever see.
			['oauth token', { tokenSource: 'ANTHROPIC_AUTH_TOKEN', apiProvider: 'firstParty' }, true],
			// An API key reports through `apiKeySource` and leaves `tokenSource`
			// at its `'none'` sentinel, so testing `tokenSource` alone misses it.
			['api key', { tokenSource: 'none', apiKeySource: 'ANTHROPIC_API_KEY', apiProvider: 'firstParty' }, true],
			// The rows a later "simplification" silently breaks: for third-party
			// backends the SDK documents the credential fields as absent, because
			// auth is external (AWS creds, gcloud ADC).
			['third-party backend (bedrock)', { apiProvider: 'bedrock' }, true],
			['third-party backend (vertex)', { apiProvider: 'vertex' }, true],
			['enterprise gateway', { apiProvider: 'gateway' }, true],
		];

		test('maps observed SDK account reports onto one set-up answer', () => {
			assert.deepStrictEqual(
				Object.fromEntries(cases.map(([name, account]) => [name, isClaudeAccountSetUp(account)])),
				Object.fromEntries(cases.map(([name, , expected]) => [name, expected])));
		});
	});
});
