/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { typesetWithTimeout, initializeMathJax } from './mathjaxService';
import { getColor, mathjaxify, stripTeX, addDummyCodeBlock, svg2DataUrl } from './utils';
import { findTeX, TeXMathEnv } from './mathFinder';

/**
 * Command ID for navigating to a location (used in hover links)
 */
export const GOTO_LOCATION_COMMAND = 'latex.gotoLocation';

/**
 * Reference data for a label
 */
interface LabelData {
	label: string;
	file: string;
	line: number;
	documentation: string;
	math?: TeXMathEnv;
}

/**
 * Cache for label definitions across the workspace
 */
const labelCache = new Map<string, LabelData>();

/**
 * Pattern to match reference commands
 */
const REF_PATTERN = /\\(?:ref|eqref|pageref|autoref|cref|Cref|vref|hyperref\[([^\]]*)\])\{([^}]*)\}/;

/**
 * Pattern to match label commands
 */
const LABEL_PATTERN = /\\label\{([^}]*)\}/g;

/**
 * Provides hover information for LaTeX references (\ref, \eqref, etc.)
 */
export class ReferenceHoverProvider implements vscode.HoverProvider, vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private cacheInitialized = false;

	constructor() {
		// Initialize MathJax for equation preview
		initializeMathJax();

		// Register the goto location command for hover links
		this.disposables.push(
			vscode.commands.registerCommand(GOTO_LOCATION_COMMAND, async (uriString: string, line: number) => {
				try {
					const uri = vscode.Uri.parse(uriString);
					const position = new vscode.Position(line, 0);

					// Try to open the document and reveal the location
					const doc = await vscode.workspace.openTextDocument(uri);
					const editor = await vscode.window.showTextDocument(doc, { preview: false });
					editor.selection = new vscode.Selection(position, position);
					editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
				} catch (error) {
					console.error('[ReferenceHoverProvider] Failed to navigate:', error);
					vscode.window.showErrorMessage(`Failed to navigate to location: ${error}`);
				}
			})
		);

		// Watch for document changes to update cache
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (this.isLaTeXDocument(e.document)) {
					this.updateDocumentLabels(e.document);
				}
			})
		);

		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((document) => {
				if (this.isLaTeXDocument(document)) {
					this.updateDocumentLabels(document);
				}
			})
		);

		this.disposables.push(
			vscode.workspace.onDidCloseTextDocument((document) => {
				// Remove labels from this document
				this.removeDocumentLabels(document.uri.toString());
			})
		);
	}

	private isLaTeXDocument(document: vscode.TextDocument): boolean {
		return document.languageId === 'latex' || document.languageId === 'tex';
	}

	/**
	 * Initialize the label cache from all open documents
	 */
	private async initializeCache(): Promise<void> {
		if (this.cacheInitialized) {
			return;
		}

		// Scan all open documents
		for (const document of vscode.workspace.textDocuments) {
			if (this.isLaTeXDocument(document)) {
				this.updateDocumentLabels(document);
			}
		}

		// Also scan workspace files
		const files = await vscode.workspace.findFiles('**/*.tex', '**/node_modules/**', 100);
		for (const file of files) {
			try {
				const document = await vscode.workspace.openTextDocument(file);
				this.updateDocumentLabels(document);
			} catch {
				// Ignore errors opening files
			}
		}

		this.cacheInitialized = true;
	}

	/**
	 * Update labels for a document
	 */
	private updateDocumentLabels(document: vscode.TextDocument): void {
		const uri = document.uri.toString();
		const text = document.getText();

		// Remove old labels from this document
		this.removeDocumentLabels(uri);

		// Find all labels in the document
		let match: RegExpExecArray | null;
		const labelPattern = new RegExp(LABEL_PATTERN.source, 'g');

		while ((match = labelPattern.exec(text)) !== null) {
			const label = match[1];
			const position = document.positionAt(match.index);

			// Check if label is inside a math environment
			const mathEnv = findTeX(document, position);

			const labelData: LabelData = {
				label,
				file: uri,
				line: position.line,
				documentation: this.extractLabelContext(document, position),
				math: mathEnv ?? undefined
			};

			labelCache.set(label, labelData);
		}
	}

	/**
	 * Remove all labels from a document
	 */
	private removeDocumentLabels(uri: string): void {
		for (const [label, data] of labelCache.entries()) {
			if (data.file === uri) {
				labelCache.delete(label);
			}
		}
	}

	/**
	 * Extract meaningful context around a label
	 */
	private extractLabelContext(document: vscode.TextDocument, position: vscode.Position): string {
		const lines: string[] = [];
		const startLine = Math.max(0, position.line - 2);
		const endLine = Math.min(document.lineCount - 1, position.line + 2);

		for (let i = startLine; i <= endLine; i++) {
			lines.push(document.lineAt(i).text);
		}

		return lines.join('\n');
	}

	/**
	 * Provide hover for reference commands
	 */
	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.Hover | undefined> {
		const config = vscode.workspace.getConfiguration('latex');
		const hoverEnabled = config.get<boolean>('hover.ref.enabled', true);

		if (!hoverEnabled) {
			return undefined;
		}

		// Initialize cache if needed
		await this.initializeCache();

		// Check if we're on a reference command
		const range = document.getWordRangeAtPosition(position, REF_PATTERN);
		if (!range) {
			return undefined;
		}

		const text = document.getText(range);
		const match = REF_PATTERN.exec(text);
		if (!match) {
			return undefined;
		}

		// Get the referenced label (handle both \ref{label} and \hyperref[label]{text})
		const label = match[2] || match[1];
		if (!label) {
			return undefined;
		}

		// Look up the label in cache
		const labelData = labelCache.get(label);
		if (!labelData) {
			// Label not found
			const markdown = new vscode.MarkdownString(`⚠️ Label \`${label}\` not found`);
			return new vscode.Hover(markdown, range);
		}

		// Build hover content
		const hoverContent: vscode.MarkdownString[] = [];

		// If it's a math label, try to render the equation
		if (labelData.math && config.get<boolean>('hover.ref.preview.enabled', true)) {
			try {
				const mathPreview = await this.renderMathPreview(labelData.math);
				if (mathPreview) {
					hoverContent.push(mathPreview);
				}
			} catch (error) {
				console.error('[ReferenceHoverProvider] Failed to render math preview:', error);
			}
		}

		// Add code block with label context
		const codeBlock = new vscode.MarkdownString();
		codeBlock.appendCodeblock(labelData.documentation, 'latex');
		hoverContent.push(codeBlock);

		// Add link to go to definition using our custom command
		// This works in both desktop and web environments
		const args = encodeURIComponent(JSON.stringify([labelData.file, labelData.line]));
		const linkMarkdown = new vscode.MarkdownString(
			`[Go to definition](command:${GOTO_LOCATION_COMMAND}?${args})`
		);
		linkMarkdown.isTrusted = true;
		hoverContent.push(linkMarkdown);

		return new vscode.Hover(hoverContent, range);
	}

	/**
	 * Render math preview as SVG
	 */
	private async renderMathPreview(tex: TeXMathEnv): Promise<vscode.MarkdownString | undefined> {
		const config = vscode.workspace.getConfiguration('latex');
		const scale = config.get<number>('hover.preview.scale', 1);

		try {
			// Process the TeX string for MathJax
			const processedTex = mathjaxify(tex.texString, tex.envname);
			const typesetArg = stripTeX(processedTex, '');

			const svg = await typesetWithTimeout(typesetArg, { scale, color: getColor() });
			const dataUrl = svg2DataUrl(svg);

			return new vscode.MarkdownString(addDummyCodeBlock(`![equation](${dataUrl})`));
		} catch {
			return undefined;
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		labelCache.clear();
	}
}

/**
 * Register the reference hover provider
 */
export function registerReferenceHoverProvider(context: vscode.ExtensionContext): vscode.Disposable {
	const provider = new ReferenceHoverProvider();

	const selector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' }
	];

	const registration = vscode.languages.registerHoverProvider(selector, provider);

	context.subscriptions.push(provider);
	context.subscriptions.push(registration);

	return registration;
}

