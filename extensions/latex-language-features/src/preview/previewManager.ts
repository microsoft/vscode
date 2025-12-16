/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannelLogger } from '../utils/logger';

/**
 * Manages LaTeX PDF preview by delegating to the pdf-preview extension.
 * Provides bidirectional sync between source and PDF preview.
 */
export class PreviewManager implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly texUriMap = new Map<string, vscode.Uri>();
	private readonly openPreviews = new Set<string>();
	private isNavigatingFromPreview = false;
	private cursorSyncTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly logger: OutputChannelLogger
	) {
		// Register command to handle clicks in PDF for source navigation
		this.disposables.push(
			vscode.commands.registerCommand('latex.syncFromPdf', async (data: { page?: number; x?: number; y?: number; text?: string }) => {
				await this.handleSyncFromPdf(data);
			})
		);

		// Register command to handle scroll sync from PDF preview
		this.disposables.push(
			vscode.commands.registerCommand('latex.syncScrollFromPdf', async (data: { percent: number }) => {
				await this.handleScrollSyncFromPdf(data);
			})
		);

		// Register cursor sync: editor -> preview
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection((e) => {
				this.handleEditorSelectionChange(e);
			})
		);

		// Register scroll sync: editor -> preview (for scroll mode)
		this.disposables.push(
			vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
				this.handleEditorScrollChange(e);
			})
		);
	}

	/**
	 * Show preview using the pdf-preview extension
	 */
	async showPreview(texUri: vscode.Uri, pdfPath: string, pdfData?: Uint8Array, position?: vscode.Position): Promise<void> {
		const key = texUri.toString();
		this.texUriMap.set(key, texUri);
		this.openPreviews.add(key);

		// Get PDF URI if path is provided
		let pdfUri: vscode.Uri | undefined;
		if (pdfPath && !pdfData) {
			pdfUri = typeof pdfPath === 'string' && pdfPath.startsWith('file://')
				? vscode.Uri.parse(pdfPath)
				: typeof pdfPath === 'string' && pdfPath
					? vscode.Uri.file(pdfPath)
					: undefined;
		}

		// Calculate sync position from text position
		let syncPosition: { page: number; x?: number; y?: number } | undefined;
		if (position) {
			// Approximate page calculation based on line number
			const page = Math.max(1, Math.floor(position.line / 40) + 1);
			syncPosition = { page };
		}

		try {
			// Call pdf-preview extension command with bidirectional sync enabled
			await vscode.commands.executeCommand('pdfPreview.showPdf', {
				pdfData,
				pdfUri,
				sourceUri: texUri,
				viewColumn: vscode.ViewColumn.Beside,
				syncPosition,
				onSyncClick: 'latex.syncFromPdf', // Enable click-to-source navigation
				onSyncScroll: 'latex.syncScrollFromPdf' // Enable scroll-to-source navigation
			});

			this.logger.info(`Preview opened for: ${texUri.fsPath}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Failed to open PDF preview: ${message}`);
			throw new Error(`Failed to open PDF preview: ${message}`);
		}
	}

	/**
	 * Update existing preview with new PDF data (for auto-refresh)
	 */
	async updatePreview(texUri: vscode.Uri, pdfData: Uint8Array): Promise<void> {
		const key = texUri.toString();
		if (!this.openPreviews.has(key)) {
			return;
		}

		try {
			await vscode.commands.executeCommand('pdfPreview.showPdf', {
				pdfData,
				sourceUri: texUri,
				viewColumn: vscode.ViewColumn.Beside,
				onSyncClick: 'latex.syncFromPdf',
				onSyncScroll: 'latex.syncScrollFromPdf',
				preserveFocus: true
			});
			this.logger.info(`Preview updated for: ${texUri.fsPath}`);
		} catch (error) {
			// Preview might have been closed
			this.openPreviews.delete(key);
			this.logger.warn(`Failed to update preview (might be closed): ${error}`);
		}
	}

	/**
	 * Sync from source to PDF (SyncTeX forward)
	 */
	async syncFromSource(texUri: vscode.Uri, position: vscode.Position): Promise<void> {
		const page = Math.max(1, Math.floor(position.line / 40) + 1);

		try {
			await vscode.commands.executeCommand('pdfPreview.showPdf', {
				sourceUri: texUri,
				syncPosition: { page }
			});
			this.logger.info(`SyncTeX forward: line ${position.line} -> page ${page}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(`SyncTeX forward failed: ${message}`);
		}
	}

	/**
	 * Handle clicks in PDF to navigate to source (text-based matching)
	 */
	private async handleSyncFromPdf(data: { page?: number; x?: number; y?: number; text?: string }): Promise<void> {
		// Find the most recently used tex URI for this preview
		const texUri = Array.from(this.texUriMap.values()).pop();
		if (!texUri) {
			this.logger.warn('Sync backward: no source file associated with preview');
			return;
		}

		try {
			const document = await vscode.workspace.openTextDocument(texUri);
			const sourceText = document.getText();
			const sourceLines = sourceText.split('\n');

			let foundLine = -1;
			let foundColumn = 0;

			// Strategy 1: Use clicked text to find location in source
			if (data.text && data.text.length >= 2) {
				const searchText = data.text.trim();
				const normalizedSearch = searchText.replace(/\s+/g, ' ');
				this.logger.info(`[Sync] Searching for text: "${normalizedSearch.substring(0, 50)}..."`);

				// Direct text match
				for (let i = 0; i < sourceLines.length; i++) {
					const line = sourceLines[i];
					const colIdx = line.indexOf(normalizedSearch);
					if (colIdx !== -1) {
						foundLine = i;
						foundColumn = colIdx;
						this.logger.info(`[Sync] Found direct match at line ${i + 1}`);
						break;
					}
				}

				// Partial match for longer text
				if (foundLine === -1 && normalizedSearch.length > 20) {
					const firstWords = normalizedSearch.split(/\s+/).slice(0, 5).join(' ');
					if (firstWords.length >= 10) {
						for (let i = 0; i < sourceLines.length; i++) {
							const line = sourceLines[i];
							if (line.includes(firstWords)) {
								foundLine = i;
								foundColumn = line.indexOf(firstWords);
								this.logger.info(`[Sync] Found partial match at line ${i + 1}`);
								break;
							}
						}
					}
				}

				// Fuzzy match - find best matching line
				if (foundLine === -1) {
					const words = normalizedSearch.split(/\s+/).filter(w => w.length > 2);
					if (words.length > 0) {
						let bestLine = -1;
						let bestScore = 0;

						for (let i = 0; i < sourceLines.length; i++) {
							const line = sourceLines[i];
							if (!line.trim() || line.trim().startsWith('%')) {
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
							this.logger.info(`[Sync] Found fuzzy match at line ${bestLine + 1} (score: ${bestScore})`);
						}
					}
				}
			}

			// Strategy 2: Fallback to page-based positioning
			if (foundLine === -1 && data.page) {
				const linesPerPage = 40;
				foundLine = Math.max(0, (data.page - 1) * linesPerPage);
				if (data.y) {
					foundLine += Math.floor(data.y / 15);
				}
				foundLine = Math.min(foundLine, document.lineCount - 1);
				this.logger.info(`[Sync] Using page-based position: page ${data.page} -> line ${foundLine + 1}`);
			}

			if (foundLine >= 0) {
				const position = new vscode.Position(foundLine, foundColumn);

				// Prevent feedback loop
				this.isNavigatingFromPreview = true;

				const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

				this.logger.info(`[Sync] Navigated to line ${foundLine + 1}, column ${foundColumn + 1}`);

				// Short timeout - main protection is on webview side (mouse position check)
				setTimeout(() => {
					this.isNavigatingFromPreview = false;
				}, 200);
			} else {
				this.logger.warn('[Sync] Could not find text in source document');
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Sync backward failed: ${message}`);
		}
	}

	/**
	 * Handle scroll sync from PDF preview (scroll mode)
	 */
	private async handleScrollSyncFromPdf(data: { percent: number }): Promise<void> {
		// Find the most recently used tex URI for this preview
		const texUri = Array.from(this.texUriMap.values()).pop();
		if (!texUri) {
			return;
		}

		try {
			const document = await vscode.workspace.openTextDocument(texUri);
			const targetLine = Math.floor(data.percent * document.lineCount);
			const position = new vscode.Position(Math.min(targetLine, document.lineCount - 1), 0);

			// Prevent feedback loop
			this.isNavigatingFromPreview = true;

			const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);

			// Short timeout - main protection is on webview side (mouse position check)
			setTimeout(() => {
				this.isNavigatingFromPreview = false;
			}, 200);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(`Scroll sync from PDF failed: ${message}`);
		}
	}

	/**
	 * Handle editor scroll changes for scroll sync mode
	 */
	private handleEditorScrollChange(e: vscode.TextEditorVisibleRangesChangeEvent): void {
		// Skip if we're navigating from preview (prevents feedback loop)
		if (this.isNavigatingFromPreview) {
			return;
		}

		// Only process LaTeX files with open previews
		const doc = e.textEditor.document;
		if (doc.languageId !== 'latex' && doc.languageId !== 'tex') {
			return;
		}

		const docUri = doc.uri.toString();
		if (!this.openPreviews.has(docUri)) {
			return;
		}

		const visibleRanges = e.visibleRanges;
		if (visibleRanges.length > 0) {
			const topLine = visibleRanges[0].start.line;
			const lineCount = doc.lineCount;
			const percent = lineCount > 0 ? topLine / lineCount : 0;

			// Send scroll command to the PDF preview (source: 'scroll')
			vscode.commands.executeCommand('pdfPreview.scrollToPercent', {
				sourceUri: docUri,
				percent: percent,
				source: 'scroll'
			});
		}
	}

	/**
	 * Handle editor cursor changes to sync preview scroll
	 * Uses text-based search to find the cursor position in the PDF's text layer
	 */
	private handleEditorSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {
		// Skip if we're navigating from preview (prevents feedback loop)
		// Also cancel any pending timer to prevent delayed sync after flag is cleared
		if (this.isNavigatingFromPreview) {
			if (this.cursorSyncTimer) {
				clearTimeout(this.cursorSyncTimer);
				this.cursorSyncTimer = undefined;
			}
			return;
		}

		// Only process LaTeX files with open previews
		const doc = e.textEditor.document;
		if (doc.languageId !== 'latex' && doc.languageId !== 'tex') {
			return;
		}

		const docUri = doc.uri.toString();
		if (!this.openPreviews.has(docUri)) {
			return;
		}

		// Debounce cursor sync
		if (this.cursorSyncTimer) {
			clearTimeout(this.cursorSyncTimer);
		}

		this.cursorSyncTimer = setTimeout(() => {
			const position = e.textEditor.selection.active;
			const lineText = doc.lineAt(position.line).text.trim();

			// Skip empty lines, comments, and LaTeX commands that don't produce visible text
			if (!lineText || lineText.startsWith('%') || lineText.startsWith('\\')) {
				// Try to find nearby content lines
				let searchText = '';
				for (let i = position.line; i < Math.min(position.line + 5, doc.lineCount); i++) {
					const text = doc.lineAt(i).text.trim();
					if (text && !text.startsWith('%') && !text.startsWith('\\')) {
						searchText = text;
						break;
					}
				}
				if (!searchText) {
					// No visible content found, fall back to percentage (source: 'click')
					const scrollPercent = doc.lineCount > 1 ? position.line / (doc.lineCount - 1) : 0;
					vscode.commands.executeCommand('pdfPreview.scrollToPercent', {
						sourceUri: docUri,
						percent: scrollPercent,
						source: 'click'
					});
					return;
				}
				// Use the found content text (source: 'click')
				vscode.commands.executeCommand('pdfPreview.scrollToText', {
					sourceUri: docUri,
					text: searchText.substring(0, 100), // Limit to 100 chars
					source: 'click'
				});
			} else {
				// Use the current line text to find position in PDF (source: 'click')
				vscode.commands.executeCommand('pdfPreview.scrollToText', {
					sourceUri: docUri,
					text: lineText.substring(0, 100), // Limit to 100 chars
					source: 'click'
				});
			}
		}, 150); // 150ms debounce
	}

	/**
	 * Check if a preview is open for the given URI
	 */
	hasPreview(texUri: vscode.Uri): boolean {
		return this.openPreviews.has(texUri.toString());
	}

	/**
	 * Close preview tracking for a document
	 */
	closePreview(texUri: vscode.Uri): void {
		const key = texUri.toString();
		this.openPreviews.delete(key);
		this.texUriMap.delete(key);
	}

	dispose(): void {
		if (this.cursorSyncTimer) {
			clearTimeout(this.cursorSyncTimer);
		}
		this.disposables.forEach(d => d.dispose());
		this.texUriMap.clear();
		this.openPreviews.clear();
	}
}
