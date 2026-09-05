/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MdDocumentRenderer } from '../preview/documentRenderer';
import { DynamicMarkdownPreview } from '../preview/preview';
import { MarkdownPreviewConfigurationManager } from '../preview/previewConfig';
import { ContentSecurityPolicyArbiter, MarkdownPreviewSecurityLevel } from '../preview/security';
import { TopmostLineMonitor } from '../preview/topmostLineMonitor';
import { MdLinkOpener } from '../util/openDocumentLink';
import { createNewMarkdownEngine, emptyContributions } from './engine';
import { nulLogger } from './nulLogging';

const strictCsp = new class implements ContentSecurityPolicyArbiter {
	getSecurityLevelForResource() { return MarkdownPreviewSecurityLevel.Strict; }
	setSecurityLevelForResource() { return Promise.resolve(); }
	shouldAllowSvgsForResource() { }
	shouldDisableSecurityWarnings() { return false; }
	setShouldDisableSecurityWarning() { return Promise.resolve(); }
};

async function waitFor(condition: () => boolean, timeout: number): Promise<boolean> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeout) {
			return false;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	return true;
}

suite('Markdown preview webview html', () => {
	let dir: string;

	setup(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-md-preview-'));
	});

	teardown(async () => {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		// On Windows the directory stays locked until the file watchers of the closed editors are released
		await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
	});

	test('is brought up to date when the panel is hidden after an in-place update', async () => {
		const file = vscode.Uri.file(path.join(dir, 'doc.md'));
		fs.writeFileSync(file.fsPath, '# marker-one\n');
		const other = vscode.Uri.file(path.join(dir, 'other.txt'));
		fs.writeFileSync(other.fsPath, 'covers the preview\n');

		const extensionUri = vscode.extensions.getExtension('vscode.markdown-language-features')!.extensionUri;
		const renderer = new MdDocumentRenderer(createNewMarkdownEngine(), { extensionUri }, strictCsp, emptyContributions, nulLogger);
		const panel = vscode.window.createWebviewPanel(DynamicMarkdownPreview.viewType, 'preview', vscode.ViewColumn.One, { enableFindWidget: true });
		const preview = DynamicMarkdownPreview.revive(
			{ resource: file, resourceColumn: vscode.ViewColumn.One, locked: false },
			panel,
			renderer,
			new MarkdownPreviewConfigurationManager(),
			nulLogger,
			new TopmostLineMonitor(),
			emptyContributions,
			new MdLinkOpener(undefined!), // the test never follows a link
		);
		try {
			assert.ok(await waitFor(() => panel.webview.html.includes('marker-one'), 10_000), 'initial render');

			// A change made while the panel is visible is posted to the webview as a message
			const document = await vscode.workspace.openTextDocument(file);
			const edit = new vscode.WorkspaceEdit();
			edit.replace(file, new vscode.Range(0, 0, document.lineCount, 0), '# marker-two\n');
			assert.ok(await vscode.workspace.applyEdit(edit));
			await new Promise(resolve => setTimeout(resolve, 1000));
			assert.ok(!panel.webview.html.includes('marker-two'), 'precondition: the update was applied in place, not by reloading the page');

			// Hiding the panel discards its webview; the html it is rebuilt from must show the change
			await vscode.window.showTextDocument(other, { viewColumn: vscode.ViewColumn.One, preview: false });
			assert.ok(await waitFor(() => !panel.visible, 5_000), 'panel hidden');
			assert.ok(await waitFor(() => panel.webview.html.includes('marker-two'), 5_000), 'webview.html still shows the content from before the update');
		} finally {
			preview.dispose();
		}
	});
});
