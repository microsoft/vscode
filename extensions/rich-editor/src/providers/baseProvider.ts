/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Messages from webview to extension
 */
export interface WebviewMessage {
	type: 'ready' | 'update' | 'save' | 'requestLink' | 'openLink' | 'editLink' | 'requestImage' | 'requestTable' | 'requestMathInline' | 'requestMathBlock' | 'pasteImage' | 'dropImage' | 'requestCodeBlock';
	content?: string;
	url?: string;
	imageData?: string; // Base64 image data
	imageName?: string; // Suggested filename
	mimeType?: string; // Image MIME type
}

/**
 * Messages from extension to webview
 */
export interface ExtensionMessage {
	type: 'load' | 'setTheme' | 'setLink' | 'setImage' | 'insertTable' | 'setMathInline' | 'setMathBlock' | 'setCodeBlock';
	content?: string;
	format?: 'markdown' | 'typst';
	theme?: 'light' | 'dark';
	url?: string;
	src?: string;
	alt?: string;
	resourceBaseUri?: string; // Base URI for resolving relative paths (document dir)
	workspaceRootUri?: string; // Base URI for absolute paths (workspace root)
	documentDirPath?: string; // Workspace-relative path to document directory (for better path resolution)
	documentDirUri?: string; // Full URI of document directory (for resolving images)
	rows?: number; // Table rows
	cols?: number; // Table columns
	language?: string; // Code block language
	resolvedImages?: Record<string, string>; // Map of relative paths to resolved data URLs
}

/**
 * Base class for rich text editor providers
 */
export abstract class BaseEditorProvider implements vscode.CustomTextEditorProvider {
	public abstract readonly viewType: string;
	protected abstract readonly format: 'markdown' | 'typst';

	constructor(protected readonly context: vscode.ExtensionContext) { }

	/**
	 * Extract image paths from document content and resolve them to webview URIs
	 * Returns a map of relative paths to resolved URIs
	 */
	private async resolveImagesInContent(
		content: string,
		documentDir: vscode.Uri,
		format: 'markdown' | 'typst'
	): Promise<Record<string, string>> {
		const resolvedImages: Record<string, string> = {};

		// Extract image paths based on format
		const imagePaths: string[] = [];

		console.log('[Rich Editor] Searching for images in content, format:', format, 'content length:', content.length);

		if (format === 'typst') {
			// Match #image("path") or #image("path", ...) in Typst
			// The path is the first quoted string after #image(
			const typstImageRegex = /#image\(\s*"([^"]+)"/g;
			let match;
			while ((match = typstImageRegex.exec(content)) !== null) {
				console.log('[Rich Editor] Found Typst image:', match[1]);
				imagePaths.push(match[1]);
			}
		} else {
			// Match ![alt](path) in Markdown
			const mdImageRegex = /!\[[^\]]*\]\(([^)\s]+)/g;
			let match;
			while ((match = mdImageRegex.exec(content)) !== null) {
				console.log('[Rich Editor] Found Markdown image:', match[1]);
				imagePaths.push(match[1]);
			}
		}

		console.log('[Rich Editor] Total image paths found:', imagePaths.length);

		// Resolve each image path
		for (const imagePath of imagePaths) {
			// Skip already absolute URLs
			if (imagePath.startsWith('http://') || imagePath.startsWith('https://') ||
				imagePath.startsWith('data:')) {
				continue;
			}

			try {
				// Resolve the path relative to document directory
				const imageUri = vscode.Uri.joinPath(documentDir, imagePath);
				console.log(`[Rich Editor] Resolving image: ${imagePath} -> ${imageUri.toString()}`);

				// Check if file exists
				try {
					await vscode.workspace.fs.stat(imageUri);

					// Read the file and convert to base64 data URL
					const fileData = await vscode.workspace.fs.readFile(imageUri);

					// Determine MIME type
					const ext = imagePath.toLowerCase().split('.').pop() || '';
					const mimeTypes: Record<string, string> = {
						'png': 'image/png',
						'jpg': 'image/jpeg',
						'jpeg': 'image/jpeg',
						'gif': 'image/gif',
						'svg': 'image/svg+xml',
						'webp': 'image/webp',
						'bmp': 'image/bmp'
					};
					const mimeType = mimeTypes[ext] || 'image/png';

					// Convert to base64
					const base64 = Buffer.from(fileData).toString('base64');
					const dataUrl = `data:${mimeType};base64,${base64}`;

					resolvedImages[imagePath] = dataUrl;
					console.log(`[Rich Editor] Resolved image ${imagePath} to data URL (${fileData.length} bytes)`);
				} catch (err) {
					console.log(`[Rich Editor] Image not found: ${imageUri.toString()}`);
				}
			} catch (err) {
				console.error(`[Rich Editor] Error resolving image ${imagePath}:`, err);
			}
		}

