/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';

// The module under test
import * as extension from '../extension';

suite('Hello World Extension Tests', () => {

	test('Extension should activate without errors', async () => {
		const context: vscode.ExtensionContext = {
			subscriptions: [],
			workspaceState: {} as any,
			globalState: {} as any,
			extensionUri: vscode.Uri.file(''),
			extensionPath: '',
			asAbsolutePath: () => '',
			storageUri: undefined,
			storagePath: undefined,
			globalStorageUri: vscode.Uri.file(''),
			globalStoragePath: '',
			logUri: vscode.Uri.file(''),
			logPath: '',
			extensionMode: vscode.ExtensionMode.Test,
			secrets: {} as any,
			environmentVariableCollection: {} as any,
			extension: {} as any,
			languageModelAccessInformation: {} as any
		};

		// This should not throw
		assert.doesNotThrow(() => {
			extension.activate(context);
		});

		// Verify that a subscription was added
		assert.strictEqual(context.subscriptions.length, 1);
	});

	test('Extension should deactivate without errors', () => {
		// This should not throw
		assert.doesNotThrow(() => {
			extension.deactivate();
		});
	});

	test('Command should be registered after activation', async () => {
		const context: vscode.ExtensionContext = {
			subscriptions: [],
			workspaceState: {} as any,
			globalState: {} as any,
			extensionUri: vscode.Uri.file(''),
			extensionPath: '',
			asAbsolutePath: () => '',
			storageUri: undefined,
			storagePath: undefined,
			globalStorageUri: vscode.Uri.file(''),
			globalStoragePath: '',
			logUri: vscode.Uri.file(''),
			logPath: '',
			extensionMode: vscode.ExtensionMode.Test,
			secrets: {} as any,
			environmentVariableCollection: {} as any,
			extension: {} as any,
			languageModelAccessInformation: {} as any
		};

		// Activate the extension
		extension.activate(context);

		// Get all available commands
		const commands = await vscode.commands.getCommands(true);

		// Verify that our command is registered
		assert.ok(commands.includes('helloWorld.hello'), 'Hello World command should be registered');
	});

	test('Command should be callable without throwing errors', async () => {
		const context: vscode.ExtensionContext = {
			subscriptions: [],
			workspaceState: {} as any,
			globalState: {} as any,
			extensionUri: vscode.Uri.file(''),
			extensionPath: '',
			asAbsolutePath: () => '',
			storageUri: undefined,
			storagePath: undefined,
			globalStorageUri: vscode.Uri.file(''),
			globalStoragePath: '',
			logUri: vscode.Uri.file(''),
			logPath: '',
			extensionMode: vscode.ExtensionMode.Test,
			secrets: {} as any,
			environmentVariableCollection: {} as any,
			extension: {} as any,
			languageModelAccessInformation: {} as any
		};

		// Activate the extension
		extension.activate(context);

		// Execute the command - this should not throw
		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand('helloWorld.hello');
		});
	});
});