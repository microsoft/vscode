/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PdfPreviewManager, ShowPdfOptions } from './pdfPreviewManager';
import { MarkdownPreviewManager } from './markdownPreviewManager';
import { ShowMarkdownOptions } from './markdownPreview';
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

	// PDF Preview Manager
	const previewManager = new PdfPreviewManager(
		context.extensionUri,
		binarySizeStatusBarEntry,
		pageStatusBarEntry,
		zoomStatusBarEntry
	);

	// Markdown Preview Manager
	const markdownPreviewManager = new MarkdownPreviewManager(
		context.extensionUri,
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

	// Register custom editor provider for .md files
	disposables.push(vscode.window.registerCustomEditorProvider(
		MarkdownPreviewManager.viewType,
		markdownPreviewManager,
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

	disposables.push(vscode.commands.registerCommand('pdfPreview.find', () => {
		previewManager.activePreview?.openFind();
	}));

	disposables.push(vscode.commands.registerCommand('pdfPreview.selectZoom', async () => {
		const options = [
			{ label: '50%', value: 0.5 },
			{ label: '75%', value: 0.75 },
			{ label: '100%', value: 1 },
			{ label: '125%', value: 1.25 },
			{ label: '150%', value: 1.5 },
			{ label: '200%', value: 2 },
			{ label: '300%', value: 3 },
			{ label: vscode.l10n.t('Fit Page'), value: 'fit' as const },
			{ label: vscode.l10n.t('Fit Width'), value: 'fitWidth' as const },
		];

		const selected = await vscode.window.showQuickPick(options, {
			placeHolder: vscode.l10n.t('Select zoom level')
		});

		if (selected) {
			zoomStatusBarEntry.setScale(selected.value);
		}
	}));

	// Register public API command for LaTeX/Typst integration
	disposables.push(vscode.commands.registerCommand('pdfPreview.showPdf', async (options: ShowPdfOptions) => {
		return previewManager.showPdfPreview(options);
	}));

	// ==================== MARKDOWN PREVIEW COMMANDS ====================

	// Register markdown commands
	disposables.push(vscode.commands.registerCommand('markdownPreview.zoomIn', () => {
		markdownPreviewManager.activePreview?.zoomIn();
	}));

	disposables.push(vscode.commands.registerCommand('markdownPreview.zoomOut', () => {
		markdownPreviewManager.activePreview?.zoomOut();
	}));

	disposables.push(vscode.commands.registerCommand('markdownPreview.find', () => {
		markdownPreviewManager.activePreview?.openFind();
	}));

	disposables.push(vscode.commands.registerCommand('markdownPreview.exportPdf', () => {
		markdownPreviewManager.activePreview?.exportPdf();
	}));

	// Register public API command for markdown preview
	disposables.push(vscode.commands.registerCommand('markdownPreview.showMarkdown', async (options: ShowMarkdownOptions) => {
		return markdownPreviewManager.showMarkdownPreview(options);
	}));

	// Override the built-in markdown preview command to use our preview
	disposables.push(vscode.commands.registerCommand('markdown.showPreviewToSide', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			return;
		}

		const document = editor.document;
		const content = document.getText();

		const preview = await markdownPreviewManager.showMarkdownPreview({
			markdownContent: content,
			markdownUri: document.uri,
			sourceUri: document.uri,
			viewColumn: vscode.ViewColumn.Beside,
			enableSyncClick: true
		});

		// Set up bidirectional sync for this preview
		setupBidirectionalSync(preview, document.uri, disposables);

		return preview;
	}));

	// Helper function to set up bidirectional scroll sync
	function setupBidirectionalSync(preview: import('./markdownPreview').MarkdownPreview, sourceUri: vscode.Uri, disposables: vscode.Disposable[]) {
		let isScrollingFromPreview = false;
		let isScrollingFromEditor = false;

		// Preview → Editor sync
		const scrollListener = preview.onDidScrollPreview((percent: number) => {
			if (isScrollingFromEditor || !preview.isSyncEnabled) { return; }
			isScrollingFromPreview = true;

			// Find the editor for this source
			const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === sourceUri.toString());
			if (editor) {
				const lineCount = editor.document.lineCount;
				const targetLine = Math.floor(percent * lineCount);
				const range = new vscode.Range(targetLine, 0, targetLine, 0);
				editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
			}

			setTimeout(() => { isScrollingFromPreview = false; }, 100);
		});
		disposables.push(scrollListener);

		// Editor → Preview sync
		const editorScrollListener = vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
			if (isScrollingFromPreview || !preview.isSyncEnabled) { return; }
			if (e.textEditor.document.uri.toString() !== sourceUri.toString()) { return; }
			if (e.textEditor.document.languageId !== 'markdown') { return; }

			isScrollingFromEditor = true;

			const visibleRanges = e.visibleRanges;
			if (visibleRanges.length > 0) {
				const topLine = visibleRanges[0].start.line;
				const lineCount = e.textEditor.document.lineCount;
				const percent = lineCount > 0 ? topLine / lineCount : 0;
				preview.scrollToPercent(percent);
			}

			setTimeout(() => { isScrollingFromEditor = false; }, 100);
		});
		disposables.push(editorScrollListener);

		// Update content when document changes
		const documentChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === sourceUri.toString()) {
				preview.updateMarkdown({
					markdownContent: e.document.getText(),
					markdownUri: e.document.uri,
					sourceUri: e.document.uri,
					preserveFocus: true
				});
			}
		});
		disposables.push(documentChangeListener);
	}

	// Scroll markdown preview to a percentage
	disposables.push(vscode.commands.registerCommand('markdownPreview.scrollToPercent', (options: { sourceUri?: string; percent: number }) => {
		let preview = options.sourceUri ? markdownPreviewManager.getMarkdownPreviewBySource(options.sourceUri) : undefined;
		if (!preview) {
			preview = markdownPreviewManager.activePreview;
		}
		if (preview) {
			preview.scrollToPercent(options.percent);
		}
	}));

	// Scroll markdown preview to a line
	disposables.push(vscode.commands.registerCommand('markdownPreview.scrollToLine', (options: { sourceUri?: string; line: number }) => {
		let preview = options.sourceUri ? markdownPreviewManager.getMarkdownPreviewBySource(options.sourceUri) : undefined;
		if (!preview) {
			preview = markdownPreviewManager.activePreview;
		}
		if (preview) {
			preview.scrollToLine(options.line);
		}
	}));

	// Scroll PDF preview to a percentage (for source-to-preview sync with Typst/LaTeX)
	disposables.push(vscode.commands.registerCommand('pdfPreview.scrollToPercent', (options: { sourceUri?: string; percent: number }) => {
		// Try to find the preview by source URI, or use active preview
		let preview = options.sourceUri ? previewManager.getPdfPreviewBySource(options.sourceUri) : undefined;
		if (!preview) {
			preview = previewManager.activePreview;
		}
		if (preview) {
			preview.scrollToPercent(options.percent);
		}
	}));

	// Scroll PDF preview to text (for text-based source-to-preview sync)
	disposables.push(vscode.commands.registerCommand('pdfPreview.scrollToText', (options: { sourceUri?: string; text: string }) => {
		// Try to find the preview by source URI, or use active preview
		let preview = options.sourceUri ? previewManager.getPdfPreviewBySource(options.sourceUri) : undefined;
		if (!preview) {
			preview = previewManager.activePreview;
		}
		if (preview && options.text) {
			preview.scrollToText(options.text);
		}
	}));

	context.subscriptions.push(...disposables);
}

export function deactivate() { }
