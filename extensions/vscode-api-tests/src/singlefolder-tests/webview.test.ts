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

suite('Webview tests', () => {
	teardown(closeAllEditors);

	test('webview communication', async () => {
		const webview = vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true });
		webview.webview.html = createHtmlDocumentWithBody(/*html*/`
			<script>
				const vscode = acquireVsCodeApi();
				window.addEventListener('message', (message) => {
					vscode.postMessage({ value: message.data.value + 1 });
				});
			</script>`);

		const p = new Promise<any>(resolve => {
			webview.webview.onDidReceiveMessage(message => {
				resolve(message);
			});
		});

		webview.webview.postMessage({ value: 1 });
		const response = await p;
		assert.strictEqual(response.value, 2);
	});

	test('webview preserves state when switching visibility', async () => {
		const webview = vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true });
		webview.webview.html = createHtmlDocumentWithBody(/*html*/`
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
							vscode.setState({ value })
							vscode.postMessage({ value });
							break;
					}
				});
			</script>`);

		{
			const p = messageAwaiter(webview, 1);
			webview.webview.postMessage({ type: 'add' });
			const [response] = await p;
			assert.strictEqual(response.value, 1);
		}

		// Swap away from the webview
		const doc = await vscode.workspace.openTextDocument(join(vscode.workspace.rootPath || '', './simple.txt'));
		await vscode.window.showTextDocument(doc);

		// And then back
		webview.reveal(vscode.ViewColumn.One);

		{
			const p = messageAwaiter(webview, 1);
			webview.webview.postMessage({ type: 'get' });
			const [response] = await p;
			assert.strictEqual(response.value, 1);
		}
	});
});

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


function messageAwaiter(webview: vscode.WebviewPanel, expected: number): Promise<any[]> {
	let received: any[] = [];
	return new Promise<any>(resolve => {
		webview.webview.onDidReceiveMessage(message => {
			received.push(message);
			if (received.length >= expected) {
				resolve(received);
			}
		});
	});
}