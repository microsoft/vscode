/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import os from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { detectExistingCodexChatGPTSetup } from '../../../node/codex/codexLocalAuth.js';

suite('Codex local auth detection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	async function withCodexHome(run: (codexHome: string, env: NodeJS.ProcessEnv) => Promise<void>): Promise<void> {
		const codexHome = await fs.mkdtemp(join(os.tmpdir(), 'vscode-codex-auth-test-'));
		try {
			await run(codexHome, { CODEX_HOME: codexHome });
		} finally {
			await fs.rm(codexHome, { recursive: true, force: true });
		}
	}

	test('recognizes persisted ChatGPT token modes', async () => withCodexHome(async (codexHome, env) => {
		for (const auth of [
			{ auth_mode: 'chatgpt', tokens: { access_token: 'access', refresh_token: 'refresh' } },
			{ auth_mode: 'chatgptAuthTokens', tokens: { access_token: 'access' } },
			{ auth_mode: 'personalAccessToken', personal_access_token: 'pat' },
			{ tokens: { access_token: 'legacy-access' } },
		]) {
			await fs.writeFile(join(codexHome, 'auth.json'), JSON.stringify(auth));
			assert.strictEqual(detectExistingCodexChatGPTSetup('/unused', env), true);
		}
	}));

	test('rejects non-human and malformed auth states', async () => withCodexHome(async (codexHome, env) => {
		for (const auth of [
			{ auth_mode: 'apiKey', OPENAI_API_KEY: 'sk-test' },
			{ auth_mode: 'bedrockApiKey', bedrock_api_key: { secret: 'secret' } },
			{ auth_mode: 'agentIdentity', agent_identity: { token: 'token' } },
			{ auth_mode: 'chatgpt', tokens: { access_token: '', refresh_token: '' } },
			{ tokens: null },
		]) {
			await fs.writeFile(join(codexHome, 'auth.json'), JSON.stringify(auth));
			assert.strictEqual(detectExistingCodexChatGPTSetup('/unused', env), false);
		}
		await fs.writeFile(join(codexHome, 'auth.json'), '{');
		assert.strictEqual(detectExistingCodexChatGPTSetup('/unused', env), false);
	}));

	test('honors an explicit Codex home override', async () => withCodexHome(async (codexHome, env) => {
		await fs.writeFile(join(codexHome, 'auth.json'), JSON.stringify({
			auth_mode: 'personalAccessToken',
			personal_access_token: 'pat',
		}));
		assert.strictEqual(detectExistingCodexChatGPTSetup('/unused', {}, codexHome), true);
	}));
});
