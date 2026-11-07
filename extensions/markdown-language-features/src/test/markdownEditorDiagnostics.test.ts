/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';

suite('Markdown editor pull diagnostics', () => {
	test('validates and clears diagnostics with only a custom-editor tab open', async function () {
		this.timeout(30000);
		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, 'The integration test requires a workspace folder');
		const uri = vscode.Uri.joinPath(folder.uri, `markdown-rich-diagnostics-${Date.now()}.md`);
		const config = vscode.workspace.getConfiguration('markdown', uri);
		const previousEnabled = config.inspect<boolean>('validate.enabled')?.workspaceValue;
		const previousFragments = config.inspect<string>('validate.fragmentLinks.enabled')?.workspaceValue;
		await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode('# Heading\n\n[broken](#missing)\n'));
		try {
			await config.update('validate.enabled', true, vscode.ConfigurationTarget.Workspace);
			await config.update('validate.fragmentLinks.enabled', 'warning', vscode.ConfigurationTarget.Workspace);
			await vscode.commands.executeCommand('vscode.openWith', uri, 'vscode.markdown.editor');

			const document = await vscode.workspace.openTextDocument(uri);
			const assertCustomOnly = () => {
				const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
				assert.ok(tabs.some(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === uri.toString()));
				assert.ok(!tabs.some(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()));
				assert.ok(!vscode.window.visibleTextEditors.some(editor => editor.document.uri.toString() === uri.toString()));
			};
			assertCustomOnly();
			await waitForDiagnostics(uri, items => items.some(item => item.range.start.line === 2 && item.severity === vscode.DiagnosticSeverity.Warning));

			const edit = new vscode.WorkspaceEdit();
			edit.replace(uri, new vscode.Range(2, 0, 2, document.lineAt(2).text.length), '[fixed](#heading)');
			assert.ok(await vscode.workspace.applyEdit(edit));
			await waitForDiagnostics(uri, items => items.length === 0);
			assertCustomOnly();
		} finally {
			const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
			if (document?.isDirty) {
				await document.save();
			}
			const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs)
				.filter(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === uri.toString());
			await vscode.window.tabGroups.close(tabs);
			await vscode.workspace.fs.delete(uri);
			await config.update('validate.enabled', previousEnabled, vscode.ConfigurationTarget.Workspace);
			await config.update('validate.fragmentLinks.enabled', previousFragments, vscode.ConfigurationTarget.Workspace);
		}
	});
});

async function waitForDiagnostics(uri: vscode.Uri, matches: (items: readonly vscode.Diagnostic[]) => boolean): Promise<void> {
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		if (matches(vscode.languages.getDiagnostics(uri))) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	assert.fail(`Timed out waiting for diagnostics: ${JSON.stringify(vscode.languages.getDiagnostics(uri))}`);
}
