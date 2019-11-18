/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PreviewManager } from './preview';
import { SizeStatusBarEntry } from './sizeStatusBarEntry';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { ZoomStatusBarEntry } from './zoomStatusBarEntry';

export function activate(context: vscode.ExtensionContext) {
	const extensionRoot = vscode.Uri.file(context.extensionPath);

	const sizeStatusBarEntry = new SizeStatusBarEntry();
	context.subscriptions.push(sizeStatusBarEntry);

	const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
	context.subscriptions.push(binarySizeStatusBarEntry);

	const zoomStatusBarEntry = new ZoomStatusBarEntry();
	context.subscriptions.push(zoomStatusBarEntry);

	const previewManager = new PreviewManager(extensionRoot, sizeStatusBarEntry, binarySizeStatusBarEntry, zoomStatusBarEntry);

	context.subscriptions.push(vscode.window.registerWebviewEditorProvider(
		PreviewManager.viewType,
		{
			async resolveWebviewEditor({ resource }, editor: vscode.WebviewPanel): Promise<vscode.WebviewEditorCapabilities> {
				return previewManager.resolve(resource, editor);
			}
		}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.zoomIn', () => {
		previewManager.activePreview?.zoomIn();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.zoomOut', () => {
		previewManager.activePreview?.zoomOut();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('imagePreview.testing.makeEdit', () => {
		previewManager.activePreview?.test_makeEdit();
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('imagePreview.customEditorTestMode')) {
			updateTestMode();
		}
	}));
	updateTestMode();
}

function updateTestMode() {
	const isInTestMode = vscode.workspace.getConfiguration('imagePreview').get<boolean>('customEditorTestMode', false);
	vscode.commands.executeCommand('setContext', 'imagePreviewTestMode', isInTestMode);
}
