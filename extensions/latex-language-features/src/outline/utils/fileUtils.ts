/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Get file extension from a path or URI string
 * Works with both file paths and URI strings
 */
function getExtension(pathOrUri: string): string {
	// Handle URI strings by extracting path component
	const pathPart = pathOrUri.includes('://') ? pathOrUri.split('?')[0] : pathOrUri;
	const lastDot = pathPart.lastIndexOf('.');
	const lastSlash = Math.max(pathPart.lastIndexOf('/'), pathPart.lastIndexOf('\\'));
	if (lastDot > lastSlash && lastDot !== -1) {
		return pathPart.substring(lastDot);
	}
	return '';
}

/**
 * Get basename from a path or URI string
 * Works with both file paths and URI strings
 */
function getBasename(pathOrUri: string): string {
	// Handle URI strings by extracting path component
	const pathPart = pathOrUri.includes('://') ? pathOrUri.split('?')[0] : pathOrUri;
	const lastSlash = Math.max(pathPart.lastIndexOf('/'), pathPart.lastIndexOf('\\'));
	return lastSlash !== -1 ? pathPart.substring(lastSlash + 1) : pathPart;
}

/**
 * Get filename without extension from a path or URI string
 */
function getNameWithoutExt(pathOrUri: string): string {
	const basename = getBasename(pathOrUri);
	const ext = getExtension(basename);
	return ext ? basename.slice(0, -ext.length) : basename;
}

/**
 * Check if a path is absolute (works for both file paths and URIs)
 */
function isAbsolutePath(pathOrUri: string): boolean {
	// URI with scheme is considered absolute
	if (pathOrUri.includes('://')) {
		return true;
	}
	// Unix absolute path
	if (pathOrUri.startsWith('/')) {
		return true;
	}
	// Windows absolute path
	if (/^[a-zA-Z]:[\\/]/.test(pathOrUri)) {
		return true;
	}
	return false;
}

/**
 * Get directory name from a path or URI string
 * Works with both file paths and URI strings
 */
export function getDirname(pathOrUri: string): string {
	if (!pathOrUri) {
		return '';
	}

	// Handle URI strings
	if (pathOrUri.includes('://')) {
		try {
			const uri = vscode.Uri.parse(pathOrUri);
			const pathParts = uri.path.split('/').filter(p => p);
			if (pathParts.length > 0) {
				pathParts.pop();
			}
			return uri.with({ path: '/' + pathParts.join('/') }).toString();
		} catch {
			// Fall through to simple string handling
		}
	}

	// Simple string-based dirname
	const normalizedPath = pathOrUri.replace(/\\/g, '/');
	const lastSlash = normalizedPath.lastIndexOf('/');
	return lastSlash !== -1 ? normalizedPath.substring(0, lastSlash) : '';
}

/**
 * Join path segments
 * Works with both file paths and URI strings
 */
export function joinPath(base: string, ...segments: string[]): string {
	if (!base) {
		return segments.join('/');
	}

	// Handle URI strings
	if (base.includes('://')) {
		try {
			const uri = vscode.Uri.parse(base);
			return vscode.Uri.joinPath(uri, ...segments).toString();
		} catch {
			// Fall through to simple string handling
		}
	}

	// Simple string-based join
	let result = base.replace(/\\/g, '/').replace(/\/$/, '');
	for (const segment of segments) {
		const cleanSegment = segment.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '');
		if (cleanSegment) {
			result += '/' + cleanSegment;
		}
	}
	return result;
}

/**
 * Resolve file path from multiple search directories
 * Ported from latex-workshop utils
 * Browser-compatible version using vscode.workspace.findFiles instead of glob
 */
export async function resolveFile(searchDirs: string[], fileName: string): Promise<string | undefined> {
	// Remove extension if present
	const nameWithoutExt = getNameWithoutExt(fileName);
	const ext = getExtension(fileName) || '.tex';

	// Try with and without extension
	const candidates = [
		fileName,
		`${nameWithoutExt}${ext}`,
		`${nameWithoutExt}.tex`
	];

	for (const candidate of candidates) {
		// Try absolute path first
		if (isAbsolutePath(candidate)) {
			try {
				const uri = candidate.includes('://')
					? vscode.Uri.parse(candidate)
					: vscode.Uri.file(candidate);
				await vscode.workspace.fs.stat(uri);
				return uri.toString();
			} catch {
				// File doesn't exist
			}
		}

		// Try relative to search directories
		for (const dir of searchDirs) {
			if (!dir) {
				continue;
			}

			const fullPath = joinPath(dir, candidate);
			try {
				const uri = fullPath.includes('://')
					? vscode.Uri.parse(fullPath)
					: vscode.Uri.file(fullPath);
				await vscode.workspace.fs.stat(uri);
				return uri.toString();
			} catch {
				// File doesn't exist, try searching with findFiles (browser-compatible)
				try {
					const baseName = getBasename(candidate);
					// Only use findFiles for workspace-relative paths
					const workspaceFolders = vscode.workspace.workspaceFolders;
					if (workspaceFolders) {
						const pattern = `**/${baseName}`;
						const matches = await vscode.workspace.findFiles(pattern, null, 1);
						if (matches.length > 0) {
							return matches[0].toString();
						}
					}
				} catch {
					// Search failed
				}
			}
		}
	}

	return undefined;
}

/**
 * Sanitize input file path
 * Ported from latex-workshop inputfilepath
 */
export function sanitizeInputFilePath(filePath: string): string {
	// Remove quotes
	let sanitized = filePath.replace(/^["']|["']$/g, '');

	// Normalize path separators
	sanitized = sanitized.replace(/\\/g, '/');

	// Remove leading/trailing whitespace
	sanitized = sanitized.trim();

	return sanitized;
}

