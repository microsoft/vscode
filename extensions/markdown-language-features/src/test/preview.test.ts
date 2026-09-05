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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, timeout: number): Promise<boolean> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeout) {
			return false;
		}
		await sleep(50);
	}
	return true;
}

async function replaceContent(document: vscode.TextDocument, content: string): Promise<void> {
	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content);
	assert.ok(await vscode.workspace.applyEdit(edit));
}

/** Holds the next in-place render of `renderer` until `release` is called. Later renders pass through. */
function holdNextRenderBody(renderer: MdDocumentRenderer): { readonly started: boolean; release: () => void } {
	const original = renderer.renderBody;
	let release!: () => void;
	const held = new Promise<void>(resolve => { release = resolve; });
	const hold = { started: false, release };
	renderer.renderBody = async (...args: Parameters<MdDocumentRenderer['renderBody']>) => {
		renderer.renderBody = original;
		hold.started = true;
		await held;
		return original.apply(renderer, args);
	};
	return hold;
}

suite('Markdown preview webview html', () => {
	let dir: string;
	let file: vscode.Uri;
	let other: vscode.Uri;
	let disposables: vscode.Disposable[];

	setup(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-md-preview-'));
		file = vscode.Uri.file(path.join(dir, 'doc.md'));
		fs.writeFileSync(file.fsPath, '# marker-one\n');
		other = vscode.Uri.file(path.join(dir, 'other.txt'));
		fs.writeFileSync(other.fsPath, 'covers the preview\n');
		disposables = [];
	});

	teardown(async () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
		for (const document of vscode.workspace.textDocuments) {
			if (document.isDirty && document.uri.fsPath.startsWith(dir)) {
				await document.save();
			}
		}
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		// On Windows the directory stays locked until the file watchers of the closed editors are released
		await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
	});

	/** Opens a dynamic preview of `file` in the first column and waits for its first render. */
	async function openPreview(): Promise<{ panel: vscode.WebviewPanel; renderer: MdDocumentRenderer }> {
		const extensionUri = vscode.extensions.getExtension('vscode.markdown-language-features')!.extensionUri;
		const renderer = new MdDocumentRenderer(createNewMarkdownEngine(), { extensionUri }, strictCsp, emptyContributions, nulLogger);
		const topmostLineMonitor = new TopmostLineMonitor();
		const panel = vscode.window.createWebviewPanel(DynamicMarkdownPreview.viewType, 'preview', vscode.ViewColumn.One, { enableFindWidget: true });
		const preview = DynamicMarkdownPreview.revive(
			{ resource: file, resourceColumn: vscode.ViewColumn.One, locked: false },
			panel,
			renderer,
			new MarkdownPreviewConfigurationManager(),
			nulLogger,
			topmostLineMonitor,
			emptyContributions,
			new MdLinkOpener(undefined!), // the tests never follow a link
		);
		disposables.push(preview, topmostLineMonitor);
		assert.ok(await waitFor(() => panel.webview.html.includes('marker-one'), 10_000), 'initial render');
		return { panel, renderer };
	}

	test('is brought up to date when the panel is hidden after an in-place update', async () => {
		const { panel } = await openPreview();

		// A change made while the panel is visible is posted to the webview as a message
		const document = await vscode.workspace.openTextDocument(file);
		await replaceContent(document, '# marker-two\n');
		await sleep(1000);
		assert.ok(!panel.webview.html.includes('marker-two'), 'precondition: the update was applied in place, not by reloading the page');

		// Hiding the panel discards its webview; the html it is rebuilt from must show the change
		await vscode.window.showTextDocument(other, { viewColumn: vscode.ViewColumn.One, preview: false });
		assert.ok(await waitFor(() => !panel.visible, 5_000), 'panel hidden');
		assert.ok(await waitFor(() => panel.webview.html.includes('marker-two'), 5_000), 'webview.html still shows the content from before the update');
	});

	test('is brought up to date when the panel is hidden while an in-place update is rendering', async () => {
		const { panel, renderer } = await openPreview();

		// Hold the in-place render of the change so the panel can be hidden while it is in flight
		const render = holdNextRenderBody(renderer);
		const document = await vscode.workspace.openTextDocument(file);
		await replaceContent(document, '# marker-two\n');
		assert.ok(await waitFor(() => render.started, 5_000), 'precondition: the change is rendered in place');

		// The hide finds the html up to date and schedules nothing
		await vscode.window.showTextDocument(other, { viewColumn: vscode.ViewColumn.One, preview: false });
		assert.ok(await waitFor(() => !panel.visible, 5_000), 'panel hidden');
		await sleep(1000);
		assert.ok(!panel.webview.html.includes('marker-two'), 'precondition: nothing reloaded the page while the render was held');

		// The render finishes into a webview that is already discarded
		render.release();
		assert.ok(await waitFor(() => panel.webview.html.includes('marker-two'), 5_000), 'the update finished after the hide and nothing reloaded the page');
	});

	test('keeps a forced refresh when a regular refresh is already scheduled', async () => {
		const { panel } = await openPreview();

		const document = await vscode.workspace.openTextDocument(file);
		await replaceContent(document, '# marker-two\n');
		await sleep(1000);
		assert.ok(!panel.webview.html.includes('marker-two'), 'precondition: the update was applied in place, not by reloading the page');

		// The second change schedules a regular refresh. Hiding the panel before that refresh runs
		// asks for a forced one, which must survive even though the panel is visible again by the
		// time the scheduled refresh runs.
		await replaceContent(document, '# marker-three\n');
		await vscode.window.showTextDocument(other, { viewColumn: vscode.ViewColumn.One, preview: false });
		assert.ok(await waitFor(() => !panel.visible, 5_000), 'panel hidden');
		panel.reveal(vscode.ViewColumn.One);
		assert.ok(await waitFor(() => panel.visible, 5_000), 'panel revealed');
		assert.ok(await waitFor(() => panel.webview.html.includes('marker-three'), 5_000), 'the scheduled refresh dropped the forced reload');
	});
});
