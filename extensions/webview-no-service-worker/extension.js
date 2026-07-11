/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = require('vscode');

/** @param {vscode.ExtensionContext} context */
function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('webviewNoServiceWorker.open', () => {
		const panel = vscode.window.createWebviewPanel(
			'webviewNoServiceWorker.test',
			'Single-Iframe Webview',
			vscode.ViewColumn.Active,
			{ enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] }
		);
		const style = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'style.css'));
		const image = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'image.svg'));
		const nonce = 'vscodeSingleIframeTest';
		panel.webview.html = `<!DOCTYPE html>
		<html><head>
		<meta charset="utf-8">
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource}; style-src ${panel.webview.cspSource}; script-src ${panel.webview.cspSource} 'nonce-${nonce}'">
		<link rel="stylesheet" href="${style}">
		</head><body>
		<h1>Single-iframe webview</h1>
		<img src="${image}" alt="VS Code test image" width="96" height="96">
		<p id="status">Waiting for VS Code API…</p>
		<button id="increment">Increment persisted counter</button>
		<script nonce="${nonce}">
			const vscode = acquireVsCodeApi();
			const state = vscode.getState() || { count: 0 };
			const status = document.getElementById('status');
			const render = () => status.textContent = 'VS Code API ready. Count: ' + state.count;
			document.getElementById('increment').addEventListener('click', () => {
				state.count++;
				vscode.setState(state);
				vscode.postMessage({ type: 'count', value: state.count });
				render();
			});
			render();
			vscode.postMessage({ type: 'ready' });
		</script>
		</body></html>`;
		panel.webview.onDidReceiveMessage(message => {
			if (message.type === 'ready') {
				void vscode.window.setStatusBarMessage('Single-iframe webview ready', 3000);
			}
		});
	}));
}

exports.activate = activate;
