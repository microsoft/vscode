/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PdfPreviewManager, ShowPdfOptions } from './pdfPreviewManager';
import { BinarySizeStatusBarEntry } from './statusBar/binarySizeStatusBarEntry';
import { PageStatusBarEntry } from './statusBar/pageStatusBarEntry';
import { ZoomStatusBarEntry } from './statusBar/zoomStatusBarEntry';

export function activate(context: vscode.ExtensionContext) {
	const disposables: vscode.Disposable[] = [];

	const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
	disposables.push(binarySizeStatusBarEntry);

	const pageStatusBarEntry = new PageStatusBarEntry();
	disposables.push(pageStatusBarEntry);

	const zoomStatusBarEntry = new ZoomStatusBarEntry();
	disposables.push(zoomStatusBarEntry);

	const previewManager = new PdfPreviewManager(
		context.extensionUri,
		binarySizeStatusBarEntry,
		pageStatusBarEntry,
		zoomStatusBarEntry
	);

	// Register custom editor provider for .pdf files
	disposables.push(vscode.window.registerCustomEditorProvider(
		PdfPreviewManager.viewType,
		previewManager,
		{
			supportsMultipleEditorsPerDocument: true,
			webviewOptions: {
				retainContextWhenHidden: true
			}
		}
	));

	// Register commands
	disposables.push(vscode.commands.registerCommand('pdfPreview.zoomIn', () => {
		previewManager.activePreview?.zoomIn();
	}));

	disposables.push(vscode.commands.registerCommand('pdfPreview.zoomOut', () => {
		previewManager.activePreview?.zoomOut();
	}));

	disposables.push(vscode.commands.registerCommand('pdfPreview.fitWidth', () => {
		previewManager.activePreview?.fitWidth();
	}));

	disposables.push(vscode.commands.registerCommand('pdfPreview.fitPage', () => {
		previewManager.activePreview?.fitPage();
	}));

	disposables.push(vscode.commands.registerCommand('pdfPreview.goToPage', async () => {
		const input = await vscode.window.showInputBox({
			prompt: vscode.l10n.t('Enter page number'),
			validateInput: (value: string) => {
				const num = parseInt(value, 10);
				if (isNaN(num) || num < 1) {
					return vscode.l10n.t('Please enter a valid page number');
				}
				return null;
			}
		});
		if (input) {
			previewManager.activePreview?.goToPage(parseInt(input, 10));
		}
	}));

	disposables.push(vscode.commands.registerCommand('pdfPreview.download', () => {
		previewManager.activePreview?.download();
	}));

	disposables.push(vscode.commands.registerCommand('pdfPreview.rotateClockwise', () => {
		previewManager.activePreview?.rotate(90);
	}));

	disposables.push(vscode.commands.registerCommand('pdfPreview.rotateCounterClockwise', () => {
		previewManager.activePreview?.rotate(-90);
	}));

	// Register public API command for LaTeX/Typst integration
	disposables.push(vscode.commands.registerCommand('pdfPreview.showPdf', async (options: ShowPdfOptions) => {
		return previewManager.showPdfPreview(options);
	}));

	context.subscriptions.push(...disposables);
}

export function deactivate() { }
