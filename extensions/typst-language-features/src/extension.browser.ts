/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TypstService } from './typstService';
import { TypstCompletionProvider } from './features/completionProvider';
import { TypstHoverProvider } from './features/hoverProvider';
import { TypstMathHoverProvider } from './features/mathHoverProvider';
import { TypstDocumentSymbolProvider } from './features/documentSymbolProvider';
import { TypstFormattingProvider, setFormatterExtensionUri } from './features/formattingProvider';
import { registerTextCommands } from './features/textCommands';
import { TypstCodeActionProvider } from './features/codeActionProvider';
import { TypstFoldingProvider } from './features/foldingProvider';
import { TypstDefinitionProvider } from './features/definitionProvider';
import { registerWordCountProvider } from './features/wordCountProvider';

let typstService: TypstService | undefined;

// Track which documents have open PDF previews
const openPreviews = new Set<string>();

// Debounce timers for auto-refresh on save
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Debounce delay in milliseconds for PDF refresh after save
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Activates the Typst Language Features extension (browser version).
 *
 * Uses @myriaddreamin/typst-ts-web-compiler for WASM-based compilation.
 * Language features (completions, hover) use static data.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const logger = vscode.window.createOutputChannel('Typst');
	context.subscriptions.push(logger);

	logger.appendLine('Activating Typst Language Features extension (browser)...');

	// Set extension URI for WASM loading in formatting provider
	setFormatterExtensionUri(context.extensionUri);

	// Initialize the Typst service with Browser WASM path
	// WASM files are copied to dist/browser/wasm/ by webpack
	typstService = new TypstService(context, { wasmPath: ['dist', 'browser', 'wasm'] }, logger);
	context.subscriptions.push(typstService);

	// Document selector for Typst files
	const typstSelector: vscode.DocumentSelector = [
		{ language: 'typst', scheme: '*' }
	];

	// Register language providers (static data, no WASM needed)
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			typstSelector,
			new TypstCompletionProvider(),
			'#', '.'
		)
	);

	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			typstSelector,
			new TypstHoverProvider()
		)
	);

	// Register math hover provider for formula preview (uses WASM compiler)
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			typstSelector,
			new TypstMathHoverProvider()
		)
	);

	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			typstSelector,
			new TypstDocumentSymbolProvider()
		)
	);

	context.subscriptions.push(
		vscode.languages.registerFoldingRangeProvider(
			typstSelector,
			new TypstFoldingProvider()
		)
	);

	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			typstSelector,
			new TypstDefinitionProvider()
		)
	);

	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider(
			typstSelector,
			new TypstFormattingProvider()
		)
	);

	// Register code action provider for AI-powered quick fixes
	context.subscriptions.push(TypstCodeActionProvider.register(context));
	logger.appendLine('Typst Code Action Provider registered for AI-powered fixes');

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('typst.preview', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'typst') {
				vscode.window.showWarningMessage('No Typst document is currently active');
				return;
			}

			if (!typstService?.isReady) {
				vscode.window.showWarningMessage('Typst compiler is loading...');
				return;
			}

			// Compile to PDF for preview using the pdf-preview extension
			const result = await typstService.compileToPdf(editor.document);
			if (result.success && result.pdf) {
				try {
					// Use the pdf-preview extension for consistent PDF viewing
					await vscode.commands.executeCommand('pdfPreview.showPdf', {
						pdfData: result.pdf,
						sourceUri: editor.document.uri,
						viewColumn: vscode.ViewColumn.Beside
					});
					// Track that this document has an open preview
					const docUriStr = editor.document.uri.toString();
					openPreviews.add(docUriStr);
					logger.appendLine(`Preview opened for: ${editor.document.uri.fsPath}`);
					logger.appendLine(`[Auto-refresh] Now tracking preview for: ${docUriStr}`);
				} catch (error) {
					// Fallback to SVG preview if pdf-preview extension is not available
					logger.appendLine(`PDF preview failed, falling back to SVG: ${error}`);
					const svgResult = await typstService.compileToSvg(editor.document);
					if (svgResult.success && svgResult.svg) {
						const panel = vscode.window.createWebviewPanel(
							'typstPreview',
							'Typst Preview',
							vscode.ViewColumn.Beside,
							{ enableScripts: true }
						);
						panel.webview.html = `<!DOCTYPE html>
<html>
<head><style>body { margin: 0; padding: 20px; background: white; }</style></head>
<body>${svgResult.svg}</body>
</html>`;
					} else {
						vscode.window.showErrorMessage(`Preview failed: ${svgResult.error}`);
					}
				}
			} else {
				vscode.window.showErrorMessage(`Preview failed: ${result.error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('typst.exportPdf', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'typst') {
				vscode.window.showWarningMessage('No Typst document is currently active');
				return;
			}

			if (!typstService?.isReady) {
				vscode.window.showWarningMessage('Typst compiler is loading...');
				return;
			}

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Exporting to PDF...',
				cancellable: false
			}, async () => {
				const result = await typstService!.compileToPdf(editor.document);

				if (result.success && result.pdf) {
					// In browser, use save dialog
					const defaultUri = editor.document.uri.with({
						path: editor.document.uri.path.replace(/\.typ$/, '.pdf')
					});

					const saveUri = await vscode.window.showSaveDialog({
						defaultUri,
						filters: { 'PDF': ['pdf'] }
					});

					if (saveUri) {
						await vscode.workspace.fs.writeFile(saveUri, result.pdf);
						vscode.window.showInformationMessage('PDF exported successfully');
					}
				} else {
					vscode.window.showErrorMessage(`Export failed: ${result.error}`);
				}
			});
		})
	);

	// Register text formatting commands (bold, italic, underline)
	const textCommandsDisposables = registerTextCommands();
	textCommandsDisposables.forEach(d => context.subscriptions.push(d));

	// Register command to create missing files (used by code actions)
	context.subscriptions.push(
		vscode.commands.registerCommand('typst.createMissingFile', async (relativePath: string, sourceUri: vscode.Uri) => {
			try {
				// Resolve the path relative to the source document
				const sourceDir = vscode.Uri.joinPath(sourceUri, '..');
				const newFileUri = vscode.Uri.joinPath(sourceDir, relativePath);

				// Create the file with empty content
				await vscode.workspace.fs.writeFile(newFileUri, new Uint8Array());
				vscode.window.showInformationMessage(`Created: ${relativePath}`);

				// Open the new file
				const doc = await vscode.workspace.openTextDocument(newFileUri);
				await vscode.window.showTextDocument(doc);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to create file: ${error}`);
			}
		})
	);
	logger.appendLine('Typst createMissingFile command registered');

	// Register word count provider (status bar)
	const wordCountDisposables = registerWordCountProvider(context);
	wordCountDisposables.forEach(d => context.subscriptions.push(d));
	logger.appendLine('Typst Word Count Provider registered');

	// Listen for document saves to auto-refresh PDF preview with debounce
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(async (document) => {
			// Only process Typst files
			if (document.languageId !== 'typst') {
				return;
			}

			const docUri = document.uri.toString();
			logger.appendLine(`[Auto-refresh] Document saved: ${document.uri.fsPath}`);
			logger.appendLine(`[Auto-refresh] Tracked previews: ${Array.from(openPreviews).join(', ') || 'none'}`);

			// Only refresh if there's an open preview for this document
			if (!openPreviews.has(docUri)) {
				logger.appendLine(`[Auto-refresh] No open preview for this document, skipping refresh`);
				return;
			}

			// Cancel any pending refresh for this document (debounce)
			const existingTimer = refreshTimers.get(docUri);
			if (existingTimer) {
				clearTimeout(existingTimer);
				logger.appendLine(`[Auto-refresh] Cancelled pending refresh timer`);
			}

			// Schedule a debounced refresh
			logger.appendLine(`[Auto-refresh] Scheduling refresh in ${REFRESH_DEBOUNCE_MS}ms`);
			const timer = setTimeout(async () => {
				refreshTimers.delete(docUri);

				if (!typstService?.isReady) {
					logger.appendLine(`[Auto-refresh] Typst service not ready, skipping`);
					return;
				}

				logger.appendLine(`[Auto-refresh] Compiling PDF for: ${document.uri.fsPath}`);

				// Recompile and update the preview
				const result = await typstService.compileToPdf(document);
				if (result.success && result.pdf) {
					logger.appendLine(`[Auto-refresh] Compilation successful, PDF size: ${result.pdf.length} bytes`);
					try {
						await vscode.commands.executeCommand('pdfPreview.showPdf', {
							pdfData: result.pdf,
							sourceUri: document.uri,
							viewColumn: vscode.ViewColumn.Beside,
							preserveFocus: true
						});
						logger.appendLine(`[Auto-refresh] Preview updated for: ${document.uri.fsPath}`);
					} catch (error) {
						// Preview might have been closed; remove from tracking
						openPreviews.delete(docUri);
						logger.appendLine(`[Auto-refresh] Failed to update preview (might be closed): ${error}`);
					}
				} else {
					// Compilation failed, but don't show error - user will see diagnostics
					logger.appendLine(`[Auto-refresh] Compilation failed: ${result.error}`);
				}
			}, REFRESH_DEBOUNCE_MS);

			refreshTimers.set(docUri, timer);
		})
	);

	// Clean up when documents are closed
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			if (document.languageId === 'typst') {
				const docUri = document.uri.toString();
				openPreviews.delete(docUri);
				const timer = refreshTimers.get(docUri);
				if (timer) {
					clearTimeout(timer);
					refreshTimers.delete(docUri);
				}
			}
		})
	);

	// Initialize WASM compiler - critical for browser
	try {
		await typstService.initialize();
		logger.appendLine('WASM compiler initialized');
	} catch (error) {
		logger.appendLine(`WASM initialization failed: ${error}`);
		vscode.window.showWarningMessage('Typst compiler failed to load. Some features may be unavailable.');
	}

	logger.appendLine('Typst Language Features extension activated (browser)');
}

export function deactivate(): void {
	typstService?.dispose();
}

