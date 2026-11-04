/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ElectronServiceConfigurationProvider } from '../../configuration/configuration.electron';
import { register } from '../../languageFeatures/tsconfig';
import { getSafeNotificationMessage } from '../../utils/notification';

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

	test('invalid Node paths retain ordinary details but not command links', () => {
		const provider = new ElectronServiceConfigurationProvider();
		const validatePath = Reflect.get(provider, 'validatePath') as (nodePath: string | null) => string | null;
		const warning = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined);
		const paths = [
			path.resolve('missing-node-for-notification-test'),
			path.resolve('missing-[Open](command:test.noop)'),
			path.resolve('missing-[Open](CoMmAnD:test.noop?%5B%22arg%22%5D)'),
			path.resolve('missing-COMMAND:test.noop'),
		];
		const results = paths.map(value => validatePath.call(provider, value));
		assert.deepStrictEqual({
			results,
			messages: warning.getCalls().map(call => call.args[0]),
		}, {
			results: paths.map(() => null),
			messages: [
				`The path ${paths[0]} doesn't point to a valid Node installation to run TS Server. Falling back to bundled Node.`,
				...paths.slice(1).map(() => 'The configured path doesn\'t point to a valid Node installation to run TS Server. Falling back to bundled Node.'),
			],
		});
	});

	test('unresolved configuration links do not turn the referenced name into another command', async () => {
		const commandRegistration = sinon.stub(vscode.commands, 'registerCommand').returns(new vscode.Disposable(() => { }));
		const registration = register();
		const error = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
		const values = ['missing-configuration-for-notification-test', 'missing-[Open](command:test.noop)', 'missing-\\[Open\\](CoMmAnD:test.noop)'];
		try {
			for (const extendsValue of values) {
				await commandRegistration.firstCall.args[1]({
					resourceUri: vscode.Uri.file(path.resolve('tsconfig.json')).toJSON(),
					extendsValue,
					linkType: 0,
				});
			}
			assert.deepStrictEqual(error.getCalls().map(call => call.args[0]), [
				`Failed to resolve ${values[0]} as module`,
				...values.slice(1).map(() => 'Failed to resolve the referenced configuration as a module.'),
			]);
		} finally {
			registration.dispose();
		}
	});
});
