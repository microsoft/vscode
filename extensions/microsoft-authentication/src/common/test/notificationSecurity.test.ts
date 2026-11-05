/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Environment } from '@azure/ms-rest-azure-env';
import { ExtensionContext, window, workspace } from 'vscode';
import { initMicrosoftSovereignCloudAuthProvider } from '../../extension';
import { UriEventHandler } from '../../UriEventHandler';
import { getSafeNotificationMessage } from '../notification';

suite('Notification security', () => {
	teardown(() => sinon.restore());

	test('selects the exact fallback for link syntax or command schemes and preserves other text', () => {
		const fallback = 'Unable to complete the operation.';
		const ordinary = ['', ' ordinary [file].ts ', 'https://example.com', 'command.ts', 'a] (b'];
		const suspicious = [
			'[Open](command:test.noop)',
			'[Help](https://example.com)',
			'\\[Open\\](CoMmAnD:test.noop)',
			'broken](',
			'command:',
			'prefix COMMAND:test.noop suffix',
		];
		assert.deepStrictEqual(
			[...ordinary, ...suspicious].map(message => getSafeNotificationMessage(message, fallback)),
			[...ordinary, ...suspicious.map(() => fallback)],
		);
	});

	test('invalid sovereign environments and validation errors cannot create notification links', async () => {
		const context = {} as ExtensionContext;
		const uriHandler = new UriEventHandler();
		const messages = sinon.stub(window, 'showErrorMessage').resolves(undefined);
		const configuration = { ...workspace.getConfiguration('microsoft-sovereign-cloud') };
		const settings: Record<string, string | { name: string }> = {};
		sinon.stub(configuration, 'get').callsFake(key => settings[key]);
		sinon.stub(workspace, 'getConfiguration').returns(configuration);
		const invalidName = 'missing-[Open](CoMmAnD:test.noop)';
		try {
			settings.environment = 'missing-environment';
			await initMicrosoftSovereignCloudAuthProvider(context, uriHandler);
			settings.environment = invalidName;
			await initMicrosoftSovereignCloudAuthProvider(context, uriHandler);
			settings.environment = 'custom';
			settings.customEnvironment = { name: 'custom-test' };
			sinon.stub(Environment, 'add').throws(new Error('Invalid \\[Open\\](command:test.noop)'));
			await initMicrosoftSovereignCloudAuthProvider(context, uriHandler);

			assert.deepStrictEqual(messages.getCalls().map(call => call.args), [
				['The environment `missing-environment` is not a valid environment.', 'Open settings'],
				['The configured environment is not a valid environment.', 'Open settings'],
				['Error validating custom environment setting. Check the Microsoft Authentication output for details.', 'Open settings'],
			]);
		} finally {
			uriHandler.dispose();
		}
	});
});
