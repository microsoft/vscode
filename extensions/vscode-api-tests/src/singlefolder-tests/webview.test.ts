/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { join } from 'path';
import { closeAllEditors, disposeAll, conditionalTest } from '../utils';

const webviewId = 'myWebview';

const testDocument = join(vscode.workspace.rootPath || '', './bower.json');

suite('Webview tests', () => {
	const disposables: vscode.Disposable[] = [];

	function _register<T extends vscode.Disposable>(disposable: T) {
		disposables.push(disposable);
		return disposable;
	}

	teardown(async () => {
		await closeAllEditors();

		disposeAll(disposables);
	});

	test('webviews should be able to send and receive messages', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true }));
		const firstResponse = getMesssage(webview);
		webview.webview.html = createHtmlDocumentWithBody(/*html*/`
			<script>
				const vscode = acquireVsCodeApi();
				window.addEventListener('message', (message) => {
					vscode.postMessage({ value: message.data.value + 1 });
				});
			</script>`);

		webview.webview.postMessage({ value: 1 });
		assert.strictEqual((await firstResponse).value, 2);
	});

	test('webviews should not have scripts enabled by default', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, {}));
		const response = Promise.race<any>([
			getMesssage(webview),
			new Promise<{}>(resolve => setTimeout(() => resolve({ value: '🎉' }), 1000))
		]);
		webview.webview.html = createHtmlDocumentWithBody(/*html*/`
			<script>
				const vscode = acquireVsCodeApi();
				vscode.postMessage({ value: '💉' });
			</script>`);

		assert.strictEqual((await response).value, '🎉');
	});

	test('webviews should update html', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true }));

		{
			const response = getMesssage(webview);
			webview.webview.html = createHtmlDocumentWithBody(/*html*/`
				<script>
					const vscode = acquireVsCodeApi();
					vscode.postMessage({ value: 'first' });
				</script>`);

			assert.strictEqual((await response).value, 'first');
		}
		{
			const response = getMesssage(webview);
			webview.webview.html = createHtmlDocumentWithBody(/*html*/`
				<script>
					const vscode = acquireVsCodeApi();
					vscode.postMessage({ value: 'second' });
				</script>`);

			assert.strictEqual((await response).value, 'second');
		}
	});

	conditionalTest('webviews should preserve vscode API state when they are hidden', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true }));
		const ready = getMesssage(webview);
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
						vscode.setState({ value });
						vscode.postMessage({ value });
						break;
					}
				});

				vscode.postMessage({ type: 'ready' });
			</script>`);
		await ready;

		const firstResponse = await sendRecieveMessage(webview, { type: 'add' });
		assert.strictEqual(firstResponse.value, 1);

		// Swap away from the webview
		const doc = await vscode.workspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		const ready2 = getMesssage(webview);
		webview.reveal(vscode.ViewColumn.One);
		await ready2;

		// We should still have old state
		const secondResponse = await sendRecieveMessage(webview, { type: 'get' });
		assert.strictEqual(secondResponse.value, 1);
	});

	conditionalTest('webviews should preserve their context when they are moved between view columns', async () => {
		const doc = await vscode.workspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

		// Open webview in same column
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true }));
		const ready = getMesssage(webview);
		webview.webview.html = statefulWebviewHtml;
		await ready;

		const firstResponse = await sendRecieveMessage(webview, { type: 'add' });
		assert.strictEqual(firstResponse.value, 1);

		// Now move webview to new view column
		webview.reveal(vscode.ViewColumn.Two);

		// We should still have old state
		const secondResponse = await sendRecieveMessage(webview, { type: 'get' });
		assert.strictEqual(secondResponse.value, 1);
	});

	conditionalTest('webviews with retainContextWhenHidden should preserve their context when they are hidden', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true, retainContextWhenHidden: true }));
		const ready = getMesssage(webview);

		webview.webview.html = statefulWebviewHtml;
		await ready;

		const firstResponse = await sendRecieveMessage(webview, { type: 'add' });
		assert.strictEqual((await firstResponse).value, 1);

		// Swap away from the webview
		const doc = await vscode.workspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		webview.reveal(vscode.ViewColumn.One);

		// We should still have old state
		const secondResponse = await sendRecieveMessage(webview, { type: 'get' });
		assert.strictEqual(secondResponse.value, 1);
	});

	conditionalTest('webviews with retainContextWhenHidden should preserve their page position when hidden', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true, retainContextWhenHidden: true }));
		const ready = getMesssage(webview);
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
				vscode.postMessage({ type: 'ready' });

			</script>`);
		await ready;

		const firstResponse = getMesssage(webview);

		assert.strictEqual((await firstResponse).value, 100);

		// Swap away from the webview
		const doc = await vscode.workspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		webview.reveal(vscode.ViewColumn.One);

		// We should still have old scroll pos
		const secondResponse = await sendRecieveMessage(webview, { type: 'get' });
		assert.strictEqual(secondResponse.value, 100);
	});

	conditionalTest('webviews with retainContextWhenHidden should be able to recive messages while hidden', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true, retainContextWhenHidden: true }));
		const ready = getMesssage(webview);

		webview.webview.html = statefulWebviewHtml;
		await ready;

		const firstResponse = await sendRecieveMessage(webview, { type: 'add' });
		assert.strictEqual((await firstResponse).value, 1);

		// Swap away from the webview
		const doc = await vscode.workspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// Try posting a message to our hidden webview
		const secondResponse = await sendRecieveMessage(webview, { type: 'add' });
		assert.strictEqual((await secondResponse).value, 2);

		// Now show webview again
		webview.reveal(vscode.ViewColumn.One);

		// We should still have old state
		const thirdResponse = await sendRecieveMessage(webview, { type: 'get' });
		assert.strictEqual(thirdResponse.value, 2);
	});


	conditionalTest('webviews should only be able to load resources from workspace by default', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, { enableScripts: true }));

		webview.webview.html = createHtmlDocumentWithBody(/*html*/`
			<script>
				const vscode = acquireVsCodeApi();
				window.addEventListener('message', (message) => {
					const img = document.createElement('img');
					img.addEventListener('load', () => { vscode.postMessage({ value: true }); });
					img.addEventListener('error', () => { vscode.postMessage({ value: false }); });
					img.src = message.data.src;
					document.body.appendChild(img);
				});
			</script>`);

		async function toWebviewResource(path: string) {
			const root = await webview.webview.toWebviewResource(vscode.Uri.file(vscode.workspace.rootPath!));
			return root.toString() + path;
		}

		{
			const imagePath = await toWebviewResource('/image.png');
			const response = sendRecieveMessage(webview, { src: imagePath });
			assert.strictEqual((await response).value, true);
		}
		{
			const imagePath = await toWebviewResource('/no-such-image.png');
			const response = sendRecieveMessage(webview, { src: imagePath });
			assert.strictEqual((await response).value, false);
		}
		{
			const imagePath = vscode.Uri.file(join(vscode.workspace.rootPath!, '..', '..', '..', 'resources', 'linux', 'code.png')).with({ scheme: 'vscode-resource' });
			const response = sendRecieveMessage(webview, { src: imagePath.toString() });
			assert.strictEqual((await response).value, false);
		}
	});

	conditionalTest('webviews should allow overriding allowed resource paths using localResourceRoots', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.file(join(vscode.workspace.rootPath!, 'sub'))]
		}));

		webview.webview.html = createHtmlDocumentWithBody(/*html*/`
			<script>
				const vscode = acquireVsCodeApi();
				window.addEventListener('message', (message) => {
					const img = document.createElement('img');
					img.addEventListener('load', () => { vscode.postMessage({ value: true }); });
					img.addEventListener('error', () => { vscode.postMessage({ value: false }); });
					img.src = message.data.src;
					document.body.appendChild(img);
				});
			</script>`);

		const workspaceRootUri = vscode.Uri.file(vscode.workspace.rootPath!).with({ scheme: 'vscode-resource' });

		{
			const response = sendRecieveMessage(webview, { src: workspaceRootUri.toString() + '/sub/image.png' });
			assert.strictEqual((await response).value, true);
		}
		{
			const response = sendRecieveMessage(webview, { src: workspaceRootUri.toString() + '/image.png' });
			assert.strictEqual((await response).value, false);
		}
	});

	test('webviews should have real view column after they are created, #56097', async () => {
		const webview = _register(vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.Active }, { enableScripts: true }));

		// Since we used a symbolic column, we don't know what view column the webview will actually show in at first
		assert.strictEqual(webview.viewColumn, undefined);

		let changed = false;
		const viewStateChanged = new Promise<vscode.WebviewPanelOnDidChangeViewStateEvent>((resolve) => {
			webview.onDidChangeViewState(e => {
				if (changed) {
					throw new Error('Only expected a single view state change');
				}
				changed = true;
				resolve(e);
			}, undefined, disposables);
		});

		assert.strictEqual((await viewStateChanged).webviewPanel.viewColumn, vscode.ViewColumn.One);

		const firstResponse = getMesssage(webview);
		webview.webview.html = createHtmlDocumentWithBody(/*html*/`
			<script>
				const vscode = acquireVsCodeApi();
				vscode.postMessage({  });
			</script>`);

		webview.webview.postMessage({ value: 1 });
		await firstResponse;
		assert.strictEqual(webview.viewColumn, vscode.ViewColumn.One);

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

const statefulWebviewHtml = createHtmlDocumentWithBody(/*html*/ `
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
		vscode.postMessage({ type: 'ready' });
	</script>`);


function getMesssage<R = any>(webview: vscode.WebviewPanel): Promise<R> {
	return new Promise<R>(resolve => {
		const sub = webview.webview.onDidReceiveMessage(message => {
			sub.dispose();
			resolve(message);
		});
	});
}

function sendRecieveMessage<T = {}, R = any>(webview: vscode.WebviewPanel, message: T): Promise<R> {
	const p = getMesssage<R>(webview);
	webview.webview.postMessage(message);
	return p;
}
