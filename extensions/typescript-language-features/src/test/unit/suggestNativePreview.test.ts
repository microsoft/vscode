/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ExperimentationService } from '../../experimentationService';
import type { PluginManager } from '../../tsServer/plugins';
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

	test('does not show if the active editor changes while checking the treatment variable', async () => {
		const showInformationMessage = sinon.stub(vscode.window, 'showInformationMessage');
		const typescriptDocument = await vscode.workspace.openTextDocument({ language: 'typescript', content: '' });
		const jsonDocument = await vscode.workspace.openTextDocument({ language: 'json', content: '{}' });
		let activeEditor = { document: typescriptDocument } as vscode.TextEditor;
		sinon.stub(vscode.window, 'activeTextEditor').get(() => activeEditor);
		sinon.stub(vscode.window, 'state').get(() => ({ active: true } as vscode.WindowState));

		let resolveTreatment!: (value: boolean) => void;
		const treatment = new Promise<boolean>(resolve => resolveTreatment = resolve);
		const experimentationService = Object.create(ExperimentationService.prototype) as ExperimentationService;
		sinon.stub(experimentationService, 'getTreatmentVariable').returns(treatment);

		const context = {
			globalState: {
				get: () => false,
			},
		} as unknown as vscode.ExtensionContext;
		const pluginManager = { plugins: [] } as unknown as PluginManager;

		const suggestion = suggestNativePreview(context, experimentationService, pluginManager);
		activeEditor = { document: jsonDocument } as vscode.TextEditor;
		resolveTreatment(true);
		await suggestion;

		assert.strictEqual(showInformationMessage.callCount, 0);
	});
});
