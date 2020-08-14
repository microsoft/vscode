/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { PreviewManager } from './preview';
import { SizeStatusBarEntry } from './sizeStatusBarEntry';
import { ZoomStatusBarEntry } from './zoomStatusBarEntry';

export function activate(context: vscode.ExtensionContext) {
	const sizeStatusBarEntry = new SizeStatusBarEntry();
	context.subscriptions.push(sizeStatusBarEntry);

	const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
	context.subscriptions.push(binarySizeStatusBarEntry);

	const zoomStatusBarEntry = new ZoomStatusBarEntry();
	context.subscriptions.push(zoomStatusBarEntry);

	const previewManager = new PreviewManager(context.extensionUri, sizeStatusBarEntry, binarySizeStatusBarEntry, zoomStatusBarEntry);

	context.subscriptions.push(vscode.window.registerCustomEditorProvider(PreviewManager.viewType, previewManager, {
		supportsMultipleEditorsPerDocument: true,
	}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.zoomIn', () => {
		previewManager.activePreview?.zoomIn();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.zoomOut', () => {
		previewManager.activePreview?.zoomOut();
	}));

	vscode.window.registerWebviewViewProvider('cats.cat', new class implements vscode.WebviewViewProvider {
		async resolveWebviewView(webviewView: vscode.WebviewView, _state: unknown) {
			await new Promise(resolve => setTimeout(resolve, 2000));

			webviewView.webview.html = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Document</title>
			</head>
			<body style="background-color: transparent">
				<img src="https://media.giphy.com/media/E6jscXfv3AkWQ/giphy.gif">
			</body>
			</html>`;

		}
	});
}
