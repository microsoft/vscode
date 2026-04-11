/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';

suite('Inline Chat', function () {
	// this.timeout(1000 * 60 * 1); // 1 minute

	let store: DisposableStore;

	teardown(function () {
		store.dispose();
	});

	setup(function () {
		store = new DisposableStore();
	});

	test.skip('E2E Inline Chat Test', async function () {
		store.add(vscode.lm.registerLanguageModelChatProvider('test', new class implements vscode.LanguageModelChatProvider {
			async provideLanguageModelChatInformation(options: { silent: boolean }, token: vscode.CancellationToken): Promise<vscode.LanguageModelChatInformation[]> {
				return [{
					id: 'test',
					name: 'test',
					family: 'test',
					version: '0.0.0',
					maxInputTokens: 1000,
					maxOutputTokens: 1000,
					requiresAuthorization: true,
					capabilities: {}
				}];
			}
			async provideLanguageModelChatResponse(model: vscode.LanguageModelChatInformation, messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>, options: vscode.ProvideLanguageModelChatResponseOptions, progress: vscode.Progress<vscode.LanguageModelResponsePart2>, token: vscode.CancellationToken): Promise<void> {
				throw new Error('Method not implemented.');
			}
			async provideTokenCount(model: vscode.LanguageModelChatInformation, text: string | vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2, token: vscode.CancellationToken): Promise<number> {
				return 0;
			}
		}));



		// Create and open a new file
		const document = await vscode.workspace.openTextDocument({ language: 'javascript' });
		await vscode.window.showTextDocument(document);

		try {

			await vscode.commands.executeCommand('vscode.editorChat.start', {
				blockOnResponse: true,
				autoSend: true,
				message: 'Write me a for loop in javascript',
				position: new vscode.Position(0, 0),
				initialSelection: new vscode.Selection(0, 0, 0, 0),
				modelSelector: { id: 'test' }
			});
		} catch (err) {
			assert.ok(false);
		}

	});
});
