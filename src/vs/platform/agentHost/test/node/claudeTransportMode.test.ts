/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { detectExistingClaudeSetup, resolveClaudeTransportMode } from '../../node/claude/claudeTransportMode.js';

suite('claudeTransportMode', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolveClaudeTransportMode precedence over the full input matrix', () => {
		const explicitValues: readonly (boolean | undefined)[] = [undefined, true, false];
		const bools: readonly boolean[] = [false, true];

		const actual: Record<string, string> = {};
		for (const explicitProxy of explicitValues) {
			for (const allowSignedOutWhenUsable of bools) {
				for (const hasGitHubToken of bools) {
					for (const hasExistingSetup of bools) {
						const key = `explicit=${explicitProxy},flag=${allowSignedOutWhenUsable},token=${hasGitHubToken},setup=${hasExistingSetup}`;
						actual[key] = resolveClaudeTransportMode({ explicitProxy, allowSignedOutWhenUsable, hasGitHubToken, hasExistingSetup });
					}
				}
			}
		}

		assert.deepStrictEqual(actual, {
			// Explicit unset: the flag/sign-in/setup rules decide.
			'explicit=undefined,flag=false,token=false,setup=false': 'proxy', // flag off ⇒ today's default
			'explicit=undefined,flag=false,token=false,setup=true': 'proxy',  // flag off ignores setup
			'explicit=undefined,flag=false,token=true,setup=false': 'proxy',
			'explicit=undefined,flag=false,token=true,setup=true': 'proxy',
			'explicit=undefined,flag=true,token=false,setup=false': 'proxy',  // nothing usable ⇒ requires-GitHub
			'explicit=undefined,flag=true,token=false,setup=true': 'native',  // signed out + own creds ⇒ native
			'explicit=undefined,flag=true,token=true,setup=false': 'proxy',   // signed in ⇒ prefer Copilot
			'explicit=undefined,flag=true,token=true,setup=true': 'proxy',    // signed in wins over setup
			// Explicit proxy=true: hard override, always proxy.
			'explicit=true,flag=false,token=false,setup=false': 'proxy',
			'explicit=true,flag=false,token=false,setup=true': 'proxy',
			'explicit=true,flag=false,token=true,setup=false': 'proxy',
			'explicit=true,flag=false,token=true,setup=true': 'proxy',
			'explicit=true,flag=true,token=false,setup=false': 'proxy',
			'explicit=true,flag=true,token=false,setup=true': 'proxy',
			'explicit=true,flag=true,token=true,setup=false': 'proxy',
			'explicit=true,flag=true,token=true,setup=true': 'proxy',
			// Explicit proxy=false: hard override, always native.
			'explicit=false,flag=false,token=false,setup=false': 'native',
			'explicit=false,flag=false,token=false,setup=true': 'native',
			'explicit=false,flag=false,token=true,setup=false': 'native',
			'explicit=false,flag=false,token=true,setup=true': 'native',
			'explicit=false,flag=true,token=false,setup=false': 'native',
			'explicit=false,flag=true,token=false,setup=true': 'native',
			'explicit=false,flag=true,token=true,setup=false': 'native',
			'explicit=false,flag=true,token=true,setup=true': 'native',
		});
	});

	suite('detectExistingClaudeSetup', () => {
		// The credential env is injected explicitly (never `process.env`), so the
		// ambient machine's real credentials can't leak into the assertions and no
		// global is mutated. The file source is exercised through a real temp home.
		let homeDir: string;

		setup(async () => {
			homeDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'claude-setup-detect-'));
		});

		teardown(async () => {
			await fs.promises.rm(homeDir, { recursive: true, force: true });
		});

		function writeSettings(contents: string): void {
			const dir = join(homeDir, '.claude');
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(join(dir, 'settings.json'), contents, 'utf8');
		}

		test('detects each env-var credential (and ignores an empty value)', () => {
			assert.deepStrictEqual({
				none: detectExistingClaudeSetup(homeDir, {}),
				apiKey: detectExistingClaudeSetup(homeDir, { ANTHROPIC_API_KEY: 'sk-ant-api-x' }),
				oauthToken: detectExistingClaudeSetup(homeDir, { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-x' }),
				emptyValue: detectExistingClaudeSetup(homeDir, { ANTHROPIC_API_KEY: '' }),
			}, { none: false, apiKey: true, oauthToken: true, emptyValue: false });
		});

		test('detects a credential in the settings.json env block (empty env injected)', () => {
			const results: Record<string, boolean> = {};
			writeSettings(JSON.stringify({ env: { ANTHROPIC_API_KEY: 'sk-ant-api-x' } }));
			results.apiKey = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-x' } }));
			results.oauthToken = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ env: { ANTHROPIC_API_KEY: '' } }));
			results.emptyValue = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ model: 'claude-sonnet-4-5' }));
			results.noEnvBlock = detectExistingClaudeSetup(homeDir, {});
			writeSettings('not json');
			results.malformed = detectExistingClaudeSetup(homeDir, {});

			assert.deepStrictEqual(results, { apiKey: true, oauthToken: true, emptyValue: false, noEnvBlock: false, malformed: false });
		});
	});
});
