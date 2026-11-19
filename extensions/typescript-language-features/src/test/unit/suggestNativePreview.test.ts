/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { suggestNativePreview } from '../../ui/suggestNativePreview';

suite('Suggest TypeScript 7 preview', () => {
	teardown(() => sinon.restore());

	test('does not show when there is no active editor', async () => {
		const showInformationMessage = sinon.stub(vscode.window, 'showInformationMessage');
		sinon.stub(vscode.window, 'activeTextEditor').get(() => undefined);

		await suggestNativePreview(undefined!, undefined!, undefined!);
		assert.strictEqual(showInformationMessage.callCount, 0);
	});

	test('does not show for a JSON active editor', async () => {
		const showInformationMessage = sinon.stub(vscode.window, 'showInformationMessage');
		const document = await vscode.workspace.openTextDocument({ language: 'json', content: '{}' });
		sinon.stub(vscode.window, 'activeTextEditor').get(() => ({ document } as vscode.TextEditor));

		await suggestNativePreview(undefined!, undefined!, undefined!);
		assert.strictEqual(showInformationMessage.callCount, 0);
	});

	test('does not show for a JavaScript active editor', async () => {
		const showInformationMessage = sinon.stub(vscode.window, 'showInformationMessage');
		const document = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		sinon.stub(vscode.window, 'activeTextEditor').get(() => ({ document } as vscode.TextEditor));

		await suggestNativePreview(undefined!, undefined!, undefined!);
		assert.strictEqual(showInformationMessage.callCount, 0);
	});

});
