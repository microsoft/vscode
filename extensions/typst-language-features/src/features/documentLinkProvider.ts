/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Provides clickable links in Typst documents.
 *
 * Detects and makes clickable:
 * - File paths in #import("path"), #include("path")
 * - Image paths in #image("path")
 * - Bibliography paths in #bibliography("path")
 * - URLs (http://, https://, mailto:)
 * - Local file links in #link("file://path")
 */
export class TypstDocumentLinkProvider implements vscode.DocumentLinkProvider {

	async provideDocumentLinks(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): Promise<vscode.DocumentLink[]> {
		const links: vscode.DocumentLink[] = [];
		const text = document.getText();

		// Find all file path patterns
		this.findImportLinks(document, text, links);
		this.findIncludeLinks(document, text, links);
		this.findImageLinks(document, text, links);
		this.findBibliographyLinks(document, text, links);
		this.findUrlLinks(document, text, links);
		this.findTypstLinks(document, text, links);

		return links;
	}

	async resolveDocumentLink(
		link: vscode.DocumentLink,
		_token: vscode.CancellationToken
	): Promise<vscode.DocumentLink> {
		// Links are already resolved in provideDocumentLinks
		return link;
	}

	/**
	 * Find #import "path" or #import("path") patterns
	 */
	private findImportLinks(document: vscode.TextDocument, text: string, links: vscode.DocumentLink[]): void {
		// Match #import "path" or #import("path")
		const importPattern = /#import\s*\(?\s*["']([^"']+)["']/g;
		let match: RegExpMatchArray | null;

		while ((match = importPattern.exec(text)) !== null) {
			const path = match[1];
			// Skip package imports (start with @)
			if (path.startsWith('@')) {
				continue;
			}

			const pathStart = match.index! + match[0].indexOf(match[1]);
			const pathEnd = pathStart + match[1].length;

			const startPos = document.positionAt(pathStart);
			const endPos = document.positionAt(pathEnd);
			const range = new vscode.Range(startPos, endPos);

			const targetUri = this.resolveFilePath(document, path, ['.typ', '']);
			if (targetUri) {
				const link = new vscode.DocumentLink(range, targetUri);
				link.tooltip = `Open ${path}`;
				links.push(link);
			}
		}
	}

	/**
	 * Find #include "path" or #include("path") patterns
	 */
	private findIncludeLinks(document: vscode.TextDocument, text: string, links: vscode.DocumentLink[]): void {
		const includePattern = /#include\s*\(?\s*["']([^"']+)["']/g;
		let match: RegExpMatchArray | null;

		while ((match = includePattern.exec(text)) !== null) {
			const path = match[1];
			const pathStart = match.index! + match[0].indexOf(match[1]);
			const pathEnd = pathStart + match[1].length;

			const startPos = document.positionAt(pathStart);
			const endPos = document.positionAt(pathEnd);
			const range = new vscode.Range(startPos, endPos);

			const targetUri = this.resolveFilePath(document, path, ['.typ', '']);
			if (targetUri) {
				const link = new vscode.DocumentLink(range, targetUri);
				link.tooltip = `Open ${path}`;
				links.push(link);
			}
		}
	}

	/**
	 * Find #image("path") patterns
	 */
	private findImageLinks(document: vscode.TextDocument, text: string, links: vscode.DocumentLink[]): void {
		const imagePattern = /#image\s*\(\s*["']([^"']+)["']/g;
		let match: RegExpMatchArray | null;

		while ((match = imagePattern.exec(text)) !== null) {
			const path = match[1];
			const pathStart = match.index! + match[0].indexOf(match[1]);
			const pathEnd = pathStart + match[1].length;

			const startPos = document.positionAt(pathStart);
			const endPos = document.positionAt(pathEnd);
			const range = new vscode.Range(startPos, endPos);

			const targetUri = this.resolveFilePath(document, path, ['']);
			if (targetUri) {
				const link = new vscode.DocumentLink(range, targetUri);
				link.tooltip = `Open image: ${path}`;
				links.push(link);
			}
		}
	}

	/**
	 * Find #bibliography("path") patterns
	 */
	private findBibliographyLinks(document: vscode.TextDocument, text: string, links: vscode.DocumentLink[]): void {
		const bibPattern = /#bibliography\s*\(\s*["']([^"']+)["']/g;
		let match: RegExpMatchArray | null;

		while ((match = bibPattern.exec(text)) !== null) {
			const path = match[1];
			const pathStart = match.index! + match[0].indexOf(match[1]);
			const pathEnd = pathStart + match[1].length;

			const startPos = document.positionAt(pathStart);
			const endPos = document.positionAt(pathEnd);
			const range = new vscode.Range(startPos, endPos);

			const targetUri = this.resolveFilePath(document, path, ['']);
			if (targetUri) {
				const link = new vscode.DocumentLink(range, targetUri);
				link.tooltip = `Open bibliography: ${path}`;
				links.push(link);
			}
		}
	}

	/**
	 * Find URLs (http://, https://, mailto:)
	 */
	private findUrlLinks(document: vscode.TextDocument, text: string, links: vscode.DocumentLink[]): void {
		// Match URLs in the text (both standalone and inside link functions)
		const urlPattern = /\bhttps?:\/\/[^\s\])"'<>]+|mailto:[^\s\])"'<>]+/g;
		let match: RegExpMatchArray | null;

		while ((match = urlPattern.exec(text)) !== null) {
			const url = match[0];
			const startPos = document.positionAt(match.index!);
			const endPos = document.positionAt(match.index! + url.length);
			const range = new vscode.Range(startPos, endPos);

			try {
				const link = new vscode.DocumentLink(range, vscode.Uri.parse(url));
				link.tooltip = `Open ${url}`;
				links.push(link);
			} catch {
				// Invalid URL, skip
			}
		}
	}

	/**
	 * Find #link("url") or #link("path") patterns
	 */
	private findTypstLinks(document: vscode.TextDocument, text: string, links: vscode.DocumentLink[]): void {
		const linkPattern = /#link\s*\(\s*["']([^"']+)["']/g;
		let match: RegExpMatchArray | null;

		while ((match = linkPattern.exec(text)) !== null) {
			const target = match[1];
			const pathStart = match.index! + match[0].indexOf(match[1]);
			const pathEnd = pathStart + match[1].length;

			const startPos = document.positionAt(pathStart);
			const endPos = document.positionAt(pathEnd);
			const range = new vscode.Range(startPos, endPos);

			let targetUri: vscode.Uri | undefined;

			// Check if it's a URL
			if (target.match(/^https?:\/\//)) {
				try {
					targetUri = vscode.Uri.parse(target);
				} catch {
					// Invalid URL
				}
			}
			// Check if it's a mailto link
			else if (target.startsWith('mailto:')) {
				try {
					targetUri = vscode.Uri.parse(target);
				} catch {
					// Invalid mailto
				}
			}
			// Check if it's a file:// link
			else if (target.startsWith('file://')) {
				try {
					targetUri = vscode.Uri.parse(target);
				} catch {
					// Invalid file URI
				}
			}
			// Treat as relative file path
			else if (!target.startsWith('#')) {
				// Skip anchor links like #section
				targetUri = this.resolveFilePath(document, target, ['']);
			}

			if (targetUri) {
				const link = new vscode.DocumentLink(range, targetUri);
				link.tooltip = `Open ${target}`;
				links.push(link);
			}
		}
	}

	/**
	 * Resolve a file path relative to the document
	 * @param document The source document
	 * @param path The path to resolve
	 * @param extensions Extensions to try (including empty string for exact match)
	 * @returns The resolved URI or undefined if file doesn't exist
	 */
	private resolveFilePath(
		document: vscode.TextDocument,
		path: string,
		extensions: string[]
	): vscode.Uri | undefined {
		const documentDir = vscode.Uri.joinPath(document.uri, '..');

		// Try each extension
		for (const ext of extensions) {
			const fullPath = ext && !path.endsWith(ext) ? path + ext : path;
			const targetUri = vscode.Uri.joinPath(documentDir, fullPath);

			// Return the URI even if file doesn't exist - VS Code will handle the error
			// This is better UX as it allows users to click and see the error
			// and potentially create the file
			return targetUri;
		}

		return undefined;
	}
}

