/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { resolveCopilotManagedSettings } from '../../node/copilot/copilotManagedSettings.js';
import { createUnmanagedCopilotSettings } from './copilotTestEvents.js';

suite('Copilot managed settings resolution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sessionless resolution includes account and working directory for policy helpers', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const requests: Parameters<typeof rpc.resolve>[0][] = [];
		const resolve = rpc.resolve;
		rpc.resolve = async params => { requests.push(params); return resolve(params); };
		await resolveCopilotManagedSettings(rpc, 'test-token', 1000, '/test/workspace');
		assert.deepStrictEqual(requests, [{ clientName: 'vscode-agent-host', gitHubToken: 'test-token', workingDirectory: '/test/workspace' }]);
	});

	test('omits absent account and working directory instead of supplying empty overrides', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const requests: Parameters<typeof rpc.resolve>[0][] = [];
		const resolve = rpc.resolve;
		rpc.resolve = async params => { requests.push(params); return resolve(params); };
		await resolveCopilotManagedSettings(rpc, undefined, 1000);
		assert.deepStrictEqual(requests, [{ clientName: 'vscode-agent-host' }]);
	});

	test('preserves composed model options without treating them as catalog-validated selections', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = {
			...await rpc.resolve({ clientName: 'vscode-agent-host' }),
			values: { model: 'unavailable-model', effortLevel: 'unsupported-effort', contextTier: 'long_context' as const },
		};
		rpc.resolve = async () => result;
		assert.strictEqual(await resolveCopilotManagedSettings(rpc, undefined, 1000), result);
	});

	test('propagates resolution failure rather than returning an unmanaged policy', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const error = new Error('Policy resolution failed');
		rpc.resolve = async () => { throw error; };
		await assert.rejects(resolveCopilotManagedSettings(rpc, undefined, 1000), error);
	});
});
