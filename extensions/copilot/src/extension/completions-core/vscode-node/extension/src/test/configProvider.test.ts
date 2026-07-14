/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { workspace, WorkspaceConfiguration } from 'vscode';
import { ConfigKey } from '../../../lib/src/config';
import { CopilotConfigPrefix } from '../../../lib/src/constants';
import { VSCodeConfigProvider } from '../config';

suite('VSCodeConfigProvider custom completion config', function () {
	let sandbox: sinon.SinonSandbox;

	setup(function () {
		sandbox = sinon.createSandbox();
	});

	teardown(function () {
		sandbox.restore();
	});

	test('reads custom completion model settings from VS Code configuration', async function () {
		const customModels = [{
			id: 'local-gemma',
			url: 'http://127.0.0.1:8080',
		}];
		const config = {
			[ConfigKey.CustomCompletionModels]: [],
			[ConfigKey.UserSelectedCompletionModel]: '',
			get: (key: string) => {
				if (key === ConfigKey.CustomCompletionModels) {
					return customModels;
				}
				if (key === ConfigKey.UserSelectedCompletionModel) {
					return 'local-gemma';
				}
				return undefined;
			},
		} as WorkspaceConfiguration;
		sandbox.stub(workspace, 'getConfiguration')
			.withArgs(CopilotConfigPrefix)
			.returns(config);

		const provider = new VSCodeConfigProvider();
		try {
			assert.deepStrictEqual(provider.getConfig(ConfigKey.CustomCompletionModels), customModels);
			assert.strictEqual(provider.getConfig(ConfigKey.UserSelectedCompletionModel), 'local-gemma');
		} finally {
			provider.dispose();
		}
	});
});