		return resolvedImages;
	}

	/**
	 * Calculate relative path from document directory to target file
	 * Uses workspace-relative paths for correct resolution in webview
	 */
	private calculateRelativePath(fromDir: vscode.Uri, toFile: vscode.Uri): string {
		// Get workspace-relative paths (this is what the webview sees)
		const fromRelative = vscode.workspace.asRelativePath(fromDir, false);
		const toRelative = vscode.workspace.asRelativePath(toFile, false);

		// Normalize paths - remove trailing slashes
		const normalizePath = (p: string) => {
			while (p.endsWith('/')) {
				p = p.slice(0, -1);
			}
			return p;
		};

		const fromPath = normalizePath(fromRelative);
		const toPath = normalizePath(toRelative);

		// Get the directory containing the target file and the filename
		const lastSlash = toPath.lastIndexOf('/');
		const toDir = lastSlash > 0 ? toPath.substring(0, lastSlash) : '';
		const fileName = lastSlash >= 0 ? toPath.substring(lastSlash + 1) : toPath;

		// If same directory, just return filename
		if (fromPath === toDir) {
			return fileName;
		}

		// If target is in a subdirectory of fromDir
		if (toDir.startsWith(fromPath + '/')) {
			const subPath = toDir.substring(fromPath.length + 1);
			return subPath + '/' + fileName;
		}

		// If fromDir is empty (root), just return the full relative path
		if (!fromPath || fromPath === '.') {
			return toPath;
		}

		// Calculate relative path by finding common ancestor
		const fromParts = fromPath.split('/').filter(p => p);
		const toParts = toDir ? toDir.split('/').filter(p => p) : [];

		// Find common ancestor
		let commonLength = 0;
		const minLength = Math.min(fromParts.length, toParts.length);
		for (let i = 0; i < minLength; i++) {
			if (fromParts[i] === toParts[i]) {
				commonLength++;
			} else {
				break;
			}
		}

		// Go up from fromDir to common ancestor, then down to target dir
		const upCount = fromParts.length - commonLength;
		const downParts = toParts.slice(commonLength);

		let relativePath = '';

		// Add ../ for each level we need to go up
		if (upCount > 0) {
			relativePath = '../'.repeat(upCount);
		}

		// Add the path down to the target directory
		if (downParts.length > 0) {
			relativePath += downParts.join('/') + '/';
		}

		// Add the filename
		relativePath += fileName;

		return relativePath;
	}

	/**
	 * Called when a custom editor is opened
	 */
	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Configure webview
		// Include document directory and ALL workspace folders for loading images
		const documentDir = vscode.Uri.joinPath(document.uri, '..');

		// Build localResourceRoots: extension media + document dir + parent dirs + all workspace folders
		const localResourceRoots: vscode.Uri[] = [
			vscode.Uri.joinPath(this.context.extensionUri, 'media'),
			documentDir
		];

		// Add parent directories (up to 3 levels) to support ../ paths in images
		// This is important for remote environments where workspace structure may differ
		let parentDir = documentDir;
		for (let i = 0; i < 3; i++) {
			parentDir = vscode.Uri.joinPath(parentDir, '..');
			localResourceRoots.push(parentDir);
		}

		// Add all workspace folders (like markdown preview does)
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders) {
			for (const folder of workspaceFolders) {
				localResourceRoots.push(folder.uri);
			}
		}

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots
		};

		// Set initial HTML
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// Track document version to detect external changes
		let lastKnownVersion = document.version;
		// Track if we're waiting for our own edit to be applied
		let pendingVersion: number | null = null;

		// Get webview URIs for resolving image paths
		const resourceBaseUri = webviewPanel.webview.asWebviewUri(documentDir).toString();

		// Get workspace root URI for absolute paths (paths starting with /)
		let workspaceRootUri = resourceBaseUri; // default to document dir
		if (workspaceFolders && workspaceFolders.length > 0) {
			workspaceRootUri = webviewPanel.webview.asWebviewUri(workspaceFolders[0].uri).toString();
		}

		// Get workspace-relative path for better path resolution
		// This helps with resolving ../ paths correctly in remote environments
		let documentDirPath = vscode.workspace.asRelativePath(documentDir, false);

		// If asRelativePath returns an absolute path (starts with /), it means the document
		// is not within a workspace folder. In this case, extract just the directory name.
		if (documentDirPath.startsWith('/')) {
			// Get path segments and use the last one as the relative path
			const segments = documentDirPath.split('/').filter(s => s);
			documentDirPath = segments.length > 0 ? segments.join('/') : '';
		}

		// Debug logging for remote environments
		console.log('[Rich Editor] Document URI:', document.uri.toString());
		console.log('[Rich Editor] Document Dir:', documentDir.toString());
		console.log('[Rich Editor] Resource Base URI:', resourceBaseUri);
		console.log('[Rich Editor] Workspace Root URI:', workspaceRootUri);
		console.log('[Rich Editor] Document Dir Path (processed):', documentDirPath);
		console.log('[Rich Editor] Local Resource Roots:', localResourceRoots.map(r => r.toString()));

		// Send content to webview when ready
		const updateWebview = async (isInitialLoad = false) => {
			const content = document.getText();

			// Log content info for debugging (first 200 chars to see if image is there)
			console.log('[Rich Editor] updateWebview called, content length:', content.length, 'format:', this.format);
			console.log('[Rich Editor] Content preview:', content.substring(0, 200).replace(/\n/g, '\\n'));

			// Pre-resolve images to avoid 401 errors in remote environments
			const resolvedImages = await this.resolveImagesInContent(content, documentDir, this.format);

			console.log('[Rich Editor] Resolved images count:', Object.keys(resolvedImages).length);

			const message: ExtensionMessage = {
				type: 'load',
				content: content,
				format: this.format,
				resourceBaseUri: resourceBaseUri,
				workspaceRootUri: workspaceRootUri,
				documentDirPath: documentDirPath,
				documentDirUri: documentDir.toString(),
				resolvedImages: resolvedImages
			};
			webviewPanel.webview.postMessage(message);
			lastKnownVersion = document.version;

			// Always send a delayed refresh on initial load to handle race conditions
			// where document content might not be fully synchronized yet
			if (isInitialLoad) {
				setTimeout(async () => {
					// Re-read the document content in case it changed
					const refreshedContent = document.getText();
					console.log('[Rich Editor] Delayed refresh, content length:', refreshedContent.length);

					// Only send refresh if content is different or if we have images to resolve
					if (refreshedContent !== content || refreshedContent.includes('#image') || refreshedContent.includes('![')) {
						const refreshedImages = await this.resolveImagesInContent(refreshedContent, documentDir, this.format);
						console.log('[Rich Editor] Delayed refresh found images:', Object.keys(refreshedImages).length);

						const refreshMessage: ExtensionMessage = {
							type: 'load',
							content: refreshedContent,
							format: this.format,
							resourceBaseUri: resourceBaseUri,
							workspaceRootUri: workspaceRootUri,
							documentDirPath: documentDirPath,
							documentDirUri: documentDir.toString(),
							resolvedImages: refreshedImages
						};
						webviewPanel.webview.postMessage(refreshMessage);
					}
				}, 200);
			}
		};

		// Handle messages from webview
		webviewPanel.webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case 'ready':
						// Webview is ready, send content
						// Delay to ensure document content is fully synchronized
						// This is important for remote environments where document loading may be async
						setTimeout(async () => {
							await updateWebview(true); // true = initial load
						}, 100);
						// Send theme
						this.sendTheme(webviewPanel.webview);
						break;

					case 'update':
						// Content changed in webview, update document
						if (message.content !== undefined && message.content !== document.getText()) {
							// Mark that we're about to change the document
							pendingVersion = document.version;
							const edit = new vscode.WorkspaceEdit();
							edit.replace(
								document.uri,
								new vscode.Range(0, 0, document.lineCount, 0),
								message.content
							);
							await vscode.workspace.applyEdit(edit);
							// Update our tracked version to the new one
							lastKnownVersion = document.version;
							pendingVersion = null;
						}
						break;

					case 'save':
						// Save the document
						await document.save();
						break;

					case 'requestLink': {
						// Show input box for URL
						const url = await vscode.window.showInputBox({
							prompt: 'Enter URL',
							placeHolder: 'https://example.com',
							validateInput: (value) => {
								if (!value) {
									return 'URL is required';
								}
								return null;
							}
						});
						if (url) {
							const linkMessage: ExtensionMessage = {
								type: 'setLink',
								url
							};
							webviewPanel.webview.postMessage(linkMessage);
						}
						break;
					}

					case 'openLink': {
						// Open link in external browser
						if (message.url) {
							vscode.env.openExternal(vscode.Uri.parse(message.url));
						}
						break;
					}

					case 'editLink': {
						// Edit existing link
						const newUrl = await vscode.window.showInputBox({
							prompt: 'Edit URL',
							value: message.url || '',
							placeHolder: 'https://example.com'
						});
						if (newUrl !== undefined) {
							const editLinkMessage: ExtensionMessage = {
								type: 'setLink',
								url: newUrl
							};
							webviewPanel.webview.postMessage(editLinkMessage);
						}
						break;
					}

					case 'requestImage': {
						// Show file picker for images
						const result = await vscode.window.showOpenDialog({
							canSelectFiles: true,
							canSelectFolders: false,
							canSelectMany: false,
							filters: {
								'Images': ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
							},
							title: 'Select Image',
							defaultUri: documentDir
						});
						if (result && result[0]) {
							const selectedFile = result[0];
							const fileName = selectedFile.path.split('/').pop() || selectedFile.path;

							// In VS Code web, file picker returns incomplete paths
							// Try to find the actual file in the workspace
							let actualImageUri: vscode.Uri | undefined;
							let relativePath = fileName;

							// Search for the file in workspace
							const files = await vscode.workspace.findFiles(`**/${fileName}`, null, 10);

							if (files.length === 1) {
								// Found exactly one match - use it
								actualImageUri = files[0];
							} else if (files.length > 1) {
								// Multiple matches - let user choose
								const items = files.map(f => ({
									label: vscode.workspace.asRelativePath(f),
									uri: f
								}));
								const selected = await vscode.window.showQuickPick(items, {
									placeHolder: 'Multiple images found. Select the correct one:'
								});
								if (selected) {
									actualImageUri = selected.uri;
								}
							}

							if (actualImageUri) {
								// Calculate relative path from document to image
								relativePath = this.calculateRelativePath(documentDir, actualImageUri);
							} else {
								// Fallback: assume same directory
								actualImageUri = vscode.Uri.joinPath(documentDir, fileName);
							}

							const webviewUri = webviewPanel.webview.asWebviewUri(actualImageUri);

							const imageMessage: ExtensionMessage = {
								type: 'setImage',
								src: webviewUri.toString(),
								alt: relativePath
							};
							webviewPanel.webview.postMessage(imageMessage);
						}
						break;
					}

					case 'requestTable': {
						// Show quick pick for table size
						const sizeOptions = [
							{ label: '2×2', rows: 2, cols: 2 },
							{ label: '3×3', rows: 3, cols: 3 },
							{ label: '3×4', rows: 3, cols: 4 },
							{ label: '4×4', rows: 4, cols: 4 },
							{ label: '5×5', rows: 5, cols: 5 },
							{ label: 'Custom...', rows: 0, cols: 0 }
						];

						const selected = await vscode.window.showQuickPick(
							sizeOptions.map(o => o.label),
							{ placeHolder: 'Select table size' }
						);

						if (selected) {
							let rows = 0, cols = 0;
							const option = sizeOptions.find(o => o.label === selected);

							if (option?.label === 'Custom...') {
								// Ask for custom dimensions
								const rowsInput = await vscode.window.showInputBox({
									prompt: 'Number of rows',
									value: '3',
									validateInput: v => isNaN(parseInt(v)) || parseInt(v) < 1 ? 'Enter a valid number' : null
								});
								if (!rowsInput) { break; }

								const colsInput = await vscode.window.showInputBox({
									prompt: 'Number of columns',
									value: '3',
									validateInput: v => isNaN(parseInt(v)) || parseInt(v) < 1 ? 'Enter a valid number' : null
								});
								if (!colsInput) { break; }

								rows = parseInt(rowsInput);
								cols = parseInt(colsInput);
							} else if (option) {
								rows = option.rows;
								cols = option.cols;
							}

							if (rows > 0 && cols > 0) {
								const tableMessage: ExtensionMessage = {
									type: 'insertTable',
									rows,
									cols
								};
								webviewPanel.webview.postMessage(tableMessage);
							}
						}
						break;
					}

					case 'requestMathInline': {
						// Show input box for inline math
						const formatHint = this.format === 'typst' ? 'Typst math' : 'LaTeX';
						const placeholder = this.format === 'typst' ? 'x^2 + y^2 = z^2' : 'x^2 + y^2 = z^2';
						const mathContent = await vscode.window.showInputBox({
							prompt: `Enter ${formatHint} equation (inline)`,
							placeHolder: placeholder,
							validateInput: (value) => {
								if (!value) {
									return 'Math content is required';
								}
								return null;
							}
						});
						if (mathContent) {
							const mathMessage: ExtensionMessage = {
								type: 'setMathInline',
								content: mathContent
							};
							webviewPanel.webview.postMessage(mathMessage);
						}
						break;
					}

					case 'requestMathBlock': {
						// Show input box for block math
						const formatHint = this.format === 'typst' ? 'Typst math' : 'LaTeX';
						const placeholder = this.format === 'typst'
							? 'integral(0, infinity, e^(-x^2), x)'
							: '\\int_0^\\infty e^{-x^2} dx';
						const mathContent = await vscode.window.showInputBox({
							prompt: `Enter ${formatHint} equation (display/block)`,
							placeHolder: placeholder,
							validateInput: (value) => {
								if (!value) {
									return 'Math content is required';
								}
								return null;
							}
						});
						if (mathContent) {
							const mathMessage: ExtensionMessage = {
								type: 'setMathBlock',
								content: mathContent
							};
							webviewPanel.webview.postMessage(mathMessage);
						}
						break;
					}

					case 'requestCodeBlock': {
						// Show language picker for code block
						const languages = [
							{ label: 'Plain Text', value: 'plaintext' },
							{ label: 'JavaScript', value: 'javascript' },
							{ label: 'TypeScript', value: 'typescript' },
							{ label: 'Python', value: 'python' },
							{ label: 'Java', value: 'java' },
							{ label: 'C', value: 'c' },
							{ label: 'C++', value: 'cpp' },
							{ label: 'C#', value: 'csharp' },
							{ label: 'Go', value: 'go' },
							{ label: 'Rust', value: 'rust' },
							{ label: 'Ruby', value: 'ruby' },
							{ label: 'PHP', value: 'php' },
							{ label: 'Swift', value: 'swift' },
							{ label: 'Kotlin', value: 'kotlin' },
							{ label: 'HTML', value: 'html' },
							{ label: 'CSS', value: 'css' },
							{ label: 'SCSS', value: 'scss' },
							{ label: 'JSON', value: 'json' },
							{ label: 'XML', value: 'xml' },
							{ label: 'YAML', value: 'yaml' },
							{ label: 'Markdown', value: 'markdown' },
							{ label: 'LaTeX', value: 'latex' },
							{ label: 'SQL', value: 'sql' },
							{ label: 'Shell/Bash', value: 'bash' },
							{ label: 'PowerShell', value: 'powershell' },
							{ label: 'Dockerfile', value: 'dockerfile' },
							{ label: 'Makefile', value: 'makefile' }
						];

						const selected = await vscode.window.showQuickPick(
							languages.map(l => ({ label: l.label, description: l.value })),
							{ placeHolder: 'Select language for code block' }
						);

						if (selected) {
							const language = languages.find(l => l.label === selected.label)?.value || 'plaintext';
							const codeMessage: ExtensionMessage = {
								type: 'setCodeBlock',
								language
							};
							webviewPanel.webview.postMessage(codeMessage);
						}
						break;
					}

					case 'pasteImage':
					case 'dropImage': {
						// Handle pasted/dropped image data
						if (message.imageData && message.mimeType) {
							try {
								// Determine file extension from MIME type
								const extMap: Record<string, string> = {
									'image/png': 'png',
									'image/jpeg': 'jpg',
									'image/gif': 'gif',
									'image/webp': 'webp',
									'image/svg+xml': 'svg'
								};
								const ext = extMap[message.mimeType] || 'png';

								// Generate filename
								const timestamp = Date.now();
								const suggestedName = message.imageName || `image-${timestamp}.${ext}`;
								const fileName = suggestedName.includes('.') ? suggestedName : `${suggestedName}.${ext}`;

								// Ask user for save location (default to document directory)
								const saveUri = await vscode.window.showSaveDialog({
									defaultUri: vscode.Uri.joinPath(documentDir, fileName),
									filters: {
										'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
									},
									title: 'Save Image'
								});

								if (saveUri) {
									// Decode base64 to Uint8Array (works in both Node.js and browser)
									const binaryString = atob(message.imageData);
									const bytes = new Uint8Array(binaryString.length);
									for (let i = 0; i < binaryString.length; i++) {
										bytes[i] = binaryString.charCodeAt(i);
									}
									await vscode.workspace.fs.writeFile(saveUri, bytes);

									// Refresh the file explorer to show the new file
									await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

									// Calculate relative path from document to saved image
									const relativePath = this.calculateRelativePath(documentDir, saveUri);
									const webviewUri = webviewPanel.webview.asWebviewUri(saveUri);

									// Send back to webview
									const imageMessage: ExtensionMessage = {
										type: 'setImage',
										src: webviewUri.toString(),
										alt: relativePath
									};
									webviewPanel.webview.postMessage(imageMessage);
								}
							} catch (error) {
								vscode.window.showErrorMessage(`Failed to save image: ${error}`);
							}
						}
						break;
					}
				}
			},
			undefined,
			this.context.subscriptions
		);

		// Update webview ONLY when document changes externally (e.g., from source editor)
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				// Ignore if this is our own pending edit
				if (pendingVersion !== null) {
					return;
				}
				// Only update if the version changed from something other than our last update
				if (document.version !== lastKnownVersion) {
					updateWebview();
				}
			}
		});

		// Listen for theme changes
		const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
			this.sendTheme(webviewPanel.webview);
		});

		// Cleanup when panel is closed
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
			themeChangeSubscription.dispose();
		});
	}

	/**
	 * Send current theme to webview
	 */
	private sendTheme(webview: vscode.Webview): void {
		const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
			? 'dark'
			: 'light';

		const message: ExtensionMessage = {
			type: 'setTheme',
			theme
		};
		webview.postMessage(message);
	}

	/**
	 * Generate HTML for the webview
	 */
	protected getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js')
		);

		// KaTeX CSS for offline-first math rendering
		const katexCssUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'katex', 'katex.min.css')
		);

		const nonce = this.getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		style-src ${webview.cspSource} 'unsafe-inline';
		script-src 'nonce-${nonce}';
		img-src ${webview.cspSource} https: data:;
		font-src ${webview.cspSource};
	">
	<title>Rich Editor</title>
	<!-- KaTeX CSS for math rendering (offline-first, bundled locally) -->
	<link rel="stylesheet" href="${katexCssUri}">
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif);
			font-size: var(--vscode-font-size, 14px);
			color: var(--vscode-editor-foreground, #333);
			background-color: var(--vscode-editor-background, #fff);
			line-height: 1.6;
			padding: 0;
			margin: 0;
			height: 100vh;
			overflow: hidden;
		}

		.editor-container {
			display: flex;
			flex-direction: column;
			height: 100vh;
		}

		.toolbar {
			display: flex;
			align-items: center;
			gap: 4px;
			padding: 8px 12px;
			background: var(--vscode-editor-background, #fff);
			border-bottom: 1px solid var(--vscode-panel-border, #e0e0e0);
			flex-wrap: wrap;
		}

		.toolbar-button {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 28px;
			height: 28px;
			border: none;
			background: transparent;
			border-radius: 4px;
			cursor: pointer;
			color: var(--vscode-editor-foreground, #333);
			font-size: 12px;
			font-weight: 600;
		}

		.toolbar-button svg {
			width: 16px;
			height: 16px;
			fill: currentColor;
			stroke: currentColor;
		}

		.toolbar-button:hover {
			background: var(--vscode-toolbar-hoverBackground, rgba(0,0,0,0.1));
		}

		.toolbar-button.active {
			background: var(--vscode-toolbar-activeBackground, rgba(0,0,0,0.15));
		}

		.toolbar-separator {
			width: 1px;
			height: 20px;
			background: var(--vscode-panel-border, #e0e0e0);
			margin: 0 4px;
		}

		/* TipTap editor styles */
		.ProseMirror {
			outline: none;
			min-height: 100%;
		}

		.ProseMirror > * + * {
			margin-top: 0.75em;
		}

		.ProseMirror h1 {
			font-size: 2em;
			font-weight: 600;
			margin-top: 1em;
			margin-bottom: 0.5em;
		}

		.ProseMirror h2 {
			font-size: 1.5em;
			font-weight: 600;
			margin-top: 1em;
			margin-bottom: 0.5em;
		}

		.ProseMirror h3 {
			font-size: 1.25em;
			font-weight: 600;
			margin-top: 1em;
			margin-bottom: 0.5em;
		}

		.ProseMirror p {
			margin: 0.5em 0;
		}

		.ProseMirror ul,
		.ProseMirror ol {
			padding-left: 1.5em;
			margin: 0.5em 0;
		}

		.ProseMirror li {
			margin: 0.25em 0;
		}

		/* Task list styles */
		ul[data-type="taskList"] {
			list-style: none;
			padding: 0;
			margin: 0.5em 0;
		}

		ul[data-type="taskList"] li {
			display: flex;
			align-items: center;
			margin: 0.25em 0;
		}

		ul[data-type="taskList"] li label {
			margin-right: 0.5em;
			display: inline-flex;
			align-items: center;
		}

		ul[data-type="taskList"] li label input[type="checkbox"] {
			cursor: pointer;
			width: 16px;
			height: 16px;
			margin: 0;
			accent-color: var(--vscode-checkbox-foreground, #007acc);
		}

		ul[data-type="taskList"] li div p {
			margin: 0;
			display: inline;
		}

		.ProseMirror blockquote {
			border-left: 3px solid var(--vscode-textBlockQuote-border, #ddd);
			padding-left: 1em;
			margin: 0.5em 0;
			color: var(--vscode-textBlockQuote-foreground, #666);
		}

		.ProseMirror code {
			background: var(--vscode-textCodeBlock-background, #f0f0f0);
			padding: 0.2em 0.4em;
			border-radius: 3px;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.9em;
		}

		.ProseMirror pre {
			background: var(--vscode-textCodeBlock-background, #f0f0f0);
			padding: 1em;
			border-radius: 4px;
			overflow-x: auto;
			margin: 0.5em 0;
			position: relative;
		}

		.ProseMirror pre code {
			background: none;
			padding: 0;
		}

		/* Code block language label */
		.ProseMirror pre[data-language]::before {
			content: attr(data-language);
			position: absolute;
			top: 4px;
			right: 8px;
			font-size: 10px;
			font-family: var(--vscode-font-family, sans-serif);
			color: var(--vscode-descriptionForeground, #666);
			text-transform: uppercase;
			opacity: 0.7;
		}

		/* Syntax highlighting styles (compatible with lowlight/highlight.js) */
		.hljs-comment,
		.hljs-quote {
			color: var(--vscode-editorLineNumber-foreground, #6a9955);
			font-style: italic;
		}

		.hljs-keyword,
		.hljs-selector-tag,
		.hljs-addition {
			color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
		}

		.hljs-number,
		.hljs-string,
		.hljs-meta .hljs-meta-string,
		.hljs-literal,
		.hljs-doctag,
		.hljs-regexp {
			color: var(--vscode-debugTokenExpression-string, #ce9178);
		}

		.hljs-title,
		.hljs-section,
		.hljs-name,
		.hljs-selector-id,
		.hljs-selector-class {
			color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
		}

		.hljs-attribute,
		.hljs-attr,
		.hljs-variable,
		.hljs-template-variable,
		.hljs-class .hljs-title,
		.hljs-type {
			color: var(--vscode-symbolIcon-variableForeground, #9cdcfe);
		}

		.hljs-symbol,
		.hljs-bullet,
		.hljs-subst,
		.hljs-meta,
		.hljs-meta .hljs-keyword,
		.hljs-selector-attr,
		.hljs-selector-pseudo,
		.hljs-link {
			color: var(--vscode-symbolIcon-constantForeground, #4ec9b0);
		}

		.hljs-built_in,
		.hljs-deletion {
			color: var(--vscode-symbolIcon-classForeground, #c586c0);
		}

		.hljs-formula {
			background: var(--vscode-editor-selectionBackground, rgba(0,120,215,0.1));
		}

		.hljs-emphasis {
			font-style: italic;
		}

		.hljs-strong {
			font-weight: bold;
		}

		.ProseMirror a {
			color: var(--vscode-textLink-foreground, #0066cc);
			text-decoration: underline;
		}

		.ProseMirror a:hover {
			color: var(--vscode-textLink-activeForeground, #0044aa);
		}

		.ProseMirror img {
			max-width: 100%;
			height: auto;
		}

		.ProseMirror hr {
			border: none;
			border-top: 1px solid var(--vscode-panel-border, #e0e0e0);
			margin: 1em 0;
		}

		/* Table styles */
		.ProseMirror table {
			border-collapse: collapse;
			margin: 1em 0;
			width: 100%;
			table-layout: fixed;
			overflow: hidden;
		}

		.ProseMirror table td,
		.ProseMirror table th {
			border: 1px solid var(--vscode-panel-border, #e0e0e0);
			padding: 8px 12px;
			vertical-align: top;
			min-width: 80px;
			position: relative;
		}

		.ProseMirror table th {
			background-color: var(--vscode-editor-inactiveSelectionBackground, #f0f0f0);
			font-weight: 600;
			text-align: left;
		}

		.ProseMirror table td p,
		.ProseMirror table th p {
			margin: 0;
		}

		/* Selected cell */
		.ProseMirror table .selectedCell::after {
			z-index: 2;
			position: absolute;
			content: "";
			left: 0;
			right: 0;
			top: 0;
			bottom: 0;
			background: var(--vscode-editor-selectionBackground, rgba(0, 120, 215, 0.2));
			pointer-events: none;
		}

		/* Column resize handle */
		.ProseMirror .column-resize-handle {
			position: absolute;
			right: -2px;
			top: 0;
			bottom: -2px;
			width: 4px;
			background-color: var(--vscode-focusBorder, #007acc);
			pointer-events: none;
		}

		.ProseMirror.resize-cursor {
			cursor: col-resize;
		}

		.ProseMirror p.is-editor-empty:first-child::before {
			content: attr(data-placeholder);
			float: left;
			color: var(--vscode-input-placeholderForeground, #999);
			pointer-events: none;
			height: 0;
		}

		/* Math styles - KaTeX rendered (Markdown) */
		.math-inline.math-rendered {
			display: inline-block;
			padding: 0 2px;
			cursor: pointer;
		}

		.math-inline.math-rendered:hover {
			background: var(--vscode-editor-selectionBackground, rgba(0,120,215,0.15));
			border-radius: 3px;
		}

		.math-block.math-rendered {
			display: block;
			text-align: center;
			padding: 16px;
			margin: 16px 0;
			cursor: pointer;
		}

		.math-block.math-rendered:hover {
			background: var(--vscode-editor-selectionBackground, rgba(0,120,215,0.1));
			border-radius: 4px;
		}

		/* Math styles - raw text (Typst) */
		.math-inline.math-raw {
			display: inline;
			font-family: "Times New Roman", "Cambria Math", Georgia, serif;
			font-style: italic;
			padding: 0 4px;
			background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.05));
			border-radius: 3px;
			cursor: pointer;
		}

		.math-inline.math-raw::before {
			content: "$";
			font-style: normal;
			opacity: 0.5;
		}

		.math-inline.math-raw::after {
			content: "$";
			font-style: normal;
			opacity: 0.5;
		}

		.math-inline.math-raw:hover {
			background: var(--vscode-editor-selectionBackground, rgba(0,120,215,0.2));
		}

		.math-block.math-raw {
			display: block;
			font-family: "Times New Roman", "Cambria Math", Georgia, serif;
			font-style: italic;
			font-size: 1.2em;
			text-align: center;
			padding: 16px;
			margin: 16px 0;
			background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.03));
			border-radius: 4px;
			cursor: pointer;
			white-space: pre-wrap;
		}

		.math-block.math-raw::before {
			content: "$";
			display: block;
			font-style: normal;
			font-size: 0.8em;
			opacity: 0.5;
			margin-bottom: 4px;
		}

		.math-block.math-raw::after {
			content: "$";
			display: block;
			font-style: normal;
			font-size: 0.8em;
			opacity: 0.5;
			margin-top: 4px;
		}

		.math-block.math-raw:hover {
			background: var(--vscode-editor-selectionBackground, rgba(0,120,215,0.1));
		}

		/* Math error */
		.math-error {
			color: var(--vscode-errorForeground, #f44336);
			font-family: monospace;
			background: var(--vscode-inputValidation-errorBackground, rgba(244,67,54,0.1));
			padding: 2px 4px;
			border-radius: 3px;
		}

		/* KaTeX fallback styles (in case CDN CSS doesn't load) */
		.math-rendered .katex {
			font-size: 1.1em;
			font-family: KaTeX_Main, "Times New Roman", serif;
			line-height: 1.2;
			white-space: nowrap;
			text-indent: 0;
		}

		.math-rendered .katex .mord,
		.math-rendered .katex .mop,
		.math-rendered .katex .mbin,
		.math-rendered .katex .mrel,
		.math-rendered .katex .mopen,
		.math-rendered .katex .mclose,
		.math-rendered .katex .mpunct,
		.math-rendered .katex .minner {
			display: inline-block;
		}

		.math-rendered .katex .mfrac {
			display: inline-block;
			vertical-align: middle;
			text-align: center;
		}

		.math-rendered .katex .mfrac .frac-line {
			border-bottom: 1px solid currentColor;
			display: block;
			margin: 0.1em 0;
		}

		.math-rendered .katex sup,
		.math-rendered .katex .msupsub .vlist-t {
			font-size: 0.75em;
			vertical-align: super;
		}

		.math-rendered .katex sub,
		.math-rendered .katex .msupsub .vlist-t2 {
			font-size: 0.75em;
			vertical-align: sub;
		}

		.math-block.math-rendered .katex {
			font-size: 1.3em;
		}

		.statusbar {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 4px 12px;
			background: var(--vscode-statusBar-background, #f5f5f5);
			border-top: 1px solid var(--vscode-panel-border, #e0e0e0);
			font-size: 12px;
			color: var(--vscode-statusBar-foreground, #666);
		}

		.statusbar-left {
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.statusbar-right {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		/* View mode buttons */
		.mode-buttons {
			display: flex;
			align-items: center;
			gap: 2px;
			background: var(--vscode-input-background, #f0f0f0);
			border-radius: 4px;
			padding: 2px;
		}

		.mode-button {
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 3px 8px;
			border: none;
			background: transparent;
			border-radius: 3px;
			cursor: pointer;
			color: var(--vscode-foreground, #333);
			font-size: 11px;
			font-weight: 500;
			transition: background-color 0.15s, color 0.15s;
		}

		.mode-button:hover {
			background: var(--vscode-toolbar-hoverBackground, rgba(0,0,0,0.1));
		}

		.mode-button.active {
			background: var(--vscode-button-background, #007acc);
			color: var(--vscode-button-foreground, #fff);
		}

		.mode-button svg {
			width: 14px;
			height: 14px;
			margin-right: 4px;
		}

		/* Editor panes container */
		.editors-container {
			display: flex;
			flex: 1;
			overflow: hidden;
		}

		.editor-content {
			flex: 1;
			overflow-y: auto;
			padding: 20px 40px;
			position: relative;
		}

		/* Source editor */
		.source-editor {
			flex: 1;
			overflow: hidden;
			display: none;
		}

		.source-editor textarea {
			width: 100%;
			height: 100%;
			border: none;
			outline: none;
			resize: none;
			padding: 20px 40px;
			font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
			font-size: var(--vscode-editor-font-size, 14px);
			line-height: 1.5;
			background: var(--vscode-editor-background, #fff);
			color: var(--vscode-editor-foreground, #333);
			tab-size: 4;
		}

		/* Split view divider */
		.split-divider {
			width: 4px;
			background: var(--vscode-panel-border, #e0e0e0);
			cursor: col-resize;
			display: none;
		}

		.split-divider:hover {
			background: var(--vscode-focusBorder, #007acc);
		}

		/* View modes */
		.editor-container[data-mode="wysiwyg"] .editor-content {
			display: block;
		}
		.editor-container[data-mode="wysiwyg"] .source-editor {
			display: none;
		}
		.editor-container[data-mode="wysiwyg"] .split-divider {
			display: none;
		}
		.editor-container[data-mode="wysiwyg"] .toolbar {
			display: flex;
		}

		.editor-container[data-mode="source"] .editor-content {
			display: none;
		}
		.editor-container[data-mode="source"] .source-editor {
			display: block;
		}
		.editor-container[data-mode="source"] .split-divider {
			display: none;
		}
		.editor-container[data-mode="source"] .toolbar {
			display: none;
		}

		.editor-container[data-mode="split"] .editor-content {
			display: block;
			flex: 1;
		}
		.editor-container[data-mode="split"] .source-editor {
			display: block;
			flex: 1;
		}
		.editor-container[data-mode="split"] .split-divider {
			display: block;
		}
		.editor-container[data-mode="split"] .toolbar {
			display: flex;
		}

		.loading {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			color: var(--vscode-descriptionForeground, #666);
		}

		/* Drag & drop overlay */
		.editor-content.drag-over {
			background: var(--vscode-editor-selectionBackground, rgba(0, 120, 215, 0.1));
			outline: 2px dashed var(--vscode-focusBorder, #007acc);
			outline-offset: -4px;
		}

		.editor-content.drag-over::after {
			content: 'Drop image here';
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			font-size: 16px;
			color: var(--vscode-focusBorder, #007acc);
			pointer-events: none;
		}

	</style>
</head>
<body>
	<div class="editor-container" data-mode="wysiwyg">
		<div class="toolbar" id="toolbar">
			<button class="toolbar-button" data-command="bold" title="Bold (Cmd+B)"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M4 2.5A.5.5 0 0 1 4.5 2h5.25a2.75 2.75 0 0 1 1.85 4.787A3.001 3.001 0 0 1 10.5 14H4.5a.5.5 0 0 1-.5-.5v-11zM6 8v4h4.5a1.5 1.5 0 0 0 0-3H6zm0-2h3.75a1.25 1.25 0 0 0 0-2.5H6V6z"/></svg></button>
			<button class="toolbar-button" data-command="italic" title="Italic (Cmd+I)"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M6 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-2.5l-3 10H9.5a.5.5 0 0 1 0 1h-6a.5.5 0 0 1 0-1H6L9 3H6.5a.5.5 0 0 1-.5-.5z"/></svg></button>
			<button class="toolbar-button" data-command="strike" title="Strikethrough"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M8 1a4 4 0 0 0-3.8 2.745.5.5 0 1 0 .949.316A3 3 0 0 1 8 2c1.236 0 2.239.74 2.694 1.8a.5.5 0 0 0 .924-.384A4 4 0 0 0 8 1zM1.5 7.5a.5.5 0 0 0 0 1h13a.5.5 0 0 0 0-1h-13zM8 15a4 4 0 0 0 3.8-2.745.5.5 0 0 0-.949-.316A3 3 0 0 1 8 14c-1.236 0-2.239-.74-2.694-1.8a.5.5 0 0 0-.924.384A4 4 0 0 0 8 15z"/></svg></button>
			<button class="toolbar-button" data-command="code" title="Inline Code"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M5.854 4.146a.5.5 0 0 1 0 .708L2.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0zm4.292 0a.5.5 0 0 0 0 .708L13.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0z"/></svg></button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="heading1" title="Heading 1">H1</button>
			<button class="toolbar-button" data-command="heading2" title="Heading 2">H2</button>
			<button class="toolbar-button" data-command="heading3" title="Heading 3">H3</button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="bulletList" title="Bullet List"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm1 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm2-9.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1h-10a.5.5 0 0 1-.5-.5zm0 5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1h-10a.5.5 0 0 1-.5-.5zm0 5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1h-10a.5.5 0 0 1-.5-.5z"/></svg></button>
			<button class="toolbar-button" data-command="orderedList" title="Numbered List">1.</button>
			<button class="toolbar-button" data-command="taskList" title="Task List"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M11.354 5.646a.5.5 0 0 1 0 .708l-3.5 3.5a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 8.793l3.146-3.147a.5.5 0 0 1 .708 0z"/><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
			<button class="toolbar-button" data-command="blockquote" title="Quote"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M3.5 4A1.5 1.5 0 0 0 2 5.5v3A1.5 1.5 0 0 0 3.5 10H4v1.5a.5.5 0 0 0 .82.384l2.048-1.703.158-.131H7.5A1.5 1.5 0 0 0 9 8.5v-3A1.5 1.5 0 0 0 7.5 4h-4zm6 0a1.5 1.5 0 0 0-1.5 1.5v3A1.5 1.5 0 0 0 9.5 10h.5v1.5a.5.5 0 0 0 .82.384l2.048-1.703.158-.131h.474a1.5 1.5 0 0 0 1.5-1.5v-3A1.5 1.5 0 0 0 13.5 4h-4z"/></svg></button>
			<button class="toolbar-button" data-command="codeBlock" title="Code Block"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M14 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path fill="currentColor" d="M6.854 4.646a.5.5 0 0 1 0 .708L4.207 8l2.647 2.646a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 0 1 .708 0zm2.292 0a.5.5 0 0 0 0 .708L11.793 8l-2.647 2.646a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708 0z"/></svg></button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="link" title="Link (Cmd+K)"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M4.715 6.542L3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1 1 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/><path fill="currentColor" d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.586-.586a1 1 0 0 0 .154-.199 2 2 0 0 1-.861-3.337L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 0 0-4.243-4.243L6.586 4.672z"/></svg></button>
			<button class="toolbar-button" data-command="image" title="Insert Image"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/><path fill="currentColor" d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/></svg></button>
			<button class="toolbar-button" data-command="insertTable" title="Insert Table"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm1 3v2h4V5H1zm0 3v2h4V8H1zm0 3v1a1 1 0 0 0 1 1h3v-2H1zm5-6v2h4V5H6zm0 3v2h4V8H6zm0 3v2h4v-2H6zm5-6v2h3V5h-3zm0 3v2h3V8h-3zm0 3v1a1 1 0 0 0 1 1h2v-2h-3z"/></svg></button>
			<button class="toolbar-button" data-command="horizontalRule" title="Horizontal Rule"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8z"/></svg></button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="mathInline" title="Inline Math ($...$)"><svg viewBox="0 0 16 16" fill="none" stroke="none"><text x="2" y="12" font-size="10" font-style="italic" fill="currentColor">&#8721;</text></svg></button>
			<button class="toolbar-button" data-command="mathBlock" title="Block Math ($$...$$)"><svg viewBox="0 0 16 16" fill="none" stroke="none"><text x="1" y="12" font-size="9" font-style="italic" fill="currentColor">&#8747;dx</text></svg></button>
			<div class="toolbar-separator"></div>
			<button class="toolbar-button" data-command="undo" title="Undo (Cmd+Z)"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/><path fill="currentColor" d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/></svg></button>
			<button class="toolbar-button" data-command="redo" title="Redo (Cmd+Shift+Z)"><svg viewBox="0 0 16 16" fill="none" stroke="none"><path fill="currentColor" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path fill="currentColor" d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg></button>
		</div>
		<div class="editors-container">
			<div class="editor-content" id="editor">
				<div class="loading">Loading editor...</div>
			</div>
			<div class="split-divider" id="split-divider"></div>
			<div class="source-editor" id="source-editor">
				<textarea id="source-textarea" spellcheck="false"></textarea>
			</div>
		</div>
		<div class="statusbar">
			<div class="statusbar-left">
				<span id="status-left">Ready</span>
			</div>
			<div class="statusbar-right">
				<span id="status-right"></span>
				<div class="mode-buttons">
					<button class="mode-button active" data-mode="wysiwyg" title="Rich Text Editor">
						<svg viewBox="0 0 16 16" fill="none"><path fill="currentColor" d="M2 2h12v12H2V2zm1 1v10h10V3H3zm1 1h8v1H4V4zm0 2h8v1H4V6zm0 2h5v1H4V8z"/></svg>
						Rich
					</button>
					<button class="mode-button" data-mode="source" title="Source Code">
						<svg viewBox="0 0 16 16" fill="none"><path fill="currentColor" d="M5.854 4.146a.5.5 0 0 1 0 .708L2.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0zm4.292 0a.5.5 0 0 0 0 .708L13.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0z"/></svg>
						Source
					</button>
					<button class="mode-button" data-mode="split" title="Split View">
						<svg viewBox="0 0 16 16" fill="none"><path fill="currentColor" d="M2 2h12v12H2V2zm1 1v10h4V3H3zm5 0v10h5V3H8z"/></svg>
						Split
					</button>
				</div>
			</div>
		</div>
	</div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	/**
	 * Generate a random nonce for CSP
	 */
	protected getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}

