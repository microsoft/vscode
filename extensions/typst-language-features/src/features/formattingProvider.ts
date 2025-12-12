/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// Typstyle format function type
type FormatFunction = (text: string, config: object) => string;

let typstyleFormat: FormatFunction | null = null;
let typstyleInitPromise: Promise<void> | null = null;
let initializationFailed = false;
let extensionUri: vscode.Uri | null = null;

// WASM paths for different environments
// Browser build outputs to dist/browser/, Node build outputs to dist/
const WASM_PATHS = {
	browser: ['dist', 'browser', 'wasm', 'typstyle_wasm_bg.wasm'],
	node: ['dist', 'wasm', 'typstyle_wasm_bg.wasm']
};

/**
 * Set the extension URI for WASM loading
 */
export function setFormatterExtensionUri(uri: vscode.Uri): void {
	extensionUri = uri;
}

/**
 * Check if we're running in a browser environment (pure browser, not vscode-server)
 */
function isBrowserEnvironment(): boolean {
	return typeof process === 'undefined';
}

/**
 * Initialize the typstyle WASM module
 * Uses vscode.workspace.fs.readFile() which works in all environments
 * (local dev, browser, and production vscode-server)
 */
async function initializeTypstyle(): Promise<void> {
	if (typstyleFormat !== null || initializationFailed) {
		return;
	}

	if (typstyleInitPromise) {
		return typstyleInitPromise;
	}

	typstyleInitPromise = (async () => {
		try {
			if (!extensionUri) {
				throw new Error('Extension URI not set - call setFormatterExtensionUri first');
			}

			// Import the manual WASM loader
			const { initializeTypstyleWasm, formatTypst } = await import('../wasm/typstyleWasm');

			// Determine the WASM path based on environment
			const wasmPath = isBrowserEnvironment() ? WASM_PATHS.browser : WASM_PATHS.node;
			const wasmUri = vscode.Uri.joinPath(extensionUri, ...wasmPath);

			console.log('[Typst Formatting] WASM URI:', wasmUri.toString());
			console.log('[Typst Formatting] Environment:', isBrowserEnvironment() ? 'browser' : 'node/vscode-server');

			// Read WASM file using VS Code's file system API
			// This works in all environments including vscode-server where fetch(file://) fails
			const wasmBytes = await vscode.workspace.fs.readFile(wasmUri);
			console.log(`[Typst Formatting] WASM loaded: ${wasmBytes.length} bytes`);

			// Initialize with the bytes directly
			await initializeTypstyleWasm({ wasmBytes });

			// Set the format function
			typstyleFormat = (text: string, config: object) => formatTypst(text, config);

			console.log('[Typst Formatting] typstyle initialized successfully');
		} catch (error) {
			console.error('[Typst Formatting] Failed to initialize typstyle:', error);
			initializationFailed = true;
			typstyleFormat = null;
		}
	})();

	return typstyleInitPromise;
}

/**
 * Provides document formatting for Typst documents using typstyle WASM.
 */
export class TypstFormattingProvider implements vscode.DocumentFormattingEditProvider {

	async provideDocumentFormattingEdits(
		document: vscode.TextDocument,
		options: vscode.FormattingOptions,
		_token: vscode.CancellationToken
	): Promise<vscode.TextEdit[]> {
		// Get formatting configuration
		const config = vscode.workspace.getConfiguration('typst.formatting');
		const enabled = config.get<boolean>('enabled', true);

		if (!enabled) {
			return [];
		}

		// Initialize typstyle if not already done
		await initializeTypstyle();

		if (!typstyleFormat) {
			vscode.window.showWarningMessage('Typst formatter failed to initialize. Check the output panel for details.');
			return [];
		}

		const text = document.getText();

		try {
			// Get configuration options
			const printWidth = config.get<number>('printWidth', 120);

			// Format the document using typstyle
			// Note: typstyle uses max_width and tab_spaces as config keys
			const formattedText = typstyleFormat(text, {
				max_width: printWidth,
				tab_spaces: options.tabSize,
			});

			// If the formatted text is the same, return empty (no changes)
			if (formattedText === text) {
				return [];
			}

			// Create a full document replacement edit
			const fullRange = new vscode.Range(
				document.positionAt(0),
				document.positionAt(text.length)
			);

			return [vscode.TextEdit.replace(fullRange, formattedText)];
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('[Typst Formatting] Formatting failed:', errorMessage);

			// Provide user-friendly error messages
			if (errorMessage.includes('syntax error') || errorMessage.includes('syntax errors')) {
				vscode.window.showWarningMessage('Cannot format: Please fix syntax errors in your document first.');
			} else {
				vscode.window.showErrorMessage(`Typst formatting failed: ${errorMessage}`);
			}
			return [];
		}
	}
}
