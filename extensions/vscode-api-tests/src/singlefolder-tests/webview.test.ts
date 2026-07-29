/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { asPromise } from '../utils';

suite('vscode API - webview', () => {
	const disposables: vscode.Disposable[] = [];
	const webviewViewType = 'webview-resource-load-test';
	const resourceCount = 625;
	const resourceSize = 128 * 1024;

	suiteSetup(async () => {
		await vscode.extensions.getExtension('vscode.vscode-api-tests')?.activate();
	});

	teardown(() => {
		vscode.Disposable.from(...disposables).dispose();
		disposables.length = 0;
	});

	test('loads many local resources concurrently without crashing', async function () {
		if (vscode.env.uiKind !== vscode.UIKind.Desktop) {
			this.skip();
		}

		const timeout = 60_000;
		this.timeout(timeout);

		const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vscode-webview-resource-load-'));
		try {
			const panel = vscode.window.createWebviewPanel(webviewViewType, 'Webview Resource Load Test', vscode.ViewColumn.Active, {
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(tempDir)],
			});
			disposables.push(panel);

			const didDispose = asPromise(panel.onDidDispose, timeout);
			const didReceiveMessage = new Promise<{
				readonly type: 'done';
				readonly count: number;
				readonly totalBytes: number;
			}>((resolve, reject) => {
				disposables.push(panel.webview.onDidReceiveMessage(message => {
					if (message?.type === 'done') {
						resolve(message);
					} else if (message?.type === 'error') {
						reject(new Error(message.message));
					}
				}));
			});

			const expectedTotalBytes = resourceCount * resourceSize;
			const resources: string[] = [];
			for (let index = 0; index < resourceCount; index++) {
				const filePath = path.join(tempDir, `resource-${index}.bin`);
				await writeFile(filePath, Buffer.alloc(resourceSize, index));
				resources.push(panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString());
			}

			const nonce = String(Date.now());
			panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';">
</head>
<body>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const resources = ${JSON.stringify(resources)};
		const loadResources = async () => {
			try {
				const lengths = await Promise.all(resources.map(async resource => {
					const response = await fetch(resource);
					if (!response.ok) {
						throw new Error(\`Unexpected status \${response.status} for \${resource}\`);
					}
					const bytes = await response.arrayBuffer();
					return bytes.byteLength;
				}));
				vscode.postMessage({
					type: 'done',
					count: lengths.length,
					totalBytes: lengths.reduce((total, value) => total + value, 0),
				});
			} catch (error) {
				vscode.postMessage({
					type: 'error',
					message: error instanceof Error ? error.message : String(error),
				});
			}
		};
		window.addEventListener('error', event => {
			vscode.postMessage({ type: 'error', message: event.message });
		});
		window.addEventListener('unhandledrejection', event => {
			const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
			vscode.postMessage({ type: 'error', message: reason });
		});
		void loadResources();
	</script>
</body>
</html>`;

			const result = await Promise.race([
				didReceiveMessage,
				didDispose.then(() => Promise.reject(new Error('Webview disposed before resources finished loading'))),
			]);

			assert.deepStrictEqual(result, {
				type: 'done',
				count: resourceCount,
				totalBytes: expectedTotalBytes,
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test('consumes Ctrl/Cmd+W and Ctrl/Cmd+N so the platform cannot act on them too', async () => {
		const timeout = 20_000;

		// 'plain a' must stay un-prevented so webview content keeps receiving keys.
		const cases = [
			{ name: 'ctrl+w', keyCode: 87, ctrlKey: true, metaKey: false },
			{ name: 'meta+w', keyCode: 87, ctrlKey: false, metaKey: true },
			{ name: 'ctrl+n', keyCode: 78, ctrlKey: true, metaKey: false },
			{ name: 'meta+n', keyCode: 78, ctrlKey: false, metaKey: true },
			{ name: 'plain a', keyCode: 65, ctrlKey: false, metaKey: false },
		];

		const panel = vscode.window.createWebviewPanel(webviewViewType, 'Webview Keydown Test', vscode.ViewColumn.Active, {
			enableScripts: true,
		});
		disposables.push(panel);

		const didDispose = asPromise(panel.onDidDispose, timeout);
		const didReceiveMessage = new Promise<{
			readonly type: 'done';
			readonly results: readonly { readonly name: string; readonly keyCode: number; readonly defaultPrevented: boolean }[];
		}>((resolve, reject) => {
			disposables.push(panel.webview.onDidReceiveMessage(message => {
				if (message?.type === 'done') {
					resolve(message);
				} else if (message?.type === 'error') {
					reject(new Error(message.message));
				}
			}));
		});

		const nonce = String(Date.now());
		panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}';">
</head>
<body>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const cases = ${JSON.stringify(cases)};
		const run = () => {
			try {
				const results = cases.map(testCase => {
					const event = new KeyboardEvent('keydown', {
						keyCode: testCase.keyCode,
						ctrlKey: testCase.ctrlKey,
						metaKey: testCase.metaKey,
						bubbles: true,
						cancelable: true,
					});
					// The handler matches on keyCode, which not every engine takes from init.
					if (event.keyCode !== testCase.keyCode) {
						Object.defineProperty(event, 'keyCode', { get: () => testCase.keyCode });
					}
					// Untrusted events are not forwarded, so this cannot close the panel.
					window.dispatchEvent(event);
					return { name: testCase.name, keyCode: event.keyCode, defaultPrevented: event.defaultPrevented };
				});
				vscode.postMessage({ type: 'done', results });
			} catch (error) {
				vscode.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
			}
		};
		// Yield so the host's keydown listener on this window is certainly attached.
		setTimeout(run, 0);
	</script>
</body>
</html>`;

		const result = await Promise.race([
			didReceiveMessage,
			didDispose.then(() => Promise.reject(new Error('Webview disposed before the keydown probe reported'))),
		]);

		assert.deepStrictEqual(result.results, [
			{ name: 'ctrl+w', keyCode: 87, defaultPrevented: true },
			{ name: 'meta+w', keyCode: 87, defaultPrevented: true },
			{ name: 'ctrl+n', keyCode: 78, defaultPrevented: true },
			{ name: 'meta+n', keyCode: 78, defaultPrevented: true },
			{ name: 'plain a', keyCode: 65, defaultPrevented: false },
		]);
	});
});
