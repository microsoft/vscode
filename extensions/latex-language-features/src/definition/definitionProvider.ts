/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { tokenizer, escapeRegExp, sanitizeInputFilePath } from '../utils/tokenizer';
import { reference } from '../completion/completer/reference';
import { citation } from '../completion/completer/citation';
import { FileSystemUtils } from '../completion/utils/fileUtils';

/**
 * Graphics file extensions to skip when navigating to definitions
 */
const GRAPHICS_EXTENSIONS = ['.pdf', '.eps', '.jpg', '.jpeg', '.JPG', '.JPEG', '.gif', '.png'];

/**
 * LaTeX Definition Provider
 * Provides "Go to Definition" functionality for:
 * - Labels (\ref{...} → \label{...})
 * - Citations (\cite{...} → .bib entry)
 * - Input files (\input{...}, \include{...} → file)
 *
 * Ported from latex-workshop DefinitionProvider
 */
export class LaTeXDefinitionProvider implements vscode.DefinitionProvider {

	/**
	 * Try to find a file referenced by \input, \include, \subfile, etc.
	 */
	private async onAFilename(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: string
	): Promise<vscode.Uri | undefined> {
		const line = document.lineAt(position.line).text;
		const escapedToken = escapeRegExp(token);

		const regexInput = new RegExp(`\\\\(?:include|input|subfile|subfileinclude)\\{${escapedToken}\\}`);
		const regexImport = new RegExp(`\\\\(?:sub)?(?:import|includefrom|inputfrom)\\*?\\{([^\\}]*)\\}\\{${escapedToken}\\}`);
		const regexDocumentclass = new RegExp(`\\\\(?:documentclass)(?:\\[[^[]]*\\])?\\{${escapedToken}\\}`);

		const documentDirUri = FileSystemUtils.dirname(document.uri);

		// Check for \documentclass
		if (line.match(regexDocumentclass)) {
			return this.resolveFile([documentDirUri], sanitizeInputFilePath(token), '.cls');
		}

		// Check for \input, \include, etc.
		if (line.match(regexInput)) {
			return this.resolveFile([documentDirUri], sanitizeInputFilePath(token), '.tex');
		}

		// Check for \import variants
		const result = line.match(regexImport);
		if (result) {
			const importDir = result[1];
			const targetDir = vscode.Uri.joinPath(documentDirUri, sanitizeInputFilePath(importDir));
			return this.resolveFile([targetDir], sanitizeInputFilePath(token), '.tex');
		}

		return undefined;
	}

	/**
	 * Resolve a file path to a URI, checking multiple directories
	 */
	private async resolveFile(
		dirs: vscode.Uri[],
		inputFile: string,
		suffix: string
	): Promise<vscode.Uri | undefined> {
		for (const dir of dirs) {
			// Try with the file as-is
			let candidateUri = vscode.Uri.joinPath(dir, inputFile);

			// Add suffix if not present
			if (!inputFile.includes('.')) {
				candidateUri = vscode.Uri.joinPath(dir, inputFile + suffix);
			}

			if (await FileSystemUtils.exists(candidateUri)) {
				return candidateUri;
			}

			// Try adding suffix even if there's an extension
			const withSuffixUri = vscode.Uri.joinPath(dir, inputFile + suffix);
			if (await FileSystemUtils.exists(withSuffixUri)) {
				return withSuffixUri;
			}
		}

		return undefined;
	}

	/**
	 * Get the directory URI of a path
	 */
	private getPathExtension(path: string): string {
		const lastDot = path.lastIndexOf('.');
		if (lastDot === -1) {
			return '';
		}
		return path.substring(lastDot);
	}

	/**
	 * VSCode hook to provide definitions of the symbol at `position`.
	 * In LaTeX these can be labels, citations, and file names.
	 *
	 * Also provides the exact range of the found symbol (`originSelectionRange`),
	 * as different symbol types support different characters in LaTeX.
	 *
	 * @param document The document to be scanned.
	 * @param position The position to be scanned at.
	 *
	 * @returns DefinitionLink[] linking originSelectionRange to targetUri/targetRange
	 */
	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.DefinitionLink[]> {
		// Note: We accept all URI schemes since the underlying APIs (vscode.workspace.fs,
		// document.getText()) work with any scheme. This enables definition navigation
		// in web environments where schemes like 'https', 'github', or custom schemes are used.

		// Get the token at cursor position
		const tokenRange = tokenizer(document, position);
		if (tokenRange === undefined) {
			return [];
		}

		const token = document.getText(tokenRange);

		// Check if it's a macro (starts with \)
		if (token.startsWith('\\')) {
			// TODO: Support custom command definitions (\newcommand, \def)
			// This would require parsing and caching macro definitions
			return [];
		}

		// Ensure label data is loaded from the current document
		if (!reference.isLoaded()) {
			reference.refreshFromDocument(document);
		}

		// Try to find a label definition
		let labelInfo = reference.getDefinitionItem(token);
		if (!labelInfo) {
			// If not found, refresh and try again
			reference.refreshFromDocument(document);
			labelInfo = reference.getDefinitionItem(token);
		}
		if (labelInfo) {
			return [{
				targetUri: labelInfo.uri,
				targetRange: new vscode.Range(labelInfo.position, labelInfo.position),
				originSelectionRange: tokenRange
			}];
		}

		// Ensure citation data is loaded before checking
		if (!citation.isLoaded()) {
			await citation.refresh();
		}

		// Try to find a citation definition
		let citeInfo = citation.getDefinitionItem(token);
		if (!citeInfo) {
			// If still not found, force a refresh in case new .bib files were added
			await citation.refresh();
			citeInfo = citation.getDefinitionItem(token);
		}
		if (citeInfo) {
			return [{
				targetUri: citeInfo.uri,
				targetRange: new vscode.Range(citeInfo.position, citeInfo.position),
				originSelectionRange: tokenRange
			}];
		}

		// Check if it's a file path with extension (but not a graphics file)
		if (token.includes('.')) {
			const ext = this.getPathExtension(token);
			if (GRAPHICS_EXTENSIONS.includes(ext)) {
				return [];
			}

			// Try to resolve the file relative to the document
			const documentDirUri = FileSystemUtils.dirname(document.uri);
			const absoluteUri = vscode.Uri.joinPath(documentDirUri, token);

			if (await FileSystemUtils.exists(absoluteUri)) {
				return [{
					targetUri: absoluteUri,
					targetRange: new vscode.Range(0, 0, 0, 0),
					originSelectionRange: tokenRange
				}];
			}
		}

		// Try to find an input file
		const fileUri = await this.onAFilename(document, position, token);
		if (fileUri) {
			return [{
				targetUri: fileUri,
				targetRange: new vscode.Range(0, 0, 0, 0),
				originSelectionRange: tokenRange
			}];
		}

		return [];
	}
}

/**
 * Register the definition provider
 */
export function registerDefinitionProvider(_context: vscode.ExtensionContext): vscode.Disposable {
	const latexSelector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' },
		{ language: 'bibtex', scheme: '*' }
	];

	const provider = new LaTeXDefinitionProvider();
	return vscode.languages.registerDefinitionProvider(latexSelector, provider);
}

