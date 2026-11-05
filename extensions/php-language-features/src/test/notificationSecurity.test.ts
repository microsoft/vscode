/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import PHPValidationProvider from '../features/validationProvider';
import { getSafeNotificationMessage } from '../features/utils/notification';

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

	test('validation errors retain Open Settings and do not interpret executable paths or tool errors as links', async () => {
		const showErrorMessage = Reflect.get(PHPValidationProvider.prototype, 'showErrorMessage') as (message: string) => Promise<void>;
		const messages = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
		const inputs = ['Cannot find /workspace/php', 'Cannot find /workspace/[Open](command:test.noop)', 'Error: \\[Open\\](CoMmAnD:test.noop?%5B1%5D)', 'Error: COMMAND:test.noop'];
		for (const message of inputs) {
			await showErrorMessage(message);
		}
		assert.deepStrictEqual(messages.getCalls().map(call => call.args), [
			[inputs[0], 'Open Settings'],
			...inputs.slice(1).map(() => ['PHP validation could not be started. Use the setting \'php.validate.executablePath\' to configure the PHP executable.', 'Open Settings']),
		]);
	});
});
