/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestMemento } from './testMemento';
import { TestSecretStorage } from './testSecretStorage';

export function createTestExtensionContext(subscriptions: vscode.Disposable[], secrets: TestSecretStorage, state = new TestMemento()): vscode.ExtensionContext {
	const extension = vscode.extensions.getExtension('vscode.github-authentication');
	assert.ok(extension);
	const storageUri = vscode.Uri.parse('test-storage:/github-authentication');
	return {
		subscriptions,
		workspaceState: state,
		globalState: Object.assign(state, { setKeysForSync: () => { } }),
		secrets,
		extension,
		extensionUri: extension.extensionUri,
		extensionPath: extension.extensionPath,
		extensionMode: vscode.ExtensionMode.Test,
		storageUri: undefined,
		storagePath: undefined,
		globalStorageUri: storageUri,
		globalStoragePath: storageUri.fsPath,
		logUri: storageUri,
		logPath: storageUri.fsPath,
		asAbsolutePath: relativePath => vscode.Uri.joinPath(extension.extensionUri, relativePath).fsPath,
		get environmentVariableCollection(): vscode.GlobalEnvironmentVariableCollection { throw new Error('Unexpected environment access'); },
		get languageModelAccessInformation(): vscode.LanguageModelAccessInformation { throw new Error('Unexpected language model access'); }
	};
}
