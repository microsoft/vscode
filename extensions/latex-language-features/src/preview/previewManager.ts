/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannelLogger } from '../utils/logger';

/**
 * Manages LaTeX PDF preview by delegating to the pdf-preview extension.
 * Provides SyncTeX support for bidirectional navigation between source and PDF.
 */
export class PreviewManager implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly texUriMap = new Map<string, vscode.Uri>();

	constructor(
		private readonly logger: OutputChannelLogger
	) {
		// SyncTeX is disabled by default - uncomment to enable click-to-source navigation
		// this.disposables.push(
		// 	vscode.commands.registerCommand('latex.syncFromPdf', async (data: { page: number; x: number; y: number }) => {
		// 		await this.handleSyncFromPdf(data);
		// 	})
		// );
	}

	/**
	 * Show preview using the pdf-preview extension
	 */
	async showPreview(texUri: vscode.Uri, pdfPath: string, pdfData?: Uint8Array, position?: vscode.Position): Promise<void> {
		const key = texUri.toString();
		this.texUriMap.set(key, texUri);

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
			// This is a rough estimate; real SyncTeX would use .synctex.gz data
			const page = Math.max(1, Math.floor(position.line / 40) + 1);
			syncPosition = { page };
		}

		try {
			// Call pdf-preview extension command
			// Note: onSyncClick is not passed to disable SyncTeX click behavior
			await vscode.commands.executeCommand('pdfPreview.showPdf', {
				pdfData,
				pdfUri,
				sourceUri: texUri,
				viewColumn: vscode.ViewColumn.Beside,
				syncPosition
				// onSyncClick: 'latex.syncFromPdf' // Disabled - enables click-to-source navigation
			});

			this.logger.info(`Preview opened for: ${texUri.fsPath}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Failed to open PDF preview: ${message}`);
			throw new Error(`Failed to open PDF preview: ${message}`);
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

	// SyncTeX backward is disabled - uncomment to enable click-to-source navigation
	// /**
	//  * Handle SyncTeX backward (click in PDF -> jump to source)
	//  */
	// private async handleSyncFromPdf(data: { page: number; x: number; y: number }): Promise<void> {
	// 	// Find the most recently used tex URI for this preview
	// 	// In a real implementation, you would track which source file opened which preview
	// 	const texUri = Array.from(this.texUriMap.values()).pop();
	// 	if (!texUri) {
	// 		this.logger.warn('SyncTeX backward: no source file associated with preview');
	// 		return;
	// 	}
	//
	// 	try {
	// 		// Calculate approximate line from page and y position
	// 		// This is a rough estimate; real SyncTeX would use .synctex.gz data
	// 		const linesPerPage = 40;
	// 		const line = Math.max(0, (data.page - 1) * linesPerPage + Math.floor(data.y / 15));
	//
	// 		const document = await vscode.workspace.openTextDocument(texUri);
	// 		const position = new vscode.Position(Math.min(line, document.lineCount - 1), 0);
	// 		const editor = await vscode.window.showTextDocument(document);
	// 		editor.selection = new vscode.Selection(position, position);
	// 		editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
	//
	// 		this.logger.info(`SyncTeX backward: page ${data.page}, y ${data.y} -> line ${line}`);
	// 	} catch (error) {
	// 		const message = error instanceof Error ? error.message : String(error);
	// 		this.logger.error(`SyncTeX backward failed: ${message}`);
	// 	}
	// }

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.texUriMap.clear();
	}
}
