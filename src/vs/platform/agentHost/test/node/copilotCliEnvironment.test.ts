/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotClientInfoEnvVar, createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';

suite('createCopilotCliEnvironment - client info', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('declares the host identity the CLI attributes its telemetry to', () => {
		const env = createCopilotCliEnvironment({}, {
			editorName: 'vscode',
			editorVersion: '1.124.2',
			extensionName: 'vscode-agent-host',
			extensionVersion: '1.124.2',
		});

		assert.deepStrictEqual(JSON.parse(env[CopilotClientInfoEnvVar]!), {
			editorName: 'vscode',
			editorVersion: '1.124.2',
			extensionName: 'vscode-agent-host',
			extensionVersion: '1.124.2',
		});
	});

	test('clears an inherited value rather than letting it describe us', () => {
		// Whatever launched VS Code may have set this for its own CLI child, and
		// that identity is not ours to forward.
		const env = createCopilotCliEnvironment({ [CopilotClientInfoEnvVar]: '{"extensionName":"someone-else"}' });

		assert.strictEqual(env[CopilotClientInfoEnvVar], undefined);
	});

	test('overwrites an inherited value when we declare our own', () => {
		const env = createCopilotCliEnvironment({ [CopilotClientInfoEnvVar]: '{"extensionName":"someone-else"}' }, {
			editorName: 'vscode',
			editorVersion: '1.124.2',
			extensionName: 'vscode-agent-host',
			extensionVersion: '1.124.2',
		});

		assert.strictEqual(JSON.parse(env[CopilotClientInfoEnvVar]!).extensionName, 'vscode-agent-host');
	});
});
