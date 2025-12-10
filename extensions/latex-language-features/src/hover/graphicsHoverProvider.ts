/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Pattern to match \includegraphics commands
 */
const GRAPHICS_PATTERN = /\\includegraphics\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/;

/**
 * Common image extensions to try when the file doesn't have an extension
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.eps', '.svg', '.bmp'];

/**
 * Provides hover preview for LaTeX \includegraphics commands
 */
export class GraphicsHoverProvider implements vscode.HoverProvider {

	/**
	 * Provide hover for \includegraphics commands
	 */
	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.Hover | undefined> {
		const config = vscode.workspace.getConfiguration('latex');
		const hoverEnabled = config.get<boolean>('hover.graphics.enabled', true);

		if (!hoverEnabled) {
			return undefined;
		}

		// Check if we're on an \includegraphics command
		const range = document.getWordRangeAtPosition(position, GRAPHICS_PATTERN);
		if (!range) {
			return undefined;
		}

		const text = document.getText(range);
		const match = GRAPHICS_PATTERN.exec(text);
		if (!match) {
			return undefined;
		}

		const options = match[1] || '';
		const relPath = match[2];
		if (!relPath) {
			return undefined;
		}

		// Find the actual file
		const filePath = await this.findGraphicsFile(relPath, document);
		if (!filePath) {
			const markdown = new vscode.MarkdownString(`Image file not found: \`${relPath}\``);
			return new vscode.Hover(markdown, range);
		}

		// Extract page number if specified
		let pageNumber = 1;
		const pageMatch = /page\s*=\s*(\d+)/.exec(options);
		if (pageMatch) {
			pageNumber = parseInt(pageMatch[1], 10);
		}

		// Build hover content
		const hoverContent = await this.buildGraphicsHover(filePath, pageNumber);
		if (hoverContent) {
			return new vscode.Hover(hoverContent, range);
		}

		return undefined;
	}

	/**
	 * Find the graphics file, trying different extensions if needed
	 */
	private async findGraphicsFile(
		relPath: string,
		document: vscode.TextDocument
	): Promise<vscode.Uri | undefined> {
		const documentDir = vscode.Uri.joinPath(document.uri, '..');

		// Get graphics paths from configuration
		const config = vscode.workspace.getConfiguration('latex');
		const graphicsPaths = config.get<string[]>('texDirs', []);

		// Directories to search
		const searchDirs = [
			documentDir,
			...graphicsPaths.map(p => {
				if (p.startsWith('/') || p.match(/^[a-zA-Z]:/)) {
					return vscode.Uri.file(p);
				}
				return vscode.Uri.joinPath(documentDir, p);
			})
		];

		// Add workspace root if available
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		if (workspaceFolder) {
			searchDirs.push(workspaceFolder.uri);
		}

		// Check if path already has an extension
		const hasExtension = IMAGE_EXTENSIONS.some(ext =>
			relPath.toLowerCase().endsWith(ext)
		);

		for (const dir of searchDirs) {
			if (hasExtension) {
				// Try exact path
				const uri = vscode.Uri.joinPath(dir, relPath);
				if (await this.fileExists(uri)) {
					return uri;
				}
			} else {
				// Try with different extensions
				for (const ext of IMAGE_EXTENSIONS) {
					const uri = vscode.Uri.joinPath(dir, relPath + ext);
					if (await this.fileExists(uri)) {
						return uri;
					}
				}
			}
		}

		return undefined;
	}

	/**
	 * Check if a file exists
	 */
	private async fileExists(uri: vscode.Uri): Promise<boolean> {
		try {
			await vscode.workspace.fs.stat(uri);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Build hover content for a graphics file
	 */
	private async buildGraphicsHover(
		fileUri: vscode.Uri,
		_pageNumber: number
	): Promise<vscode.MarkdownString | undefined> {
		// Use path instead of fsPath for cross-platform/web compatibility
		const filePath = fileUri.path.toLowerCase();

		// Check file type
		if (this.isImageFile(filePath)) {
			return this.buildImageHover(fileUri);
		} else if (filePath.endsWith('.pdf')) {
			return this.buildPdfHover(fileUri);
		}

		return undefined;
	}

	/**
	 * Check if file is a supported image type
	 */
	private isImageFile(filePath: string): boolean {
		const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];
		return imageExts.some(ext => filePath.endsWith(ext));
	}

	/**
	 * Build hover for image files (PNG, JPG, etc.)
	 */
	private buildImageHover(fileUri: vscode.Uri): vscode.MarkdownString {
		const config = vscode.workspace.getConfiguration('latex');
		const maxHeight = config.get<number>('hover.graphics.maxHeight', 300);

		// For images, we can show them directly
		// Use vscode.Uri encoding for proper path handling
		const md = new vscode.MarkdownString();

		// Check if we're in a remote environment
		if (vscode.env.remoteName) {
			// In remote, use the URI directly
			md.appendMarkdown(`![Image](${fileUri.toString()})`);
		} else {
			// Use HTML for better control over size
			md.appendMarkdown(`<img src="${fileUri.toString()}" style="max-height: ${maxHeight}px; max-width: 500px;" />`);
			md.supportHtml = true;
		}

		// Add file path info (use path for web compatibility)
		md.appendMarkdown(`\n\n \`${fileUri.path}\``);

		return md;
	}

	/**
	 * Build hover for PDF files
	 * Note: PDF preview is limited in VS Code hovers
	 */
	private buildPdfHover(fileUri: vscode.Uri): vscode.MarkdownString {
		const md = new vscode.MarkdownString();

		// We can't directly preview PDF in hovers, but we can show info
		// Use path instead of fsPath for web compatibility
		md.appendMarkdown(`**PDF File**\n\n`);
		md.appendMarkdown(`\`${fileUri.path}\`\n\n`);
		md.appendMarkdown(`*PDF preview not available in hover. Click to open.*`);

		// Add command link to open the file
		const openCommand = vscode.Uri.parse(`command:vscode.open?${encodeURIComponent(JSON.stringify([fileUri]))}`);
		md.appendMarkdown(`\n\n[Open PDF](${openCommand})`);
		md.isTrusted = true;

		return md;
	}
}

/**
 * Register the graphics hover provider
 */
export function registerGraphicsHoverProvider(context: vscode.ExtensionContext): vscode.Disposable {
	const provider = new GraphicsHoverProvider();

	const selector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' }
	];

	const registration = vscode.languages.registerHoverProvider(selector, provider);
	context.subscriptions.push(registration);

	return registration;
}

