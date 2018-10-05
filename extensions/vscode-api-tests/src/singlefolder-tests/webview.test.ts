/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { join } from 'path';
import { closeAllEditors } from '../utils';

const webviewId = 'myWebview';

const testDocument = join(vscode.workspace.rootPath || '', './bower.json');

suite('Webview tests', () => {
	const disposables: vscode.Disposable[] = [];

	function _register<T extends vscode.Disposable>(disposable: T)  {
		disposables.push(disposable);
		return disposable;
	}

	teardown(() => {
		closeAllEditors();

		while (disposables.length) {
			let item = disposables.pop();
			if (item) {
				item.dispose();
			}
		}
	});

	test('webview communication', async () => {
		const webview = _register(createWebviewWithBody(/*html*/`
			<script>
				const vscode = acquireVsCodeApi();
				window.addEventListener('message', (message) => {
					vscode.postMessage({ value: message.data.value + 1 });
				});
			</script>`));

		const response = await sendRecieveMessage(webview, { value: 1 });
		assert.strictEqual(response.value, 2);
	});

	test('webview preserves state when switching visibility', async () => {
		const webview = _register(createWebviewWithBody(/*html*/ `
			<script>
				const vscode = acquireVsCodeApi();
				let value = (vscode.getState() || {}).value || 0;
				window.addEventListener('message', (message) => {
					switch (message.data.type) {
						case 'get':
							vscode.postMessage({ value });
							break;

						case 'add':
							++value;;
							vscode.setState({ value });
							vscode.postMessage({ value });
							break;
					}
				});
			</script>`));

		const firstResponse = await sendRecieveMessage(webview, { type: 'add' });
		assert.strictEqual(firstResponse.value, 1);

		// Swap away from the webview
		const doc = await vscode.workspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		webview.reveal(vscode.ViewColumn.One);

		// We should still have old state
		const secondResponse = await sendRecieveMessage(webview, { type: 'get' });
		assert.strictEqual(secondResponse.value, 1);
	});

	test('webview should keep dom state state when retainContextWhenHidden is set', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true, retainContextWhenHidden: true }));
		webview.webview.html = createHtmlDocumentWithBody(/*html*/ `
			<script>
				const vscode = acquireVsCodeApi();
				let value = 0;
				window.addEventListener('message', (message) => {
					switch (message.data.type) {
						case 'get':
							vscode.postMessage({ value });
							break;

						case 'add':
							++value;;
							vscode.setState({ value });
							vscode.postMessage({ value });
							break;
					}
				});
			</script>`);

		const firstResponse = await sendRecieveMessage(webview, { type: 'add' });
		assert.strictEqual(firstResponse.value, 1);

		// Swap away from the webview
		const doc = await vscode.workspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		webview.reveal(vscode.ViewColumn.One);

		// We should still have old state
		const secondResponse = await sendRecieveMessage(webview, { type: 'get' });
		assert.strictEqual(secondResponse.value, 1);
	});

	test('webview should preserve position when switching visibility with retainContextWhenHidden', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true, retainContextWhenHidden: true }));
		webview.webview.html = createHtmlDocumentWithBody(/*html*/`
			${'<h1>Header</h1>'.repeat(200)}
			<script>
				const vscode = acquireVsCodeApi();

				setTimeout(() => {
					window.scroll(0, 100);
					vscode.postMessage({ value: window.scrollY });
				}, 500);

				window.addEventListener('message', (message) => {
					switch (message.data.type) {
						case 'get':
							vscode.postMessage({ value: window.scrollY });
							break;
					}
				});
			</script>`);

		const firstResponse = await getWebviewMesssage(webview);
		assert.strictEqual(firstResponse.value, 100);

		// Swap away from the webview
		const doc = await vscode.workspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		webview.reveal(vscode.ViewColumn.One);

		// We should still have old scroll pos
		const secondResponse = await sendRecieveMessage(webview, { type: 'get' });
		assert.strictEqual(secondResponse.value, 100);
	});
});

function createWebviewWithBody(body: string) {
	const webview = vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true });
	webview.webview.html = createHtmlDocumentWithBody(body);
	return webview;
}

function createHtmlDocumentWithBody(body: string): string {
	return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="ie=edge">
	<title>Document</title>
</head>
<body>
	${body}
</body>
</html>`;
}



function getWebviewMesssage<T = any>(webview: vscode.WebviewPanel): Promise<T> {
	return new Promise<any>(resolve => {
		const sub = webview.webview.onDidReceiveMessage(message => {
			sub.dispose();
			resolve(message);
		});
	});
}

function sendRecieveMessage<T = any>(webview: vscode.WebviewPanel, message: any): Promise<T> {
	const p = getWebviewMesssage(webview);
	webview.webview.postMessage(message);
	return p;
}
