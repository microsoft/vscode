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
});
