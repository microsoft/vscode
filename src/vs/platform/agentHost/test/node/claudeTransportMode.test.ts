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
		const bools: readonly boolean[] = [false, true];

		const actual: Record<string, string> = {};
		for (const allowSignedOutWhenUsable of bools) {
			for (const hasGitHubToken of bools) {
				for (const hasExistingSetup of bools) {
					const key = `flag=${allowSignedOutWhenUsable},token=${hasGitHubToken},setup=${hasExistingSetup}`;
					actual[key] = resolveClaudeTransportMode({ allowSignedOutWhenUsable, hasGitHubToken, hasExistingSetup });
				}
			}
		}

		assert.deepStrictEqual(actual, {
			'flag=false,token=false,setup=false': 'proxy', // flag off ⇒ today's default
			'flag=false,token=false,setup=true': 'proxy',  // flag off ignores setup
			'flag=false,token=true,setup=false': 'proxy',
			'flag=false,token=true,setup=true': 'proxy',
			'flag=true,token=false,setup=false': 'proxy',  // nothing usable ⇒ safe end (fails at use, not here)
			'flag=true,token=false,setup=true': 'native',  // signed out + own creds ⇒ native
			'flag=true,token=true,setup=false': 'proxy',   // signed in ⇒ prefer Copilot
			'flag=true,token=true,setup=true': 'proxy',    // signed in wins over setup
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

		test('detects each env-var credential (and ignores a blank value)', () => {
			assert.deepStrictEqual({
				none: detectExistingClaudeSetup(homeDir, {}),
				apiKey: detectExistingClaudeSetup(homeDir, { ANTHROPIC_API_KEY: 'sk-ant-api-x' }),
				authToken: detectExistingClaudeSetup(homeDir, { ANTHROPIC_AUTH_TOKEN: 'sk-ant-auth-x' }),
				baseUrl: detectExistingClaudeSetup(homeDir, { ANTHROPIC_BASE_URL: 'https://gateway.example/v1' }),
				oauthToken: detectExistingClaudeSetup(homeDir, { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-x' }),
				emptyValue: detectExistingClaudeSetup(homeDir, { ANTHROPIC_API_KEY: '' }),
				whitespaceValue: detectExistingClaudeSetup(homeDir, { ANTHROPIC_API_KEY: '   ' }),
			}, { none: false, apiKey: true, authToken: true, baseUrl: true, oauthToken: true, emptyValue: false, whitespaceValue: false });
		});

		test('detects a credential in the settings.json env block (empty env injected)', () => {
			const results: Record<string, boolean> = {};
			writeSettings(JSON.stringify({ env: { ANTHROPIC_API_KEY: 'sk-ant-api-x' } }));
			results.apiKey = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'sk-ant-auth-x' } }));
			results.authToken = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://gateway.example/v1' } }));
			results.baseUrl = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-x' } }));
			results.oauthToken = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ env: { ANTHROPIC_API_KEY: '' } }));
			results.emptyValue = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ env: { ANTHROPIC_API_KEY: '   ' } }));
			results.whitespaceValue = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ model: 'claude-sonnet-4-5' }));
			results.noEnvBlock = detectExistingClaudeSetup(homeDir, {});
			writeSettings('not json');
			results.malformed = detectExistingClaudeSetup(homeDir, {});
			// The tolerant parser salvages a partial object from a truncated file
			// rather than failing, so the credential it recovers must not count —
			// the CLI reading the same file would not get one.
			writeSettings('{ "env": { "ANTHROPIC_API_KEY": "sk-ant-api-x"');
			results.truncated = detectExistingClaudeSetup(homeDir, {});
			// Read with the same tolerant parser VS Code uses for every other
			// hand-edited config, so comments and a trailing comma still resolve.
			writeSettings('{\n\t// my key\n\t"env": { "ANTHROPIC_API_KEY": "sk-ant-api-x", },\n}');
			results.jsonc = detectExistingClaudeSetup(homeDir, {});

			assert.deepStrictEqual(results, { apiKey: true, authToken: true, baseUrl: true, oauthToken: true, emptyValue: false, whitespaceValue: false, noEnvBlock: false, malformed: false, truncated: false, jsonc: true });
		});

		test('detects the top-level apiKeyHelper alongside unrecognized settings', () => {
			const results: Record<string, boolean> = {};
			writeSettings(JSON.stringify({ apiKeyHelper: '/bin/mint-key.sh' }));
			results.helper = detectExistingClaudeSetup(homeDir, {});
			// A real settings file carries keys the validator doesn't declare; they
			// must be ignored rather than fail validation for the whole file.
			writeSettings(JSON.stringify({ apiKeyHelper: '/bin/mint-key.sh', model: 'claude-sonnet-4-5', permissions: { allow: [] } }));
			results.helperAmongOthers = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ apiKeyHelper: '' }));
			results.emptyValue = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ apiKeyHelper: 42 }));
			results.wrongType = detectExistingClaudeSetup(homeDir, {});

			assert.deepStrictEqual(results, { helper: true, helperAmongOthers: true, emptyValue: false, wrongType: false });
		});

		test('a malformed source never masks a usable one', () => {
			const results: Record<string, boolean> = {};
			writeSettings(JSON.stringify({ apiKeyHelper: '/bin/mint-key.sh', env: { ANTHROPIC_API_KEY: 42 } }));
			results.helperWithMistypedEnvKey = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ apiKeyHelper: 42, env: { ANTHROPIC_API_KEY: 'sk-ant-api-x' } }));
			results.apiKeyWithMistypedHelper = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ env: { ANTHROPIC_API_KEY: 'sk-ant-api-x', ANTHROPIC_BASE_URL: 8080 } }));
			results.apiKeyWithMistypedSibling = detectExistingClaudeSetup(homeDir, {});
			writeSettings(JSON.stringify({ apiKeyHelper: '/bin/mint-key.sh', env: 'not an object' }));
			results.helperWithNonObjectEnv = detectExistingClaudeSetup(homeDir, {});

			assert.deepStrictEqual(results, { helperWithMistypedEnvKey: true, apiKeyWithMistypedHelper: true, apiKeyWithMistypedSibling: true, helperWithNonObjectEnv: true });
		});
	});
});
