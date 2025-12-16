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
import { TypstDocumentHighlightProvider } from './features/documentHighlightProvider';
import { TypstDocumentLinkProvider } from './features/documentLinkProvider';
import { registerWordCountProvider } from './features/wordCountProvider';
import { registerPreviewPanel } from './features/previewPanel';
import { registerBidirectionalPreview } from './features/previewPanelBidirectional';

let typstService: TypstService | undefined;

// Track which documents have open PDF previews
const openPreviews = new Set<string>();

// Debounce timers for auto-refresh on save
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Debounce delay in milliseconds for PDF refresh after save
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Activates the Typst Language Features extension.
 *
 * Uses @myriaddreamin/typst-ts-web-compiler for WASM-based compilation.
 * Language features (completions, hover) use static data.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const logger = vscode.window.createOutputChannel('Typst');
	context.subscriptions.push(logger);

	logger.appendLine('Activating Typst Language Features extension (Node/Electron)...');

	// Set extension URI for WASM loading in formatting provider
	setFormatterExtensionUri(context.extensionUri);

	// Initialize the Typst service with Node/Electron WASM path
	// WASM files are copied to dist/wasm/ by webpack in production builds
	// In development, tsc outputs to out/ but webpack must be run to copy WASM files
	typstService = new TypstService(context, { wasmPath: ['dist', 'wasm'] }, logger);
	context.subscriptions.push(typstService);

	// Document selector for Typst files
	const typstSelector: vscode.DocumentSelector = [
		{ language: 'typst', scheme: '*' }
	];

	// Register language providers (static data, no WASM needed)
	// Trigger characters: # (code), . (methods), @ (references/citations), quote chars (file paths)
	const doubleQuote = String.fromCharCode(34); // " character
	const singleQuote = String.fromCharCode(39); // ' character
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			typstSelector,
			new TypstCompletionProvider(),
			'#', '.', '@', doubleQuote, singleQuote
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

	// Register document highlight provider (highlights same symbols)
	context.subscriptions.push(
		vscode.languages.registerDocumentHighlightProvider(
			typstSelector,
			new TypstDocumentHighlightProvider()
		)
	);

	// Register document link provider (clickable links)
	context.subscriptions.push(
		vscode.languages.registerDocumentLinkProvider(
			typstSelector,
			new TypstDocumentLinkProvider()
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
				vscode.window.showWarningMessage('Typst compiler is not ready yet');
				return;
			}

			// Compile to PDF for preview - PDF has native text search and selection
			const result = await typstService.compileToPdf(editor.document);
			if (result.success && result.pdf) {
				try {
					// Use the pdf-preview extension with PDF data directly
					await vscode.commands.executeCommand('pdfPreview.showPdf', {
						pdfData: result.pdf,
						sourceUri: editor.document.uri,
						viewColumn: vscode.ViewColumn.Beside,
						onSyncClick: 'typst.syncToSource',
						onSyncScroll: 'typst.syncScrollFromPdf'
					});
					// Track that this document has an open preview
					const docUriStr = editor.document.uri.toString();
					openPreviews.add(docUriStr);
					logger.appendLine(`PDF Preview opened for: ${editor.document.uri.fsPath}`);
					logger.appendLine(`[Auto-refresh] Now tracking preview for: ${docUriStr}`);
				} catch (error) {
					logger.appendLine(`PDF preview failed: ${error}`);
					vscode.window.showErrorMessage(`Preview failed: ${error}`);
				}
			} else {
				vscode.window.showErrorMessage(`Preview failed: ${result.error}`);
			}
		})
	);

	// Command to sync from preview to source (click-to-source navigation)
	context.subscriptions.push(
		vscode.commands.registerCommand('typst.syncToSource', async (params: { page?: number; x?: number; y?: number; text?: string }) => {
			if (!params.text || params.text.length < 2) {
				logger.appendLine('[Sync] No text content provided for source navigation');
				return;
			}

			const searchText = params.text.trim();
			logger.appendLine(`[Sync] Attempting to navigate to source for text: "${searchText.substring(0, 50)}..."`);

			try {
				// Find the document to navigate to
				const activeEditor = vscode.window.activeTextEditor;
				let targetDoc: vscode.TextDocument | undefined;

				// Use the tracked preview document or active typst document
				if (activeEditor && activeEditor.document.languageId === 'typst') {
					targetDoc = activeEditor.document;
				} else {
					// Try to find a Typst document in the open previews
					for (const docUri of openPreviews) {
						const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === docUri);
						if (doc) {
							targetDoc = doc;
							break;
						}
					}
				}

				if (!targetDoc) {
					logger.appendLine('[Sync] No Typst document found');
					return;
				}

				// Search for the text in the document
				const sourceText = targetDoc.getText();
				const sourceLines = sourceText.split('\n');
				let foundLine = -1;
				let foundColumn = 0;

				// Normalize the search text
				const normalizedSearch = searchText.replace(/\s+/g, ' ');

				// Strategy 1: Direct text match
				for (let i = 0; i < sourceLines.length; i++) {
					const line = sourceLines[i];
					const colIdx = line.indexOf(normalizedSearch);
					if (colIdx !== -1) {
						foundLine = i;
						foundColumn = colIdx;
						logger.appendLine(`[Sync] Found exact match at line ${i + 1}`);
						break;
					}
				}

				// Strategy 2: Try first few words if exact match fails
				if (foundLine === -1 && normalizedSearch.length > 20) {
					const firstWords = normalizedSearch.split(/\s+/).slice(0, 5).join(' ');
					if (firstWords.length >= 10) {
						for (let i = 0; i < sourceLines.length; i++) {
							const line = sourceLines[i];
							if (line.includes(firstWords)) {
								foundLine = i;
								foundColumn = line.indexOf(firstWords);
								logger.appendLine(`[Sync] Found partial match (first words) at line ${i + 1}`);
								break;
							}
						}
					}
				}

				// Strategy 3: Fuzzy match - find best matching line
				if (foundLine === -1) {
					const words = normalizedSearch.split(/\s+/).filter(w => w.length > 2);
					if (words.length > 0) {
						let bestLine = -1;
						let bestScore = 0;

						for (let i = 0; i < sourceLines.length; i++) {
							const line = sourceLines[i];
							if (!line.trim() || line.trim().startsWith('//')) {
								continue;
							}

							let score = 0;
							for (const word of words) {
								if (line.includes(word)) {
									score += word.length;
								}
							}

							if (score > bestScore) {
								bestScore = score;
								bestLine = i;
							}
						}

						if (bestLine >= 0 && bestScore >= Math.min(normalizedSearch.length / 3, 10)) {
							foundLine = bestLine;
							foundColumn = 0;
							logger.appendLine(`[Sync] Found fuzzy match at line ${bestLine + 1} (score: ${bestScore})`);
						}
					}
				}

				if (foundLine >= 0) {
					const position = new vscode.Position(foundLine, foundColumn);

					const editor = await vscode.window.showTextDocument(targetDoc, vscode.ViewColumn.One);
					editor.selection = new vscode.Selection(position, position);
					editor.revealRange(
						new vscode.Range(position, position),
						vscode.TextEditorRevealType.InCenter
					);
					logger.appendLine(`[Sync] Navigated to line ${foundLine + 1}, column ${foundColumn + 1}`);
				} else {
					logger.appendLine('[Sync] Could not find text in source document');
				}
			} catch (error) {
				logger.appendLine(`[Sync] Error navigating to source: ${error}`);
			}
		})
	);

	// Command to download PDF from preview (called when user clicks download button)
	context.subscriptions.push(
		vscode.commands.registerCommand('typst.downloadPdf', async (params: { sourceUri?: vscode.Uri }) => {
			// Find the source document
			let targetDoc: vscode.TextDocument | undefined;

			if (params?.sourceUri) {
				targetDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === params.sourceUri?.toString());
			}

			if (!targetDoc) {
				// Try to find a Typst document in the open previews
				for (const docUri of openPreviews) {
					const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === docUri);
					if (doc) {
						targetDoc = doc;
						break;
					}
				}
			}

			if (!targetDoc) {
				vscode.window.showWarningMessage('No Typst document found for PDF export');
				return;
			}

			if (!typstService?.isReady) {
				vscode.window.showWarningMessage('Typst compiler is not ready yet');
				return;
			}

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Generating PDF...',
				cancellable: false
			}, async () => {
				const result = await typstService!.compileToPdf(targetDoc!);

				if (result.success && result.pdf) {
					// Use save dialog
					const defaultUri = targetDoc!.uri.with({
						path: targetDoc!.uri.path.replace(/\.typ$/, '.pdf')
					});

					const saveUri = await vscode.window.showSaveDialog({
						defaultUri,
						filters: { 'PDF': ['pdf'] }
					});

					if (saveUri) {
						await vscode.workspace.fs.writeFile(saveUri, result.pdf);
						logger.appendLine(`PDF exported to: ${saveUri.fsPath}`);
						vscode.window.showInformationMessage(`PDF exported to ${saveUri.fsPath}`);
					}
				} else {
					vscode.window.showErrorMessage(`PDF export failed: ${result.error}`);
				}
			});
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
				vscode.window.showWarningMessage('Typst compiler is not ready yet');
				return;
			}

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Exporting to PDF...',
				cancellable: false
			}, async () => {
				const result = await typstService!.compileToPdf(editor.document);

				if (result.success && result.pdf) {
					// Save the PDF
					const pdfUri = editor.document.uri.with({
						path: editor.document.uri.path.replace(/\.typ$/, '.pdf')
					});

					await vscode.workspace.fs.writeFile(pdfUri, result.pdf);
					vscode.window.showInformationMessage(`PDF exported: ${pdfUri.fsPath}`);
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

	// Register bidirectional sync preview panel
	const previewDisposables = registerPreviewPanel(context, logger);
	previewDisposables.forEach(d => context.subscriptions.push(d));

	// Register PoC bidirectional preview with custom WASM
	const bidirectionalDisposables = registerBidirectionalPreview(context, logger);
	bidirectionalDisposables.forEach(d => context.subscriptions.push(d));
	logger.appendLine('Typst Bidirectional Preview (PoC) registered');
	logger.appendLine('Typst Preview Panel with bidirectional sync registered');

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

				// Recompile to PDF and update the preview
				const result = await typstService.compileToPdf(document);
				if (result.success && result.pdf) {
					logger.appendLine(`[Auto-refresh] Compilation successful, PDF size: ${result.pdf.length} bytes`);
					try {
						await vscode.commands.executeCommand('pdfPreview.showPdf', {
							pdfData: result.pdf,
							sourceUri: document.uri,
							viewColumn: vscode.ViewColumn.Beside,
							onSyncClick: 'typst.syncToSource',
							onSyncScroll: 'typst.syncScrollFromPdf',
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

	// Flag to prevent feedback loop during sync
	let isNavigatingFromPreview = false;

	// Command to handle scroll sync from preview (scroll mode)
	context.subscriptions.push(
		vscode.commands.registerCommand('typst.syncScrollFromPdf', async (data: { percent: number }) => {
			// Find the most recently used typst document
			let targetDoc: vscode.TextDocument | undefined;
			for (const docUri of openPreviews) {
				const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === docUri);
				if (doc) {
					targetDoc = doc;
					break;
				}
			}

			if (!targetDoc) {
				return;
			}

			try {
				const targetLine = Math.floor(data.percent * targetDoc.lineCount);
				const position = new vscode.Position(Math.min(targetLine, targetDoc.lineCount - 1), 0);

				// Prevent editor→preview sync while we're moving the editor from preview
				isNavigatingFromPreview = true;

				const editor = await vscode.window.showTextDocument(targetDoc, vscode.ViewColumn.One);
				editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);

				// Short timeout - main protection is on webview side (mouse position check)
				setTimeout(() => {
					isNavigatingFromPreview = false;
				}, 200);
			} catch (error) {
				logger.appendLine(`Scroll sync from PDF failed: ${error}`);
			}
		})
	);

	// Source-to-preview sync (scroll mode): scroll preview when editor scrolls
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
			// Skip if we're navigating from preview (prevents feedback loop)
			if (isNavigatingFromPreview) {
				return;
			}

			// Only process Typst files with open previews
			if (e.textEditor.document.languageId !== 'typst') {
				return;
			}

			const docUri = e.textEditor.document.uri.toString();
			if (!openPreviews.has(docUri)) {
				return;
			}

			const visibleRanges = e.visibleRanges;
			if (visibleRanges.length > 0) {
				const topLine = visibleRanges[0].start.line;
				const lineCount = e.textEditor.document.lineCount;
				const percent = lineCount > 0 ? topLine / lineCount : 0;

				// Send scroll command to the PDF preview (source: 'scroll')
				try {
					vscode.commands.executeCommand('pdfPreview.scrollToPercent', {
						sourceUri: docUri,
						percent: percent,
						source: 'scroll'
					});
				} catch {
					// Silently ignore - scroll sync is best-effort
				}
			}
		})
	);

	// Source-to-preview sync (click mode): scroll preview when cursor moves in editor
	let cursorSyncTimer: ReturnType<typeof setTimeout> | undefined;
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection((e) => {
			// Skip if we're navigating from preview (prevents feedback loop)
			if (isNavigatingFromPreview) {
				return;
			}

			// Only process Typst files with open previews
			if (e.textEditor.document.languageId !== 'typst') {
				return;
			}

			const docUri = e.textEditor.document.uri.toString();
			if (!openPreviews.has(docUri)) {
				return;
			}

			// Debounce cursor sync
			if (cursorSyncTimer) {
				clearTimeout(cursorSyncTimer);
			}

			cursorSyncTimer = setTimeout(async () => {
				const position = e.textEditor.selection.active;
				const totalLines = e.textEditor.document.lineCount;
				const currentLine = position.line;

				// Calculate scroll percentage based on cursor position
				const scrollPercent = totalLines > 1 ? currentLine / (totalLines - 1) : 0;

				// Send scroll command to the PDF preview (source: 'click')
				try {
					await vscode.commands.executeCommand('pdfPreview.scrollToPercent', {
						sourceUri: docUri,
						percent: scrollPercent,
						source: 'click'
					});
				} catch {
					// Silently ignore - scroll sync is best-effort
				}
			}, 100);
		})
	);

	// Initialize WASM compiler asynchronously
	typstService.initialize().catch(error => {
		logger.appendLine(`Warning: WASM initialization failed: ${error}`);
		logger.appendLine('Compilation and diagnostics will be unavailable.');
	});

	logger.appendLine('Typst Language Features extension activated');
}

export function deactivate(): void {
	typstService?.dispose();
}

