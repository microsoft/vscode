/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { assertNoRpc, Mutable } from '../utils';

suite('vscode API - configuration', () => {

	teardown(assertNoRpc);

	test('configurations, language defaults', function () {
		const defaultLanguageSettings = vscode.workspace.getConfiguration().get('[abcLang]');

		assert.deepStrictEqual(defaultLanguageSettings, {
			'editor.lineNumbers': 'off',
			'editor.tabSize': 2
		});
	});

	test('configuration, defaults', () => {
		const config = vscode.workspace.getConfiguration('farboo');

		assert.ok(config.has('config0'));
		assert.strictEqual(config.get('config0'), true);
		assert.strictEqual(config.get('config4'), '');
		assert.strictEqual(config['config0'], true);
		assert.strictEqual(config['config4'], '');

		assert.throws(() => (config as Mutable<typeof config>)['config4'] = 'valuevalue');

		assert.ok(config.has('nested.config1'));
		assert.strictEqual(config.get('nested.config1'), 42);
		assert.ok(config.has('nested.config2'));
		assert.strictEqual(config.get('nested.config2'), 'Das Pferd frisst kein Reis.');
	});

	test('configuration, name vs property', () => {
		const config = vscode.workspace.getConfiguration('farboo');

		assert.ok(config.has('get'));
		assert.strictEqual(config.get('get'), 'get-prop');
		assert.deepStrictEqual(config['get'], config.get);
		assert.throws(() => (config as Mutable<typeof config>)['get'] = 'get-prop' as unknown as typeof config.get);
	});

	// Regression test for https://github.com/microsoft/vscode/pull/316249.
	// Integration tests launch with `--disable-extensions`, so built-in
	// extensions like Copilot are disabled at startup. The command must
	// re-enable them and wait for their contributions to register so that
	// their settings show up in the dump.
	test('_developer.getConfigurationInformation includes settings from disabled built-in extensions', async function () {
		// Copilot is a desktop-only extension, so this test is not applicable on web.
		if (vscode.env.uiKind === vscode.UIKind.Web) {
			this.skip();
		}

		const copilotId = 'GitHub.copilot-chat';

		// Disabled extensions are not exposed via `vscode.extensions.getExtension`,
		// so this confirms Copilot starts out disabled in this test run.
		assert.strictEqual(
			vscode.extensions.getExtension(copilotId),
			undefined,
			`Expected '${copilotId}' to be disabled before the command runs.`
		);

		const content = await vscode.commands.executeCommand<string>('_developer.getConfigurationInformation');

		// The command must have enabled Copilot in order to read its configuration contributions.
		assert.ok(
			vscode.extensions.getExtension(copilotId),
			`Expected '${copilotId}' to be enabled after the command runs.`
		);

		assert.strictEqual(typeof content, 'string', 'command should return a JSON string when no path is provided');
		const information = JSON.parse(content) as { [key: string]: unknown };
		assert.ok(
			Object.prototype.hasOwnProperty.call(information, 'github.copilot.chat.codeGeneration.useInstructionFiles'),
			`Expected 'github.copilot.chat.codeGeneration.useInstructionFiles' to be present in the configuration dump. Got ${Object.keys(information).length} keys.`
		);
	});
});
