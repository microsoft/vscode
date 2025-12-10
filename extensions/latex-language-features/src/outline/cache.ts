/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { Root } from '@unified-latex/unified-latex-types';
import { OutputChannelLogger } from '../utils/logger';
import { parseLaTeX } from './parser/unified';

/**
 * File cache entry
 * Ported from latex-workshop cache system
 * Now uses URI strings as identifiers for web compatibility
 */
export interface FileCache {
	filePath: string;  // URI string or file path
	content: string;
	contentTrimmed: string;
	ast?: Root;
	elements: Record<string, unknown>;
	children: Array<{ index: number; filePath: string }>;
}

const caches = new Map<string, FileCache>();
const promises = new Map<string, Promise<void>>();

let logger: OutputChannelLogger | undefined;

export function initializeCache(log: OutputChannelLogger): void {
	logger = log;
}

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
 * Check if a file can be cached
 */
function canCache(filePath: string): boolean {
	const ext = getExtension(filePath);
	return ['.tex', '.ltx'].includes(ext) && !filePath.includes('expl3-code.tex');
}

/**
 * Check if a file should be excluded from caching
 */
function isExcluded(filePath: string): boolean {
	const config = vscode.workspace.getConfiguration('latex');
	const globsToIgnore = config.get<string[]>('watch.files.ignore', []);
	if (globsToIgnore.length === 0) {
		return false;
	}
	// Simple glob matching - normalize path separators
	// Use path.posix for cross-platform compatibility (webpack polyfills process.platform)
	const normalizedPath = filePath.replace(/\\/g, '/');
	return globsToIgnore.some(pattern => {
		// Simple pattern matching - full glob support would require micromatch
		if (pattern.includes('**')) {
			const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
			return regex.test(normalizedPath);
		}
		return normalizedPath.includes(pattern);
	});
}

/**
 * Get cache for a file
 */
export function get(filePath: string): FileCache | undefined {
	return caches.get(filePath);
}

/**
 * Get all cached file paths
 */
export function paths(): string[] {
	return Array.from(caches.keys());
}

/**
 * Wait for a file to be cached
 */
export async function wait(filePath: string, seconds = 2): Promise<void | undefined> {
	let waited = 0;
	while (promises.get(filePath) === undefined && get(filePath) === undefined) {
		await new Promise(resolve => setTimeout(resolve, 100));
		waited++;
		if (waited >= seconds * 10) {
			logger?.warn(`Error loading cache: ${filePath}. Forcing.`);
			await refreshCache(filePath);
			break;
		}
	}
	return promises.get(filePath);
}

/**
 * Refresh cache for a file (file:// scheme)
 * For web environments, use refreshCacheFromDocument instead
 */
export async function refreshCache(filePathOrUri: string): Promise<void | undefined> {
	if (isExcluded(filePathOrUri)) {
		logger?.info(`File is excluded from caching: ${filePathOrUri}`);
		return;
	}
	if (!canCache(filePathOrUri)) {
		logger?.info(`File cannot be cached: ${filePathOrUri}`);
		return;
	}

	logger?.info(`Caching ${filePathOrUri}`);

	// Read file content
	let content = '';
	try {
		// Try to find the document in open editors first
		const openEditor = vscode.workspace.textDocuments.find(
			doc => doc.uri.toString() === filePathOrUri || doc.uri.fsPath === filePathOrUri
		);

		if (openEditor) {
			content = openEditor.getText();
		} else {
			// Parse as URI or create file URI
			const uri = filePathOrUri.includes('://')
				? vscode.Uri.parse(filePathOrUri)
				: vscode.Uri.file(filePathOrUri);
			const fileData = await vscode.workspace.fs.readFile(uri);
			content = new TextDecoder('utf-8').decode(fileData);
		}
	} catch (error) {
		logger?.error(`Failed to read file ${filePathOrUri}: ${error}`);
		return;
	}

	// Create file cache
	const fileCache: FileCache = {
		filePath: filePathOrUri,
		content,
		contentTrimmed: stripCommentsAndVerbatim(content),
		elements: {},
		children: []
	};

	caches.set(filePathOrUri, fileCache);

	// Update AST - ensure it completes before returning
	const promise = updateAST(fileCache).then(() => {
		promises.delete(filePathOrUri);
		logger?.info(`AST parsing completed for ${filePathOrUri}`);
	}).catch((error) => {
		promises.delete(filePathOrUri);
		logger?.error(`AST parsing failed for ${filePathOrUri}: ${error}`);
		throw error;
	});

	promises.set(filePathOrUri, promise);
	// Wait for AST to be ready
	await promise;
	return promise;
}

/**
 * Refresh cache directly from a TextDocument (for web environments)
 * This avoids file system operations that don't work in web
 */
export async function refreshCacheFromDocument(document: vscode.TextDocument): Promise<void | undefined> {
	const docId = document.uri.toString();

	if (!canCache(docId)) {
		logger?.info(`Document cannot be cached: ${docId}`);
		return;
	}

	logger?.info(`Caching document ${docId}`);

	const content = document.getText();

	// Create file cache
	const fileCache: FileCache = {
		filePath: docId,
		content,
		contentTrimmed: stripCommentsAndVerbatim(content),
		elements: {},
		children: []
	};

	caches.set(docId, fileCache);

	// Update AST - ensure it completes before returning
	const promise = updateAST(fileCache).then(() => {
		promises.delete(docId);
		logger?.info(`AST parsing completed for ${docId}`);
	}).catch((error) => {
		promises.delete(docId);
		logger?.error(`AST parsing failed for ${docId}: ${error}`);
		throw error;
	});

	promises.set(docId, promise);
	// Wait for AST to be ready
	await promise;
	return promise;
}

/**
 * Update AST for a file cache
 */
async function updateAST(fileCache: FileCache): Promise<void> {
	logger?.info(`Parse LaTeX AST: ${fileCache.filePath}`);
	const start = performance.now();
	try {
		fileCache.ast = await parseLaTeX(fileCache.content);
		const elapsed = performance.now() - start;
		logger?.info(`Parsed LaTeX AST in ${elapsed.toFixed(2)} ms: ${fileCache.filePath}`);
	} catch (error) {
		logger?.error(`Failed to parse AST for ${fileCache.filePath}: ${error}`);
	}
}

/**
 * Strip comments and verbatim sections from LaTeX content
 * Simplified version - full implementation would handle more cases
 */
function stripCommentsAndVerbatim(content: string): string {
	// Remove comments (lines starting with %)
	let result = content.replace(/^[ \t]*%.*$/gm, '');

	// Remove verbatim environments (simplified)
	result = result.replace(/\\begin\{verbatim\}[\s\S]*?\\end\{verbatim\}/gi, '');
	result = result.replace(/\\begin\{lstlisting\}[\s\S]*?\\end\{lstlisting\}/gi, '');

	return result;
}

/**
 * Reset cache
 */
export function reset(): void {
	caches.clear();
	promises.clear();
}

