/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as sinon from 'sinon';
import { ExtensionContext, Memento, Uri, window } from 'vscode';
import * as preferredPackageManager from '../preferred-pm';
import { detectPackageManager } from '../tasks';
import { getSafeNotificationMessage } from '../notification';

class TestGlobalState implements Memento {
	keys(): readonly string[] { return []; }
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(_key: string, defaultValue?: T): T | undefined { return defaultValue; }
	async update(): Promise<void> { }
	setKeysForSync(): void { }
}

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

	test('multiple-lockfile warnings keep buttons and package-manager selection without interpreting folder names', async () => {
		const folders = [Uri.file('/workspace/ordinary [name]'), Uri.from({ scheme: 'file', path: '/workspace/[Open](CoMmAnD:test.noop)' })];
		const preferred = sinon.stub(preferredPackageManager, 'findPreferredPM').resolves({ name: 'npm', multipleLockFilesDetected: true });
		const messages = sinon.stub(window, 'showInformationMessage').resolves(undefined);
		const globalState: ExtensionContext['globalState'] = new TestGlobalState();
		const context = { globalState } as ExtensionContext;
		const managers = [];
		for (const folder of folders) {
			managers.push(await detectPackageManager(folder, context, true));
		}
		assert.deepStrictEqual({
			managers,
			detectedPaths: preferred.getCalls().map(call => call.args[0]),
			messages: messages.getCalls().map(call => call.args),
		}, {
			managers: ['npm', 'npm'],
			detectedPaths: folders.map(folder => folder.fsPath),
			messages: [
				[`Using npm as the preferred package manager. Found multiple lockfiles for ${folders[0].fsPath}.  To resolve this issue, delete the lockfiles that don't match your preferred package manager or change the setting "npm.packageManager" to a value other than "auto".`, 'Learn more', 'Do not show again'],
				['Found multiple package manager lockfiles. To resolve this issue, delete the lockfiles that don\'t match your preferred package manager or change the setting "npm.packageManager" to a value other than "auto".', 'Learn more', 'Do not show again'],
			],
		});
	});
});
